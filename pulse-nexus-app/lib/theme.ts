/**
 * Pulse Nexus visual system — palette + spacing derived from the app icon
 * (chrome R, cyan-blue ring on matte black). Keep this the single source of
 * truth for colors so the UI stays consistent as we add screens.
 */

export const colors = {
  bg: '#070b14',
  bgElevated: '#0f1522',
  bgCard: '#141b2a',
  bgCardMuted: '#1a2333',
  border: '#1f2a3d',
  borderStrong: '#2a3752',

  text: '#f2f5fa',
  textMuted: '#8fa3bd',
  textDim: '#5f7590',

  accent: '#4ac6ff',
  accentDeep: '#1e88ff',
  accentGlow: 'rgba(74, 198, 255, 0.18)',

  positive: '#3ddc97',
  warn: '#ffb454',
  danger: '#ff6b6b',

  whoop: '#1a9d8f',
  fitbit: '#00b0b9',
  garmin: '#0d6efd',
  apple: '#ff375f',
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
