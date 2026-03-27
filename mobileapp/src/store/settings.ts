import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings } from '../types';

const SETTINGS_KEY = '@iris_settings';

const _ip = process.env.EXPO_PUBLIC_SERVER_IP ?? '192.168.1.100';
const _port = process.env.EXPO_PUBLIC_SERVER_PORT ?? '5000';

export const DEFAULT_SERVER_URL = `http://${_ip}:${_port}`;

export const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: DEFAULT_SERVER_URL,
  cooldownMinutes: 60,
  confidenceThreshold: 0.9,
  outputMode: 'auto',
  themeMode: 'light',
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}
