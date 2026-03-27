import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';

import { Colors, Space, Radius, Type, Shadow } from '@/constants/theme';
import { useAppTheme } from '@/src/store/theme';
import { getSettings, saveSettings } from '@/src/store/settings';
import type { AppSettings, OutputMode, ThemeMode } from '@/src/types';

const OUTPUT_MODES: { label: string; value: OutputMode; description: string }[] = [
  { label: 'Automatic',          value: 'auto',         description: 'TTS when Bluetooth earbuds are connected, push notification otherwise' },
  { label: 'Always TTS',    value: 'tts',          description: 'Always speak contact names aloud' },
  { label: 'Always Notify', value: 'notification', description: 'Always send a push notification' },
];

export default function SettingsScreen() {
  const { colorScheme, setThemeMode } = useAppTheme();
  const c = Colors[colorScheme ?? 'light'];
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => { getSettings().then(setSettings); }, []);

  const handleTheme = async (mode: ThemeMode) => {
    await setThemeMode(mode);
    setSettings((s) => (s ? { ...s, themeMode: mode } : s));
  };

  const handleOutputMode = async (mode: OutputMode) => {
    setSettings((s) => s && { ...s, outputMode: mode });
    await saveSettings({ outputMode: mode });
  };

  if (!settings) return null;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}>

      {/* ── Audio Output ── */}
      <Text style={[styles.sectionLabel, { color: c.textSub }]}>AUDIO OUTPUT</Text>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }, Shadow.sm]}>
        {OUTPUT_MODES.map((mode, idx) => {
          const selected = settings.outputMode === mode.value;
          return (
            <TouchableOpacity
              key={mode.value}
              style={[
                styles.radioRow,
                idx < OUTPUT_MODES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
              ]}
              onPress={() => handleOutputMode(mode.value)}
              activeOpacity={0.7}>
              <View style={[styles.radioOuter, { borderColor: c.tint }, selected && { backgroundColor: c.tint }]}>
                {selected && <View style={styles.radioInner} />}
              </View>
              <View style={styles.radioTextBlock}>
                <Text style={[styles.radioLabel, { color: c.text }]}>{mode.label}</Text>
                <Text style={[styles.radioDesc,  { color: c.textSub }]}>{mode.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Appearance ── */}
      <Text style={[styles.sectionLabel, { color: c.textSub }]}>APPEARANCE</Text>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }, Shadow.sm]}>
        <View style={styles.themeRow}>
          {(['light', 'dark'] as ThemeMode[]).map((mode) => {
            const active = settings.themeMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.themeChip,
                  { borderColor: c.border, backgroundColor: c.surfaceAlt },
                  active && { backgroundColor: c.tint, borderColor: c.tint },
                ]}
                onPress={() => handleTheme(mode)}
                activeOpacity={0.8}>
                <Text style={[styles.themeChipText, { color: c.textSub }, active && { color: '#fff' }]}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  content: { paddingBottom: Space.xxl },

  sectionLabel: {
    ...Type.label,
    marginTop: Space.lg,
    marginBottom: Space.xs + 2,
    marginHorizontal: Space.md,
  },

  group: {
    marginHorizontal: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.sm,
  },

  // Radio
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Space.sm + 2,
    gap: Space.md,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  radioTextBlock: { flex: 1 },
  radioLabel: { ...Type.bodyBold },
  radioDesc:  { ...Type.caption, marginTop: 2, lineHeight: 18 },

  // Theme
  themeRow: { flexDirection: 'row', gap: Space.sm },
  themeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Space.sm + 2,
    alignItems: 'center',
  },
  themeChipText: { fontSize: 14, fontWeight: '700' },

});
