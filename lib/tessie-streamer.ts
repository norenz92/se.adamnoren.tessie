import { EventEmitter } from 'node:events';

class TessieStreamer extends EventEmitter {
  private ws: WebSocket | null = null;
  private vin: string;
  private token: string;
  private reconnectDelay: number = 1000;
  private maxReconnectDelay: number = 60000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected: boolean = false;
  private destroyed: boolean = false;

  constructor(vin: string, token: string) {
    super();
    this.vin = vin;
    this.token = token;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  connect(): void {
    const url = `wss://streaming.tessie.com/${this.vin}?access_token=${this.token}`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this._connected = true;
      this.reconnectDelay = 1000;
      this.emit('connected');
    });

    this.ws.addEventListener('message', (event: any) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.data) {
          this.emit('data', msg.data, msg.createdAt);
        }
        if (msg.status) {
          this.emit('connectivity', msg.status);
        }
      } catch (_e) {
        // Ignore JSON parse errors
      }
    });

    this.ws.addEventListener('close', () => {
      this._connected = false;
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.ws.addEventListener('error', () => {
      // No-op: close always follows error
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const jitter = Math.random() * 0.3 * this.reconnectDelay;
    const delay = this.reconnectDelay + jitter;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws != null) {
      // Remove close listener to prevent reconnect scheduling during destroy
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}

export = TessieStreamer;
