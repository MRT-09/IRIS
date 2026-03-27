import { Platform, StyleSheet } from 'react-native';

// ─── Accent ────────────────────────────────────────────────────────────────
const accentLight = '#0A7EA4';
const accentDark  = '#3B9ECC';

// ─── Palette ───────────────────────────────────────────────────────────────
export const Colors = {
  light: {
    // surfaces
    background: '#F7F8FA',
    surface:    '#FFFFFF',
    surfaceAlt: '#EFF1F5',
    // borders
    border:     '#E2E5EA',
    borderSoft: '#ECEFF3',
    // text
    text:       '#0F1114',
    textSub:    '#6B7280',
    // accent / interactive
    tint:       accentLight,
    // status
    success:    '#16A34A',
    error:      '#E53935',
    // legacy compat
    icon:           '#6B7280',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: accentLight,
  },
  dark: {
    background: '#0F1011',
    surface:    '#1A1C1E',
    surfaceAlt: '#232628',
    border:     '#2A2D30',
    borderSoft: '#242729',
    text:       '#EDEEF0',
    textSub:    '#8A9099',
    tint:       accentDark,
    success:    '#22C55E',
    error:      '#EF5350',
    icon:           '#8A9099',
    tabIconDefault: '#8A9099',
    tabIconSelected: accentDark,
  },
};

// ─── Spacing (4-pt grid) ───────────────────────────────────────────────────
export const Space = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// ─── Radii ─────────────────────────────────────────────────────────────────
export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
};

// ─── Typography ────────────────────────────────────────────────────────────
export const Type = {
  label:     { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8 },
  caption:   { fontSize: 12, fontWeight: '400' as const, lineHeight: 17 },
  body:      { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyBold:  { fontSize: 15, fontWeight: '600' as const },
  title:     { fontSize: 17, fontWeight: '700' as const },
  headline:  { fontSize: 20, fontWeight: '700' as const },
};

// ─── Elevation / Shadow ────────────────────────────────────────────────────
export const Shadow = {
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    android: { elevation: 2 },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.10,
      shadowRadius: 8,
    },
    android: { elevation: 5 },
    default: {},
  }),
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
