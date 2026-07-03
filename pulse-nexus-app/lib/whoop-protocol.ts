/**
 * WHOOP strap on-wire protocol primitives.
 *
 * This module holds the *verifiable, non-proprietary* building blocks for
 * talking to a WHOOP strap's own history buffer over Bluetooth: the CRC
 * checks the strap uses to frame its packets, plus a frame envelope
 * structure. It is the foundation of the strap-side history offload (the
 * "the WHOOP starts writing to this app" path) that complements the
 * account-export import in `lib/whoop-import.ts`.
 *
 * IMPORTANT — scope and honesty:
 *   The CRC algorithms and BLE service/characteristic UUIDs here are public
 *   protocol facts (documented by the community projects credited below and
 *   by the Bluetooth SIG). They are implemented from scratch and are
 *   unit-verifiable.
 *
 *   The exact *command opcodes*, packet field offsets, and the encrypted
 *   history-offload handshake are NOT fully pinned down in this file. They
 *   vary by strap generation and firmware, require an established GATT bond,
 *   and must be validated against real hardware. Those pieces are marked
 *   with `NEEDS_HARDWARE_VALIDATION` so they're easy to find and fill in
 *   from the community protocol documentation once a strap is available to
 *   test against. Nothing here fabricates decoded biometrics.
 *
 * References (protocol facts only; no source code copied):
 *   - johnmiddleton12/my-whoop — WHOOP 4.0 BLE framing (CRC8 poly 0x07,
 *     service 61080001-…)
 *   - b-nnett/goose — WHOOP 5.0 / MG framing (CRC16-Modbus, "puffin" packet
 *     types, service fd4b0001-…)
 *
 * Not affiliated with WHOOP, Inc.
 */

export type DeviceFamily = 'whoop4' | 'whoop5';

/**
 * CRC-8 with polynomial 0x07 (WHOOP 4.0 header check), MSB-first, init 0x00.
 * This is the standard "CRC-8/SMBUS"-style byte CRC. Verifiable: the check
 * value for the ASCII bytes "123456789" is 0xF4.
 */
export function crc8(bytes: Uint8Array | number[]): number {
  let crc = 0x00;
  for (const b of bytes) {
    crc ^= b & 0xff;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc & 0xff;
}

/**
 * CRC-16/MODBUS (WHOOP 5.0 / MG header check): poly 0x8005 reflected, init
 * 0xFFFF, no final XOR. Verifiable: the check value for "123456789" is
 * 0x4B37.
 */
export function crc16Modbus(bytes: Uint8Array | number[]): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b & 0xff;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x0001 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

/**
 * CRC-32 (zlib / ISO-HDLC): poly 0xEDB88320 reflected, init 0xFFFFFFFF,
 * final XOR 0xFFFFFFFF. WHOOP uses this for whole-packet integrity on
 * reassembled historical streams. Verifiable: CRC-32 of "123456789" is
 * 0xCBF43926.
 */
export function crc32(bytes: Uint8Array | number[]): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b & 0xff;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function headerCrcOk(family: DeviceFamily, header: Uint8Array, expected: number): boolean {
  return family === 'whoop4' ? crc8(header) === expected : crc16Modbus(header) === expected;
}

/**
 * A decoded frame envelope. `payload` is the inner bytes after the header
 * and CRC have been stripped and verified. The `type` field is the packet
 * type byte; interpreting it into biometrics is generation- and
 * firmware-specific (see NEEDS_HARDWARE_VALIDATION below).
 */
export type WhoopFrame = {
  type: number;
  seq: number | null;
  payload: Uint8Array;
  crcOk: boolean;
};

/**
 * Generic length-prefixed frame reader. WHOOP straps deliver history as a
 * stream of framed packets over a notify characteristic; a single logical
 * packet can span multiple BLE notifications, so callers accumulate bytes
 * and repeatedly call this to pull out complete frames.
 *
 * Frame layout implemented here (the common shape across both generations):
 *   [ SOF(1)=0xAA ][ len(2, LE) ][ type(1) ][ payload(len-… ) ][ crc(1|2) ]
 *
 * The SOF byte, length width, and CRC width below are the documented
 * defaults, but the precise header field order for a given firmware still
 * NEEDS_HARDWARE_VALIDATION — hence this returns crcOk so the caller can
 * decide whether to trust a frame before decoding its payload.
 */
export function readFrames(
  buffer: Uint8Array,
  family: DeviceFamily,
): { frames: WhoopFrame[]; consumed: number } {
  const SOF = 0xaa;
  const crcWidth = family === 'whoop4' ? 1 : 2;
  const frames: WhoopFrame[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (buffer[offset] !== SOF) {
      offset++;
      continue;
    }
    if (offset + 4 > buffer.length) break; // need SOF + len(2) + type(1)
    const len = buffer[offset + 1] | (buffer[offset + 2] << 8);
    const frameEnd = offset + 3 + len + crcWidth;
    if (frameEnd > buffer.length) break; // incomplete; wait for more bytes

    const type = buffer[offset + 3];
    const payload = buffer.slice(offset + 4, offset + 3 + len);
    const header = buffer.slice(offset, offset + 3 + len);
    let expected = 0;
    if (crcWidth === 1) {
      expected = buffer[frameEnd - 1];
    } else {
      expected = buffer[frameEnd - 2] | (buffer[frameEnd - 1] << 8);
    }
    frames.push({
      type,
      seq: null,
      payload,
      crcOk: headerCrcOk(family, header, expected),
    });
    offset = frameEnd;
  }

  return { frames, consumed: offset };
}

/**
 * NEEDS_HARDWARE_VALIDATION — history-offload command opcodes.
 *
 * These are the commands the app would write to the strap's control
 * characteristic to request its stored history and acknowledge received
 * pages. The real opcodes and argument layout are generation/firmware
 * specific and must be confirmed against a physical strap and the community
 * protocol docs before enabling offload. They are intentionally left as
 * placeholders (0x00) so nothing sends a guessed command to real hardware.
 */
export const OFFLOAD_COMMANDS = {
  whoop4: {
    requestHistory: 0x00, // NEEDS_HARDWARE_VALIDATION
    ackPage: 0x00, // NEEDS_HARDWARE_VALIDATION
    endOffload: 0x00, // NEEDS_HARDWARE_VALIDATION
  },
  whoop5: {
    requestHistory: 0x00, // NEEDS_HARDWARE_VALIDATION
    ackPage: 0x00, // NEEDS_HARDWARE_VALIDATION
    endOffload: 0x00, // NEEDS_HARDWARE_VALIDATION
  },
} as const;

export function offloadCommandsReady(family: DeviceFamily): boolean {
  const cmds = OFFLOAD_COMMANDS[family];
  return cmds.requestHistory !== 0x00 && cmds.endOffload !== 0x00;
}
