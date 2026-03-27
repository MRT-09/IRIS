import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';

import { Colors, Space, Radius, Type, Shadow } from '@/constants/theme';
import { useAppTheme } from '@/src/store/theme';
import { getSettings, saveSettings } from '@/src/store/settings';
import { apiService } from '@/src/services/api';
import type { AppSettings, OutputMode, ThemeMode } from '@/src/types';

const OUTPUT_MODES: { label: string; value: OutputMode; description: string }[] = [
  { label: 'Auto',          value: 'auto',         description: 'TTS when Bluetooth earbuds are connected, push notification otherwise' },
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

  const handleSave = async () => {
    if (!settings) return;
    const saved = await saveSettings(settings);
    apiService.setSettings(saved);
    apiService.disconnect();
    apiService.connect();
    Alert.alert('Saved', 'Settings saved. Reconnecting to server.');
  };

  if (!settings) return null;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}>

      {/* ── Server ── */}
      <Text style={[styles.sectionLabel, { color: c.textSub }]}>SERVER</Text>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }, Shadow.sm]}>
        <Text style={[styles.fieldLabel, { color: c.text }]}>Server URL</Text>
        <TextInput
          style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
          value={settings.serverUrl}
          onChangeText={(v) => setSettings((s) => s && { ...s, serverUrl: v })}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.100:5000"
          placeholderTextColor={c.textSub}
        />
      </View>

      {/* ── Recognition ── */}
      <Text style={[styles.sectionLabel, { color: c.textSub }]}>RECOGNITION</Text>
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }, Shadow.sm]}>
        <View style={styles.fieldRow}>
          <View style={styles.fieldCol}>
            <Text style={[styles.fieldLabel, { color: c.text }]}>Cooldown (min)</Text>
            <TextInput
              style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
              value={String(settings.cooldownMinutes)}
              onChangeText={(v) => setSettings((s) => s && { ...s, cooldownMinutes: parseInt(v, 10) || 60 })}
              keyboardType="number-pad"
              placeholderTextColor={c.textSub}
            />
          </View>
          <View style={styles.fieldCol}>
            <Text style={[styles.fieldLabel, { color: c.text }]}>Confidence (0–1)</Text>
            <TextInput
              style={[styles.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
              value={String(settings.confidenceThreshold)}
              onChangeText={(v) => setSettings((s) => s && { ...s, confidenceThreshold: parseFloat(v) || 0.9 })}
              keyboardType="decimal-pad"
              placeholderTextColor={c.textSub}
            />
          </View>
        </View>
        <Text style={[styles.hint, { color: c.textSub }]}>
          Same contact won't be announced within the cooldown window. Higher confidence = stricter matching.
        </Text>
      </View>

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
              onPress={() => setSettings((s) => s && { ...s, outputMode: mode.value })}
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

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: c.tint }]}
        onPress={handleSave}
        activeOpacity={0.85}>
        <Text style={styles.saveBtnText}>Save Settings</Text>
      </TouchableOpacity>
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

  fieldRow: { flexDirection: 'row', gap: Space.md },
  fieldCol: { flex: 1, gap: Space.xs },

  fieldLabel: { ...Type.caption, fontWeight: '600' },

  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm + 1,
    fontSize: 15,
  },

  hint: { ...Type.caption, lineHeight: 18 },

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

  // Save button
  saveBtn: {
    marginHorizontal: Space.md,
    marginTop: Space.xl,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
