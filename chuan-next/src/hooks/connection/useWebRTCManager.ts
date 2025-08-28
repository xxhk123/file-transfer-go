import { useState, useEffect, useCallback, useRef } from 'react';
import { WebRTCManager } from '../webrtc/WebRTCManager';
import { WebRTCConnectionState, WebRTCMessage, MessageHandler, DataHandler } from '../webrtc/types';
import { WebRTCConnection } from './useSharedWebRTCManager';

interface WebRTCManagerConfig {
  dataChannelName?: string;
  enableLogging?: boolean;
  iceServers?: RTCIceServer[];
  iceCandidatePoolSize?: number;
  chunkSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  ackTimeout?: number;
}

/**
 * 新的 WebRTC 管理器 Hook
 * 替代原有的 useSharedWebRTCManager，提供更好的架构和错误处理
 */
export function useWebRTCManager(config: WebRTCManagerConfig = {}): WebRTCConnection {
  const managerRef = useRef<WebRTCManager | null>(null);
  const [state, setState] = useState<WebRTCConnectionState>({
    isConnected: false,
    isConnecting: false,
    isWebSocketConnected: false,
    isPeerConnected: false,
    error: null,
    canRetry: false,
    currentRoom: null,
  });

  // 初始化管理器
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new WebRTCManager(config);
      
      // 监听状态变化
      managerRef.current.on('state-change', (event: any) => {
        setState(prev => ({ ...prev, ...event.state }));
      });
    }

    return () => {
      if (managerRef.current) {
        managerRef.current.disconnect();
        managerRef.current = null;
      }
    };
  }, [config]);

  // 连接
  const connect = useCallback(async (roomCode: string, role: 'sender' | 'receiver') => {
    if (!managerRef.current) {
      throw new Error('WebRTC 管理器未初始化');
    }
    return managerRef.current.connect(roomCode, role);
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    if (!managerRef.current) return;
    managerRef.current.disconnect();
  }, []);

  // 重试连接
  const retry = useCallback(async () => {
    if (!managerRef.current) {
      throw new Error('WebRTC 管理器未初始化');
    }
    return managerRef.current.retry();
  }, []);

  // 发送消息
  const sendMessage = useCallback((message: WebRTCMessage, channel?: string) => {
    if (!managerRef.current) return false;
    return managerRef.current.sendMessage(message, channel);
  }, []);

  // 发送数据
  const sendData = useCallback((data: ArrayBuffer) => {
    if (!managerRef.current) return false;
    return managerRef.current.sendData(data);
  }, []);

  // 注册消息处理器
  const registerMessageHandler = useCallback((channel: string, handler: MessageHandler) => {
    if (!managerRef.current) return () => {};
    return managerRef.current.registerMessageHandler(channel, handler);
  }, []);

  // 注册数据处理器
  const registerDataHandler = useCallback((channel: string, handler: DataHandler) => {
    if (!managerRef.current) return () => {};
    return managerRef.current.registerDataHandler(channel, handler);
  }, []);

  // 添加媒体轨道
  const addTrack = useCallback((track: MediaStreamTrack, stream: MediaStream) => {
    if (!managerRef.current) return null;
    return managerRef.current.addTrack(track, stream);
  }, []);

  // 移除媒体轨道
  const removeTrack = useCallback((sender: RTCRtpSender) => {
    if (!managerRef.current) return;
    managerRef.current.removeTrack(sender);
  }, []);

  // 设置轨道处理器
  const onTrack = useCallback((handler: (event: RTCTrackEvent) => void) => {
    if (!managerRef.current) return;
    managerRef.current.onTrack(handler);
  }, []);

  // 获取 PeerConnection
  const getPeerConnection = useCallback(() => {
    if (!managerRef.current) return null;
    return managerRef.current.getPeerConnection();
  }, []);

  // 立即创建 offer
  const createOfferNow = useCallback(async () => {
    if (!managerRef.current) return false;
    return managerRef.current.createOfferNow();
  }, []);

  // 获取数据通道状态
  const getChannelState = useCallback(() => {
    if (!managerRef.current) return 'closed';
    return managerRef.current.getChannelState();
  }, []);

  // 检查是否已连接到指定房间
  const isConnectedToRoom = useCallback((roomCode: string, role: 'sender' | 'receiver') => {
    if (!managerRef.current) return false;
    return managerRef.current.isConnectedToRoom(roomCode, role);
  }, []);

  return {
    // 状态
    isConnected: state.isConnected,
    isConnecting: state.isConnecting,
    isWebSocketConnected: state.isWebSocketConnected,
    isPeerConnected: state.isPeerConnected,
    error: state.error,
    canRetry: state.canRetry,

    // 操作方法
    connect,
    disconnect,
    retry,
    sendMessage,
    sendData,

    // 处理器注册
    registerMessageHandler,
    registerDataHandler,

    // 工具方法
    getChannelState,
    isConnectedToRoom,

    // 媒体轨道方法
    addTrack,
    removeTrack,
    onTrack,
    getPeerConnection,
    createOfferNow,

    // 当前房间信息
    currentRoom: state.currentRoom,
  };
}

/**
 * 迁移辅助 Hook - 提供向后兼容性
 * 可以逐步将现有代码迁移到新的架构
 */
export function useWebRTCMigration() {
  const newManager = useWebRTCManager();
  // 注意：这里需要先创建一个包装器来兼容旧的接口
  // 暂时注释掉，避免循环依赖
  // const oldManager = useSharedWebRTCManager();

  return {
    newManager,
    // oldManager, // 暂时禁用
    // 可以添加迁移工具函数
    migrateState: () => {
      // 将旧状态迁移到新状态
      console.log('状态迁移功能待实现');
    },
  };
}
