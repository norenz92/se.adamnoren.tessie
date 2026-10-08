import { EventEmitter } from 'node:events';

// If nothing arrives for this long, assume a half-open connection (e.g. NAT drop) and reconnect.
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const BASE_RECONNECT_DELAY_MS = 1000;

class TessieStreamer extends EventEmitter {
  private ws: WebSocket | null = null;
  private vin: string;
  private token: string;
  private reconnectDelay: number = BASE_RECONNECT_DELAY_MS;
  private maxReconnectDelay: number = 60000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
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
    if (this.destroyed) return;
    const url = `wss://streaming.tessie.com/${encodeURIComponent(this.vin)}?access_token=${encodeURIComponent(this.token)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (_err) {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    // Every handler checks the socket is still current: replaced/destroyed sockets must not act.
    ws.addEventListener('open', () => {
      if (ws !== this.ws) return;
      this._connected = true;
      this.armWatchdog();
      this.emit('connected');
    });

    ws.addEventListener('message', (event: any) => {
      if (ws !== this.ws) return;
      this.armWatchdog();
      // Only trust the connection once it delivers traffic; a server that accepts
      // and immediately closes (bad token, no telemetry) must still back off.
      this.reconnectDelay = BASE_RECONNECT_DELAY_MS;
      try {
        const msg = JSON.parse(event.data);
        if (Array.isArray(msg.data)) {
          this.emit('data', msg.data, msg.createdAt);
        }
        if (msg.status) {
          this.emit('connectivity', msg.status);
        }
      } catch (_e) {
        // Ignore JSON parse errors
      }
    });

    ws.addEventListener('close', () => {
      if (ws !== this.ws) return;
      this.handleDisconnect();
    });

    ws.addEventListener('error', () => {
      // No-op: close always follows error
    });
  }

  private handleDisconnect(): void {
    this.ws = null;
    this._connected = false;
    this.clearWatchdog();
    this.emit('disconnected');
    this.scheduleReconnect();
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      const stale = this.ws;
      this.handleDisconnect();
      try {
        stale?.close();
      } catch (_e) {
        // Socket may already be unusable
      }
    }, INACTIVITY_TIMEOUT_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer != null) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const jitter = Math.random() * 0.3 * this.reconnectDelay;
    const delay = this.reconnectDelay + jitter;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
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
    this.clearWatchdog();
    const ws = this.ws;
    // Detach first so the close event is ignored (no 'disconnected', no reconnect)
    this.ws = null;
    this._connected = false;
    try {
      ws?.close();
    } catch (_e) {
      // Ignore
    }
  }
}

export = TessieStreamer;
