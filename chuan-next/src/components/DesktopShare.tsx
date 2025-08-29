"use client";

import React, { useState, useCallback } from 'react';
import { useURLHandler } from '@/hooks/ui';
import { Button } from '@/components/ui/button';
import { Share, Monitor } from 'lucide-react';
import  WebRTCDesktopReceiver from '@/components/webrtc/WebRTCDesktopReceiver';
import  WebRTCDesktopSender from '@/components/webrtc/WebRTCDesktopSender';


interface DesktopShareProps {
  // 保留向后兼容性的props（已废弃，但保留接口）
  onJoinSharing?: (code: string) => Promise<void>;
}

export default function DesktopShare({ 
  onJoinSharing 
}: DesktopShareProps) {
  const [mode, setMode] = useState<'share' | 'view'>('share');
  
  // 使用统一的URL处理器，带模式转换
  const { updateMode, getCurrentRoomCode } = useURLHandler({
    featureType: 'desktop',
    onModeChange: setMode,
    onAutoJoinRoom: onJoinSharing,
    modeConverter: {
      fromURL: (urlMode) => urlMode === 'send' ? 'share' : 'view',
      toURL: (componentMode) => componentMode === 'share' ? 'send' : 'receive'
    }
  });

  // 获取初始房间代码（用于接收者模式）
  const getInitialCode = useCallback(() => {
    const code = getCurrentRoomCode();
    console.log('[DesktopShare] getInitialCode 返回:', code);
    return code;
  }, [getCurrentRoomCode]);

  // 连接状态变化处理 - 为了兼容现有的子组件接口，保留它
  const handleConnectionChange = useCallback((connection: { isConnected: boolean; isWebSocketConnected: boolean }) => {
    console.log('桌面共享连接状态变化:', connection);
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 模式选择器 */}
      <div className="flex justify-center mb-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-1 shadow-lg">
          <Button
            variant={mode === 'share' ? 'default' : 'ghost'}
            onClick={() => updateMode('share')}
            className="px-6 py-2 rounded-lg"
          >
            <Share className="w-4 h-4 mr-2" />
            共享桌面
          </Button>
          <Button
            variant={mode === 'view' ? 'default' : 'ghost'}
            onClick={() => updateMode('view')}
            className="px-6 py-2 rounded-lg"
          >
            <Monitor className="w-4 h-4 mr-2" />
            观看桌面
          </Button>
        </div>
      </div>

      {/* 根据模式渲染对应的组件 */}
      <div>
        {mode === 'share' ? (
          <WebRTCDesktopSender onConnectionChange={handleConnectionChange} />
        ) : (
          <WebRTCDesktopReceiver 
            initialCode={getInitialCode()}
            onConnectionChange={handleConnectionChange}
          />
        )}
      </div>
    </div>
  );
}
