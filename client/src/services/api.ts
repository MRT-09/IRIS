import type { AppSettings, DetectionEvent } from '../types';

type EventHandler = (event: DetectionEvent) => void;
type StatusHandler = (connected: boolean) => void;

class ApiService {
  private abortController: AbortController | null = null;
  private eventHandlers = new Set<EventHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _settings: AppSettings | null = null;
  private _connected = false;

  setSettings(settings: AppSettings): void {
    this._settings = settings;
  }

  private get baseUrl(): string {
    return this._settings?.serverUrl ?? 'http://192.168.1.100:8000';
  }

  get isConnected(): boolean {
    return this._connected;
  }

  connect(): void {
    this.clearReconnect();
    this._startSSE();
  }

  // SSE over fetch — one-directional server→client push.
  // Simpler than WebSocket on the Pi and works over plain HTTP/1.1.
  private async _startSSE(): Promise<void> {
    this.abortController = new AbortController();

    try {
      const response = await fetch(`${this.baseUrl}/api/notify/events`, {
        signal: this.abortController.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      this._connected = true;
      this.notifyStatus(true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
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
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    }

    this._connected = false;
    this.notifyStatus(false);
    this.scheduleReconnect();
  }

  disconnect(): void {
    this.clearReconnect();
    this.abortController?.abort();
    this.abortController = null;
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
