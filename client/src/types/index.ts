export interface Contact {
  id: string;
  name: string;
  created_at: string;
  synced: number;
}

export interface ContactImage {
  id: number;
  contact_id: string;
  image_uri: string;
}

export interface DetectionContact {
  contact_id: string;
  name: string;
  confidence: number;
}

export interface DetectionEvent {
  type: 'contact_detected';
  contacts: DetectionContact[];
  timestamp: string;
}

export type OutputMode = 'auto' | 'tts' | 'notification';
export type ThemeMode = 'light' | 'dark';

export interface AppSettings {
  serverUrl: string;
  cooldownMinutes: number;
  confidenceThreshold: number;
  outputMode: OutputMode;
  themeMode: ThemeMode;
}
