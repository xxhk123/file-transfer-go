import { EventEmitter } from 'events';
import { WebRTCError, ConnectionEvent, EventHandler } from './types';

interface WebSocketManagerConfig {
  url: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  timeout?: number;
}

interface WebSocketMessage {
  type: string;
  payload: any;
}

export class WebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketManagerConfig;
  private reconnectCount = 0;
  private isConnecting = false;
  private isUserDisconnecting = false;
  private messageQueue: WebSocketMessage[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: WebSocketManagerConfig) {
    super();
    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      timeout: 10000,
      ...config
    };
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected()) {
      return;
    }

    this.isConnecting = true;
    this.isUserDisconnecting = false;
    this.emit('connecting', { type: 'connecting' });

    try {
      const ws = new WebSocket(this.config.url);
      
      // 设置超时
      const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          throw new WebRTCError('WS_TIMEOUT', 'WebSocket连接超时', true);
        }
      }, this.config.timeout);

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.reconnectCount = 0;
          this.ws = ws;
          this.setupEventHandlers();
          this.flushMessageQueue();
          this.emit('connected', { type: 'connected' });
          resolve();
        };

        ws.onerror = (errorEvent) => {
          clearTimeout(timeout);
          this.isConnecting = false;
          const wsError = new WebRTCError('WS_ERROR', 'WebSocket连接错误', true, new Error('WebSocket连接错误'));
          this.emit('error', { type: 'error', error: wsError });
          reject(wsError);
        };

        ws.onclose = (closeEvent) => {
          clearTimeout(timeout);
          this.isConnecting = false;
          this.ws = null;
          
          if (!this.isUserDisconnecting) {
            this.handleReconnect();
          }
          
          this.emit('disconnected', { 
            type: 'disconnected', 
            reason: `WebSocket关闭: ${closeEvent.code} - ${closeEvent.reason}` 
          });
        };
      });

    } catch (error) {
      this.isConnecting = false;
      if (error instanceof WebRTCError) {
        this.emit('error', { type: 'error', error });
        throw error;
      }
      throw new WebRTCError('WS_CONNECTION_FAILED', 'WebSocket连接失败', true, error as Error);
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.emit('message', message);
      } catch (error) {
        console.error('解析WebSocket消息失败:', error);
        this.emit('error', { 
          type: 'error', 
          error: new WebRTCError('WS_MESSAGE_PARSE_ERROR', '消息解析失败', false, error as Error) 
        });
      }
    };

    this.ws.onerror = (errorEvent) => {
      this.emit('error', { 
        type: 'error', 
        error: new WebRTCError('WS_ERROR', 'WebSocket错误', true, new Error('WebSocket错误')) 
      });
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      if (!this.isUserDisconnecting) {
        this.handleReconnect();
      }
      this.emit('disconnected', { 
        type: 'disconnected', 
        reason: `WebSocket关闭: ${event.code} - ${event.reason}` 
      });
    };
  }

  private handleReconnect(): void {
    if (this.reconnectCount >= this.config.reconnectAttempts!) {
      this.emit('error', { 
        type: 'error', 
        error: new WebRTCError('WS_RECONNECT_FAILED', '重连失败，已达最大重试次数', false) 
      });
      return;
    }

    const delay = this.config.reconnectDelay! * Math.pow(2, this.reconnectCount);
    this.reconnectCount++;

    console.log(`WebSocket重连中... (${this.reconnectCount}/${this.config.reconnectAttempts})，延迟: ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.emit('retry', { type: 'retry' });
      this.connect().catch(error => {
        console.error('WebSocket重连失败:', error);
      });
    }, delay);
  }

  send(message: WebSocketMessage): boolean {
    if (!this.isConnected()) {
      this.messageQueue.push(message);
      return false;
    }

    try {
      this.ws!.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('发送WebSocket消息失败:', error);
      this.emit('error', { 
        type: 'error', 
        error: new WebRTCError('WS_SEND_ERROR', '发送消息失败', true, error as Error) 
      });
      return false;
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  disconnect(): void {
    this.isUserDisconnecting = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, '用户主动断开');
      this.ws = null;
    }

    this.messageQueue = [];
    this.isConnecting = false;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  isConnectingState(): boolean {
    return this.isConnecting;
  }

  on(event: string, handler: EventHandler<ConnectionEvent>): this {
    return super.on(event, handler);
  }

  emit(eventName: string, event?: ConnectionEvent): boolean {
    return super.emit(eventName, event);
  }
}
