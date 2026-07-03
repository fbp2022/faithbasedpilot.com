import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { getWhoopBle, type LiveHR, type StrapConnectionState } from '@/lib/whoop-ble';
import { getLiveRmssdMs } from '@/lib/whoop';

const HEART_RED = '#ff6b6b';

/**
 * A compact "live from your strap" card. Only renders once a live-HR reading
 * has arrived from BLE. Shows the current bpm plus, when the strap emits it,
 * the most recent R-R interval — WHOOP straps do broadcast R-R intervals on
 * the standard HR characteristic, which is what makes true HRV possible in
 * a later stage without touching WHOOP's cloud.
 */
export function LiveHRCard() {
  const router = useRouter();
  const ble = getWhoopBle();
  const [hr, setHr] = useState<LiveHR | null>(ble.getLastHR());
  const [state, setState] = useState<StrapConnectionState>(ble.getState());
  const [rmssd, setRmssd] = useState<number | null>(getLiveRmssdMs());

  useEffect(() => {
    const offHR = ble.onHR((v) => {
      setHr(v);
      setRmssd(getLiveRmssdMs());
    });
    const offState = ble.onState((s) => setState(s));
    return () => {
      offHR();
      offState();
    };
  }, [ble]);

  const isConnected = state === 'connected';
  if (!isConnected && !hr) return null;

  const staleMs = hr ? Date.now() - hr.timestamp : Infinity;
  const stale = staleMs > 8_000;

  return (
    <Pressable style={styles.card} onPress={() => router.push('/whoop-connect' as never)}>
      <View style={styles.head}>
        <View style={styles.iconChip}>
          <Ionicons name="heart" size={16} color={HEART_RED} />
        </View>
        <Text style={styles.label}>Live from your WHOOP strap</Text>
        <View style={styles.pill}>
          <View
            style={[
              styles.pillDot,
              { backgroundColor: isConnected && !stale ? '#3ddc97' : '#ffb454' },
            ]}
          />
          <Text style={styles.pillText}>
            {isConnected && !stale ? 'Live' : stale ? 'Waiting…' : 'Reconnecting…'}
          </Text>
        </View>
      </View>
      <View style={styles.valueRow}>
        <Text style={[styles.value, stale && { opacity: 0.55 }]}>
          {hr ? Math.round(hr.bpm) : '—'}
        </Text>
        <Text style={styles.unit}>bpm</Text>
        {rmssd != null ? (
          <View style={styles.hrvChip}>
            <Text style={styles.hrvChipLabel}>HRV</Text>
            <Text style={styles.hrvChipValue}>{Math.round(rmssd)} ms</Text>
          </View>
        ) : null}
      </View>
      {hr?.rrIntervalsMs && hr.rrIntervalsMs.length > 0 ? (
        <Text style={styles.rr}>
          Latest R-R: {Math.round(hr.rrIntervalsMs[hr.rrIntervalsMs.length - 1])} ms
          {rmssd != null ? '  ·  computed locally from R-R intervals' : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141a22',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#1f2a3d',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconChip: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${HEART_RED}22`,
    marginRight: 10,
  },
  label: {
    flex: 1,
    color: '#8aa0b4',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: '#1c242e',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  pillText: { color: '#c2cfdb', fontSize: 11, fontWeight: '700' },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  value: {
    color: '#f5f7fa',
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 46,
  },
  unit: {
    color: '#8aa0b4',
    fontSize: 14,
    marginLeft: 8,
    marginBottom: 6,
    fontWeight: '600',
  },
  rr: {
    color: '#6c8094',
    fontSize: 12,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  hrvChip: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#1c242e',
    alignItems: 'flex-end',
  },
  hrvChipLabel: {
    color: '#8aa0b4',
    fontSize: 10,
    letterSpacing: 0.6,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  hrvChipValue: {
    color: '#f5f7fa',
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
});
