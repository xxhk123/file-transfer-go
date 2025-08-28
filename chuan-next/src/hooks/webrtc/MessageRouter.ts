import { WebRTCMessage, MessageHandler, DataHandler } from './types';

interface ChannelHandlers {
  messageHandlers: Set<MessageHandler>;
  dataHandlers: Set<DataHandler>;
}

export class MessageRouter {
  private channels = new Map<string, ChannelHandlers>();
  private defaultChannelHandlers: ChannelHandlers | null = null;

  constructor() {
    this.createDefaultChannel();
  }

  private createDefaultChannel(): void {
    this.defaultChannelHandlers = {
      messageHandlers: new Set(),
      dataHandlers: new Set(),
    };
  }

  registerMessageHandler(channel: string, handler: MessageHandler): () => void {
    let channelHandlers = this.channels.get(channel);
    
    if (!channelHandlers) {
      channelHandlers = {
        messageHandlers: new Set(),
        dataHandlers: new Set(),
      };
      this.channels.set(channel, channelHandlers);
    }

    channelHandlers.messageHandlers.add(handler);

    // 返回取消注册函数
    return () => {
      channelHandlers!.messageHandlers.delete(handler);
      
      // 如果通道没有处理器了，删除通道
      if (channelHandlers!.messageHandlers.size === 0 && channelHandlers!.dataHandlers.size === 0) {
        this.channels.delete(channel);
      }
    };
  }

  registerDataHandler(channel: string, handler: DataHandler): () => void {
    let channelHandlers = this.channels.get(channel);
    
    if (!channelHandlers) {
      channelHandlers = {
        messageHandlers: new Set(),
        dataHandlers: new Set(),
      };
      this.channels.set(channel, channelHandlers);
    }

    channelHandlers.dataHandlers.add(handler);

    // 返回取消注册函数
    return () => {
      channelHandlers!.dataHandlers.delete(handler);
      
      // 如果通道没有处理器了，删除通道
      if (channelHandlers!.messageHandlers.size === 0 && channelHandlers!.dataHandlers.size === 0) {
        this.channels.delete(channel);
      }
    };
  }

  registerDefaultMessageHandler(handler: MessageHandler): () => void {
    if (!this.defaultChannelHandlers) {
      this.createDefaultChannel();
    }
    
    this.defaultChannelHandlers?.messageHandlers.add(handler);
    
    return () => {
      this.defaultChannelHandlers?.messageHandlers.delete(handler);
    };
  }

  registerDefaultDataHandler(handler: DataHandler): () => void {
    if (!this.defaultChannelHandlers) {
      this.createDefaultChannel();
    }
    
    this.defaultChannelHandlers?.dataHandlers.add(handler);
    
    return () => {
      this.defaultChannelHandlers?.dataHandlers.delete(handler);
    };
  }

  routeMessage(message: WebRTCMessage): void {
    const channel = message.channel;
    
    if (channel) {
      // 路由到特定通道
      const channelHandlers = this.channels.get(channel);
      if (channelHandlers && channelHandlers.messageHandlers.size > 0) {
        channelHandlers.messageHandlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            console.error(`消息处理器错误 (通道: ${channel}):`, error);
          }
        });
        return;
      }
    }

    // 回退到默认处理器
    if (this.defaultChannelHandlers?.messageHandlers.size) {
      this.defaultChannelHandlers.messageHandlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('默认消息处理器错误:', error);
        }
      });
    } else {
      console.warn('没有找到消息处理器:', message.type, channel || 'default');
    }
  }

  routeData(data: ArrayBuffer, channel?: string): void {
    if (channel) {
      // 路由到特定通道
      const channelHandlers = this.channels.get(channel);
      if (channelHandlers && channelHandlers.dataHandlers.size > 0) {
        channelHandlers.dataHandlers.forEach(handler => {
          try {
            handler(data);
          } catch (error) {
            console.error(`数据处理器错误 (通道: ${channel}):`, error);
          }
        });
        return;
      }
    }

    // 回退到默认处理器
    if (this.defaultChannelHandlers?.dataHandlers.size) {
      this.defaultChannelHandlers.dataHandlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error('默认数据处理器错误:', error);
        }
      });
    } else {
      console.warn('没有找到数据处理器，数据大小:', data.byteLength, 'bytes');
    }
  }

  hasHandlers(channel?: string): boolean {
    if (channel) {
      const channelHandlers = this.channels.get(channel);
      return channelHandlers ? 
        (channelHandlers.messageHandlers.size > 0 || channelHandlers.dataHandlers.size > 0) : 
        false;
    }
    
    return this.defaultChannelHandlers ? 
      (this.defaultChannelHandlers.messageHandlers.size > 0 || this.defaultChannelHandlers.dataHandlers.size > 0) : 
      false;
  }

  getChannelList(): string[] {
    return Array.from(this.channels.keys());
  }

  getHandlerCount(channel?: string): { message: number; data: number } {
    if (channel) {
      const channelHandlers = this.channels.get(channel);
      return channelHandlers ? {
        message: channelHandlers.messageHandlers.size,
        data: channelHandlers.dataHandlers.size,
      } : { message: 0, data: 0 };
    }
    
    return this.defaultChannelHandlers ? {
      message: this.defaultChannelHandlers.messageHandlers.size,
      data: this.defaultChannelHandlers.dataHandlers.size,
    } : { message: 0, data: 0 };
  }

  clear(): void {
    this.channels.clear();
    this.createDefaultChannel();
  }

  clearChannel(channel: string): void {
    this.channels.delete(channel);
  }
}
