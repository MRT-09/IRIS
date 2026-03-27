import type { AppSettings, DetectionEvent } from '../types';
import { DEFAULT_SERVER_URL } from '../store/settings';

type EventHandler = (event: DetectionEvent) => void;
type StatusHandler = (connected: boolean) => void;

class ApiService {
  private _xhr: XMLHttpRequest | null = null;
  private eventHandlers = new Set<EventHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _settings: AppSettings | null = null;
  private _connected = false;

  setSettings(settings: AppSettings): void {
    this._settings = settings;
  }

  private get baseUrl(): string {
    return this._settings?.serverUrl ?? DEFAULT_SERVER_URL;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  connect(): void {
    this.clearReconnect();
    this._startSSE();
  }

  // SSE via XMLHttpRequest — React Native doesn't support response.body
  // as a ReadableStream, but XHR's onprogress fires as chunks arrive.
  private _startSSE(): void {
    const xhr = new XMLHttpRequest();
    this._xhr = xhr;

    let lastLength = 0;
    let buffer = '';

    xhr.open('GET', `${this.baseUrl}/api/notify/events`);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Cache-Control', 'no-cache');

    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(lastLength);
      lastLength = xhr.responseText.length;

      if (!this._connected) {
        this._connected = true;
        this.notifyStatus(true);
      }

      buffer += newData;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const event: DetectionEvent = JSON.parse(data);
            if (event.type === 'contact_detected') {
              this.eventHandlers.forEach((h) => h(event));
            }
          } catch {
            // ignore malformed frames
          }
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        this._connected = false;
        this.notifyStatus(false);
        this.scheduleReconnect();
      }
    };

    xhr.onerror = () => {
      this._connected = false;
      this.notifyStatus(false);
      this.scheduleReconnect();
    };

    xhr.send();
  }

  disconnect(): void {
    this.clearReconnect();
    this._xhr?.abort();
    this._xhr = null;
    this._connected = false;
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private notifyStatus(connected: boolean): void {
    this.statusHandlers.forEach((h) => h(connected));
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  async syncContact(contactId: string, name: string, imageBase64s: string[]): Promise<{ images_saved: number }> {
    const res = await fetch(`${this.baseUrl}/api/contacts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId, name, images: imageBase64s }),
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  }

  async deleteContact(contactId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/contacts/${contactId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) throw new Error(`Server error: ${res.status}`);
  }

  async listContacts(): Promise<Array<{ id: string; name: string }>> {
    const res = await fetch(`${this.baseUrl}/api/contacts/`);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  }

  async submitTraining(): Promise<{ contacts: number; embeddings: number; errors: string[] }> {
    const res = await fetch(`${this.baseUrl}/api/training/submit`, { method: 'POST' });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  }

  async getTrainingStatus(): Promise<{ state: string; contacts: number; embeddings: number }> {
    const res = await fetch(`${this.baseUrl}/api/training/status`);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  }
}

export const apiService = new ApiService();
