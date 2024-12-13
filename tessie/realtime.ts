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
  value: StringValue | LocationValue | InvalidValue;
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

export interface StringValue {
  stringValue: string;
}

export interface LocationValue {
  locationValue: {
    latitude: number;
    longitude: number;
  };
}

export interface InvalidValue {
  key: string;
  value: {
    invalid: boolean;
  };
}

export class RealtimeClient extends WebSocketClient {
  private host: string = "wss://streaming.tessie.com";
  vin: string;
  access_token: string;

  constructor(vin: string, access_token: string) {
    super();
    this.vin = vin;
    this.access_token = access_token;
    console.log("RealtimeClient initialized: ", { vin, access_token });
  }

  async disconnectClient() {
    this.removeAllListeners();
  }

  async onData(callback: (data: RealtimeDataResponse) => void) {
    const url = `${this.host}/${this.vin}?access_token=${this.access_token}`;
    console.log("Connecting to RealtimeClient: ", url);
    this.on("connect", (connection) => {
      console.log("RealtimeClient connected to: ", url);
      connection.on("message", (message: Message) => {
        if (message.type === "utf8") {
          const data = JSON.parse(
            message.utf8Data as string
          ) as RealtimeDataResponse;
          callback(data);
        }
      });
    });

    this.connect(url);
  }
}

export class Realtime {
  clients: RealtimeClient[] = [];
  access_token: string;

  constructor(access_token: string) {
    this.access_token = access_token;
  }

  getClient(vin: string) {
    const client = this.clients.find((client) => client.vin === vin);
    if (client) {
      return client;
    } else {
      const newClient = new RealtimeClient(vin, this.access_token);
      this.clients.push(newClient);
      return newClient;
    }
  }
}
