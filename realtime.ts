import { IncomingMessage, OutgoingHttpHeaders, RequestOptions } from "http";
import { Url } from "url";
import {
  connection,
  frame,
  Message,
  client as WebSocketClient,
} from "websocket";

export interface RealtimeDataResponse {
  data: [RealtimeData | RealtimeAlert | RealtimeError] | RealtimeConnectivity;
  createdAt: Date;
  vin: string;
}

export interface RealtimeData {
  key: string;
  value: Value | LocationValue | InvalidValue;
}

export interface RealtimeAlert {
  name: string;
  audiences: string[];
  startedAt: Date;
  endedAt: Date;
}

export interface RealtimeConnectivity {
  vin: string;
  connectionId: string;
  status: string;
  createdAt: Date;
}

export interface RealtimeError {
  createdAt: Date;
  name: string;
  tags: Tag;
  body: string;
}

export interface Tag {
  field_name: string;
  name: string;
}

export interface Value {
  stringValue?: string;
  locationValue?: LocationValue;
}

export interface LocationValue {
  latitude: number;
  longitude: number;
}

export interface InvalidValue {
  key: string;
  value: {
    invalid: boolean;
  };
}

export class RealtimeClient extends WebSocketClient {
  vin: string;
  access_token: string;
  connected: boolean = false;

  private host: string = "wss://streaming.tessie.com";
  private url: string;

  constructor(vin: string, access_token: string) {
    super();
    this.vin = vin;
    this.access_token = access_token;
    this.url = `${this.host}/${this.vin}?access_token=${this.access_token}`;

    this.connect(this.url);
  }
}
