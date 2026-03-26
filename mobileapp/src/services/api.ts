import type { AppSettings, DetectionEvent } from '../types';

type EventHandler = (event: DetectionEvent) => void;
type StatusHandler = (connected: boolean) => void;

class ApiService {
  private ws: WebSocket | null = null;
  private eventHandlers = new Set<EventHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _settings: AppSettings | null = null;
  private _connected = false;

  setSettings(settings: AppSettings): void {
    this._settings = settings;
  }

  private get baseUrl(): string {
    return this._settings?.serverUrl ?? 'http://192.168.1.100:5000';
  }

  private get wsUrl(): string {
    return this.baseUrl.replace(/^http/, 'ws') + '/events';
  }

  get isConnected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.clearReconnect();

    try {
      const ws = new WebSocket(this.wsUrl);

      ws.onopen = () => {
        this._connected = true;
        this.notifyStatus(true);
      };

      ws.onmessage = (e) => {
        try {
          const event: DetectionEvent = JSON.parse(e.data);
          if (event.type === 'contact_detected') {
            this.eventHandlers.forEach((h) => h(event));
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        this._connected = false;
        this.notifyStatus(false);
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        this._connected = false;
        this.notifyStatus(false);
      };

      this.ws = ws;
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.clearReconnect();
    this.ws?.close();
    this.ws = null;
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

  async syncContact(contactId: string, name: string, imageBase64s: string[]): Promise<{ embeddings_count: number }> {
    const res = await fetch(`${this.baseUrl}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId, name, images: imageBase64s }),
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  }

  async deleteContact(contactId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/contacts/${contactId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) throw new Error(`Server error: ${res.status}`);
  }

  async listContacts(): Promise<Array<{ contact_id: string; name: string }>> {
    const res = await fetch(`${this.baseUrl}/contacts`);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res.json();
  }
}

export const apiService = new ApiService();
