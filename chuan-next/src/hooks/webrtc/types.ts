// WebRTC 核心类型定义

// 基础连接状态
export interface WebRTCConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  isWebSocketConnected: boolean;
  isPeerConnected: boolean;
  error: string | null;
  canRetry: boolean;
  currentRoom: { code: string; role: 'sender' | 'receiver' } | null;
}

// 消息类型
export interface WebRTCMessage<T = any> {
  type: string;
  payload: T;
  channel?: string;
}

// 消息处理器类型
export type MessageHandler = (message: WebRTCMessage) => void;
export type DataHandler = (data: ArrayBuffer) => void;

// WebRTC 配置
export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize: number;
  chunkSize: number;
  maxRetries: number;
  retryDelay: number;
  ackTimeout: number;
}

// 错误类型
export class WebRTCError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = false,
    public cause?: Error
  ) {
    super(message);
    this.name = 'WebRTCError';
  }
}

// 连接事件
export type ConnectionEvent = 
  | { type: 'connecting' }
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'error'; error: WebRTCError }
  | { type: 'retry' }
  | { type: 'state-change'; state: Partial<WebRTCConnectionState> };

// 事件处理器
export type EventHandler<T extends ConnectionEvent> = (event: T) => void;
