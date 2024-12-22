﻿﻿import WebSocket from 'ws';

interface ReconnectingWebSocketOptions {
  reconnectInterval?: number;
  maxRetries?: number;
  resendOnReconnect?: boolean;
  repeatAllMessages?: boolean;
}

type EventHandler = (event: any) => void;

export class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number;
  private maxRetries?: number;
  private retryCount: number = 0;
  private resendOnReconnect: boolean;
  private repeatAllMessages: boolean;
  private messageQueue: any[] = [];
  private sentMessages: any[] = [];
  private eventHandlers: { [key: string]: EventHandler[] } = {};

  constructor(url: string, options: ReconnectingWebSocketOptions = {}) {
    this.url = url;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxRetries = options.maxRetries;
    this.resendOnReconnect = options.resendOnReconnect || false;
    this.repeatAllMessages = options.repeatAllMessages || false;
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', (event: any) => {
        console.log('WebSocket connection established', this.url);
        this.retryCount = 0;
        this.emit('open', event);

        if (this.resendOnReconnect) {
          this.resendQueuedMessages();
        }
      });

      this.ws.on('message', (data) => {
        this.emit('message', data);
      });

      this.ws.on('close', (event) => {
        console.log('WebSocket connection closed. Attempting to reconnect...', this.url);
        this.emit('close', event);
        this.reconnect();
      });

      this.ws.on('error', (error) => {
        this.emit('error', error);
        console.error('WebSocket error:', error);
        this.ws?.close();
      });
    } catch (e) {
      console.error(e);
      this.ws?.close();
      this.reconnect();
    }
  }

  private async reconnect() {
    if (this.maxRetries ? this.retryCount < this.maxRetries : true) {
      await new Promise((resolve) => setTimeout(resolve, this.reconnectInterval));
      this.retryCount++;
      console.log(`Reconnection attempt #${this.retryCount}`);
      this.connect();
    } else {
      console.error('Max reconnection attempts reached. Could not reconnect to WebSocket.');
    }
  }

  private resendQueuedMessages() {
    // First resend any failed messages in the queue
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message, false);
    }
    
    // Then resend all previously sent messages if repeatAllMessages is enabled
    if (this.repeatAllMessages) {
      const messagesToResend = [...this.sentMessages]; // Create copy to avoid modification during iteration
      for (const message of messagesToResend) {
        this.send(message, false);
      }
    }
  }

  private emit(eventType: string, event: any) {
    if (this.eventHandlers[eventType]) {
      for (const handler of this.eventHandlers[eventType]) {
        handler(event);
      }
    }
  }

  public on(eventType: 'open' | 'message' | 'close' | 'error', handler: EventHandler) {
    if (!this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = [];
    }
    this.eventHandlers[eventType].push(handler);
  }

  public send(data: any, queueOnFailure: boolean = true) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data, (err) => {
        if (err) {
          console.error('Send error:', err);
        } else if (this.repeatAllMessages) {
          this.sentMessages.push(data);
        }
      });
    } else if (queueOnFailure) {
      this.messageQueue.push(data);
      console.log('Message queued for resend on reconnect:', data);
    }
  }

  public close(code?: number, reason?: string) {
    this.ws?.close(code, reason);
  }

  public terminate() {
    this.ws?.terminate();
    this.messageQueue = [];
    this.sentMessages = [];
  }
}

export default ReconnectingWebSocket;
