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

import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/src/store/theme';
import { getSettings, saveSettings } from '@/src/store/settings';
import { apiService } from '@/src/services/api';
import type { AppSettings, OutputMode, ThemeMode } from '@/src/types';

const OUTPUT_MODES: { label: string; value: OutputMode; description: string }[] = [
  {
    label: 'Auto',
    value: 'auto',
    description: 'Speak via TTS if Bluetooth earbuds detected, otherwise notify',
  },
  {
    label: 'Always TTS',
    value: 'tts',
    description: 'Always speak contact names aloud',
  },
  {
    label: 'Always Notify',
    value: 'notification',
    description: 'Always send a push notification',
  },
];

export default function SettingsScreen() {
  const { colorScheme, setThemeMode } = useAppTheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const actionBg = isDark ? '#2D7FF9' : colors.tint;
  const actionFg = '#FFFFFF';
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleThemeModeChange = async (mode: ThemeMode) => {
    await setThemeMode(mode);
    setSettings((s) => (s ? { ...s, themeMode: mode } : s));
  };

  const handleSave = async () => {
    if (!settings) return;
    const saved = await saveSettings(settings);
    apiService.setSettings(saved);
    // Reconnect with new server URL
    apiService.disconnect();
    apiService.connect();
    Alert.alert('Saved', 'Settings saved. Reconnecting to server.');
  };

  if (!settings) return null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      {/* ── Server ── */}
      <Text style={[styles.section, { color: colors.icon }]}>SERVER</Text>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Server URL</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.icon + '55' }]}
          value={settings.serverUrl}
          onChangeText={(v) => setSettings((s) => s && { ...s, serverUrl: v })}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.100:5000"
          placeholderTextColor={colors.icon}
        />
      </View>

      {/* ── Recognition ── */}
      <Text style={[styles.section, { color: colors.icon }]}>RECOGNITION</Text>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Cooldown (minutes)</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.icon + '55' }]}
          value={String(settings.cooldownMinutes)}
          onChangeText={(v) =>
            setSettings((s) => s && { ...s, cooldownMinutes: parseInt(v, 10) || 60 })
          }
          keyboardType="number-pad"
          placeholderTextColor={colors.icon}
        />
        <Text style={[styles.hint, { color: colors.icon }]}>
          Same contact won't be announced again within this window.
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text }]}>Confidence Threshold</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.icon + '55' }]}
          value={String(settings.confidenceThreshold)}
          onChangeText={(v) =>
            setSettings((s) => s && { ...s, confidenceThreshold: parseFloat(v) || 0.9 })
          }
          keyboardType="decimal-pad"
          placeholderTextColor={colors.icon}
        />
        <Text style={[styles.hint, { color: colors.icon }]}>
          0.0–1.0. Higher = stricter matching (default 0.9).
        </Text>
      </View>

      {/* ── Audio Output ── */}
      <Text style={[styles.section, { color: colors.icon }]}>AUDIO OUTPUT</Text>

      {OUTPUT_MODES.map((mode) => {
        const selected = settings.outputMode === mode.value;
        return (
          <TouchableOpacity
            key={mode.value}
            style={[styles.radioRow, { borderColor: colors.icon + '33' }]}
            onPress={() => setSettings((s) => s && { ...s, outputMode: mode.value })}
            activeOpacity={0.7}>
            <View
              style={[
                styles.radioOuter,
                { borderColor: actionBg },
                selected && { backgroundColor: actionBg },
              ]}>
              {selected && <View style={styles.radioInner} />}
            </View>
            <View style={styles.radioTextBlock}>
              <Text style={[styles.radioLabel, { color: colors.text }]}>{mode.label}</Text>
              <Text style={[styles.radioDesc, { color: colors.icon }]}>{mode.description}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* ── Appearance ── */}
      <Text style={[styles.section, { color: colors.icon }]}>APPEARANCE</Text>

      <View style={[styles.themeRow, { borderColor: colors.icon + '33' }]}>
        <TouchableOpacity
          style={[
            styles.themeOption,
            { borderColor: colors.icon + '66' },
            settings.themeMode === 'light' && { backgroundColor: actionBg, borderColor: actionBg },
          ]}
          onPress={() => handleThemeModeChange('light')}
          activeOpacity={0.8}>
          <Text
            style={[
              styles.themeOptionText,
              { color: colors.text },
              settings.themeMode === 'light' && { color: actionFg },
            ]}>
            Light
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.themeOption,
            { borderColor: colors.icon + '66' },
            settings.themeMode === 'dark' && { backgroundColor: actionBg, borderColor: actionBg },
          ]}
          onPress={() => handleThemeModeChange('dark')}
          activeOpacity={0.8}>
          <Text
            style={[
              styles.themeOptionText,
              { color: colors.text },
              settings.themeMode === 'dark' && { color: actionFg },
            ]}>
            Dark
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: actionBg }]}
        onPress={handleSave}
        activeOpacity={0.85}>
        <Text style={[styles.saveBtnText, { color: actionFg }]}>Save Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },
  section: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 28,
    marginBottom: 6,
    marginHorizontal: 16,
  },
  field: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  radioTextBlock: { flex: 1 },
  radioLabel: { fontSize: 15, fontWeight: '600' },
  radioDesc: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  themeRow: {
    marginHorizontal: 16,
    marginTop: 4,
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  themeOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  themeOptionText: { fontSize: 14, fontWeight: '700' },
  saveBtn: {
    marginHorizontal: 16,
    marginTop: 32,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: { fontWeight: '700', fontSize: 16 },
});
