import { EventEmitter } from 'events';
import { WebRTCError, WebRTCMessage, ConnectionEvent, EventHandler, MessageHandler, DataHandler } from './types';

interface DataChannelManagerConfig {
  channelName: string;
  onMessage?: MessageHandler;
  onData?: DataHandler;
  ordered?: boolean;
  maxRetransmits?: number;
}

export class DataChannelManager extends EventEmitter {
  private dataChannel: RTCDataChannel | null = null;
  private config: DataChannelManagerConfig;
  private messageQueue: WebRTCMessage[] = [];
  private dataQueue: ArrayBuffer[] = [];
  private isReady = false;

  constructor(config: DataChannelManagerConfig) {
    super();
    this.config = {
      ordered: true,
      maxRetransmits: 3,
      ...config
    };
  }

  initializeDataChannel(dataChannel: RTCDataChannel): void {
    this.dataChannel = dataChannel;
    this.setupEventHandlers();
  }

  createDataChannel(pc: RTCPeerConnection): RTCDataChannel {
    if (this.dataChannel) {
      throw new WebRTCError('DC_ALREADY_EXISTS', '数据通道已存在', false);
    }

    try {
      this.dataChannel = pc.createDataChannel(this.config.channelName, {
        ordered: this.config.ordered,
        maxRetransmits: this.config.maxRetransmits,
      });

      this.setupEventHandlers();
      return this.dataChannel;
    } catch (error) {
      throw new WebRTCError('DC_CREATE_FAILED', '创建数据通道失败', false, error as Error);
    }
  }

  private setupEventHandlers(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log(`[DataChannel] 数据通道已打开: ${this.config.channelName}`);
      this.isReady = true;
      this.flushQueues();
      this.emit('state-change', { type: 'state-change', state: { isPeerConnected: true, error: null } });
    };

    this.dataChannel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const message = JSON.parse(event.data) as WebRTCMessage;
          console.log(`[DataChannel] 收到消息: ${message.type}, 通道: ${message.channel || this.config.channelName}`);
          
          if (this.config.onMessage) {
            this.config.onMessage(message);
          }
        } catch (error) {
          console.error('[DataChannel] 解析消息失败:', error);
          this.emit('error', { 
            type: 'error', 
            error: new WebRTCError('DC_MESSAGE_PARSE_ERROR', '消息解析失败', false, error as Error) 
          });
        }
      } else if (event.data instanceof ArrayBuffer) {
        console.log(`[DataChannel] 收到数据: ${event.data.byteLength} bytes`);
        
        if (this.config.onData) {
          this.config.onData(event.data);
        }
      }
    };

    this.dataChannel.onerror = (error) => {
      console.error(`[DataChannel] 数据通道错误: ${this.config.channelName}`, error);
      
      const errorMessage = this.getDetailedErrorMessage();
      this.emit('error', { 
        type: 'error', 
        error: new WebRTCError('DC_ERROR', errorMessage, true) 
      });
    };

    this.dataChannel.onclose = () => {
      console.log(`[DataChannel] 数据通道已关闭: ${this.config.channelName}`);
      this.isReady = false;
      this.emit('disconnected', { 
        type: 'disconnected', 
        reason: `数据通道关闭: ${this.config.channelName}` 
      });
    };
  }

  private getDetailedErrorMessage(): string {
    if (!this.dataChannel) return '数据通道不可用';

    switch (this.dataChannel.readyState) {
      case 'connecting':
        return '数据通道正在连接中，请稍候...';
      case 'closing':
        return '数据通道正在关闭，连接即将断开';
      case 'closed':
        return '数据通道已关闭，P2P连接失败';
      default:
        return '数据通道连接失败，可能是网络环境受限';
    }
  }

  sendMessage(message: WebRTCMessage): boolean {
    if (!this.isReady || !this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.messageQueue.push(message);
      return false;
    }

    try {
      this.dataChannel.send(JSON.stringify(message));
      console.log(`[DataChannel] 发送消息: ${message.type}, 通道: ${message.channel || this.config.channelName}`);
      return true;
    } catch (error) {
      console.error('[DataChannel] 发送消息失败:', error);
      this.emit('error', { 
        type: 'error', 
        error: new WebRTCError('DC_SEND_ERROR', '发送消息失败', true, error as Error) 
      });
      return false;
    }
  }

  sendData(data: ArrayBuffer): boolean {
    if (!this.isReady || !this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.dataQueue.push(data);
      return false;
    }

    try {
      this.dataChannel.send(data);
      console.log(`[DataChannel] 发送数据: ${data.byteLength} bytes`);
      return true;
    } catch (error) {
      console.error('[DataChannel] 发送数据失败:', error);
      this.emit('error', { 
        type: 'error', 
        error: new WebRTCError('DC_SEND_DATA_ERROR', '发送数据失败', true, error as Error) 
      });
      return false;
    }
  }

  private flushQueues(): void {
    // 发送排队的消息
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }

    // 发送排队的数据
    while (this.dataQueue.length > 0) {
      const data = this.dataQueue.shift();
      if (data) {
        this.sendData(data);
      }
    }
  }

  getState(): RTCDataChannelState {
    return this.dataChannel?.readyState || 'closed';
  }

  isChannelReady(): boolean {
    return this.isReady && this.dataChannel?.readyState === 'open';
  }

  getBufferedAmount(): number {
    return this.dataChannel?.bufferedAmount || 0;
  }

  getBufferedAmountLowThreshold(): number {
    return this.dataChannel?.bufferedAmountLowThreshold || 0;
  }

  setBufferedAmountLowThreshold(threshold: number): void {
    if (this.dataChannel) {
      this.dataChannel.bufferedAmountLowThreshold = threshold;
    }
  }

  onBufferedAmountLow(handler: () => void): void {
    if (this.dataChannel) {
      this.dataChannel.onbufferedamountlow = handler;
    }
  }

  close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    this.isReady = false;
    this.messageQueue = [];
    this.dataQueue = [];
    
    this.emit('disconnected', { type: 'disconnected', reason: '数据通道已关闭' });
  }

  on(event: string, handler: EventHandler<ConnectionEvent>): this {
    return super.on(event, handler);
  }

  emit(eventName: string, event?: ConnectionEvent): boolean {
    return super.emit(eventName, event);
  }
}
