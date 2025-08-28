import { EventEmitter } from 'events';
import { WebRTCError, WebRTCConfig, ConnectionEvent, EventHandler } from './types';

interface PeerConnectionManagerConfig extends WebRTCConfig {
  onSignalingMessage: (message: any) => void;
  onTrack?: (event: RTCTrackEvent) => void;
}

interface NegotiationOptions {
  offerToReceiveAudio?: boolean;
  offerToReceiveVideo?: boolean;
}

export class PeerConnectionManager extends EventEmitter {
  private pc: RTCPeerConnection | null = null;
  private config: PeerConnectionManagerConfig;
  private isNegotiating = false;
  private negotiationQueue: Array<() => Promise<void>> = [];
  private localCandidates: RTCIceCandidate[] = [];
  private remoteCandidates: RTCIceCandidate[] = [];

  constructor(config: PeerConnectionManagerConfig) {
    super();
    this.config = config;
  }

  async createPeerConnection(): Promise<RTCPeerConnection> {
    if (this.pc) {
      this.destroyPeerConnection();
    }

    try {
      this.pc = new RTCPeerConnection({
        iceServers: this.config.iceServers,
        iceCandidatePoolSize: this.config.iceCandidatePoolSize,
      });

      this.setupEventHandlers();
      this.emit('state-change', { type: 'state-change', state: { isPeerConnected: false } });
      
      return this.pc;
    } catch (error) {
      throw new WebRTCError('PC_CREATE_FAILED', '创建PeerConnection失败', true, error as Error);
    }
  }

  private setupEventHandlers(): void {
    if (!this.pc) return;

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.localCandidates.push(event.candidate);
        this.config.onSignalingMessage({
          type: 'ice-candidate',
          payload: event.candidate
        });
      } else {
        console.log('[PeerConnection] ICE收集完成');
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('[PeerConnection] ICE连接状态:', this.pc!.iceConnectionState);
      
      switch (this.pc!.iceConnectionState) {
        case 'connected':
        case 'completed':
          this.emit('state-change', { type: 'state-change', state: { isPeerConnected: true, error: null } });
          break;
        case 'failed':
          this.emit('error', { 
            type: 'error', 
            error: new WebRTCError('ICE_FAILED', 'ICE连接失败', true) 
          });
          break;
        case 'disconnected':
          this.emit('state-change', { type: 'state-change', state: { isPeerConnected: false } });
          break;
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log('[PeerConnection] 连接状态:', this.pc!.connectionState);
      
      switch (this.pc!.connectionState) {
        case 'connected':
          this.emit('state-change', { type: 'state-change', state: { isPeerConnected: true, error: null } });
          break;
        case 'failed':
          this.emit('error', { 
            type: 'error', 
            error: new WebRTCError('CONNECTION_FAILED', 'WebRTC连接失败', true) 
          });
          break;
        case 'disconnected':
          this.emit('state-change', { type: 'state-change', state: { isPeerConnected: false } });
          break;
      }
    };

    this.pc.ontrack = (event) => {
      console.log('[PeerConnection] 收到轨道:', event.track.kind);
      if (this.config.onTrack) {
        this.config.onTrack(event);
      }
    };

    this.pc.onsignalingstatechange = () => {
      console.log('[PeerConnection] 信令状态:', this.pc!.signalingState);
      if (this.pc!.signalingState === 'stable') {
        this.isNegotiating = false;
        this.processNegotiationQueue();
      }
    };
  }

  async createOffer(options: NegotiationOptions = {}): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) {
      throw new WebRTCError('PC_NOT_READY', 'PeerConnection未准备就绪', false);
    }

    try {
      const offerOptions: RTCOfferOptions = {
        offerToReceiveAudio: options.offerToReceiveAudio ?? true,
        offerToReceiveVideo: options.offerToReceiveVideo ?? true,
      };

      const offer = await this.pc.createOffer(offerOptions);
      await this.pc.setLocalDescription(offer);
      
      return offer;
    } catch (error) {
      throw new WebRTCError('OFFER_FAILED', '创建Offer失败', true, error as Error);
    }
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) {
      throw new WebRTCError('PC_NOT_READY', 'PeerConnection未准备就绪', false);
    }

    try {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      
      return answer;
    } catch (error) {
      throw new WebRTCError('ANSWER_FAILED', '创建Answer失败', true, error as Error);
    }
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      throw new WebRTCError('PC_NOT_READY', 'PeerConnection未准备就绪', false);
    }

    try {
      await this.pc.setRemoteDescription(description);
      
      // 添加缓存的远程候选
      for (const candidate of this.remoteCandidates) {
        await this.pc.addIceCandidate(candidate);
      }
      this.remoteCandidates = [];
    } catch (error) {
      throw new WebRTCError('REMOTE_DESC_FAILED', '设置远程描述失败', false, error as Error);
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      this.remoteCandidates.push(new RTCIceCandidate(candidate));
      return;
    }

    try {
      await this.pc.addIceCandidate(candidate);
    } catch (error) {
      console.warn('添加ICE候选失败:', error);
    }
  }

  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender | null {
    if (!this.pc) {
      throw new WebRTCError('PC_NOT_READY', 'PeerConnection未准备就绪', false);
    }

    try {
      return this.pc.addTrack(track, stream);
    } catch (error) {
      throw new WebRTCError('ADD_TRACK_FAILED', '添加轨道失败', false, error as Error);
    }
  }

  removeTrack(sender: RTCRtpSender): void {
    if (!this.pc) {
      throw new WebRTCError('PC_NOT_READY', 'PeerConnection未准备就绪', false);
    }

    try {
      this.pc.removeTrack(sender);
    } catch (error) {
      throw new WebRTCError('REMOVE_TRACK_FAILED', '移除轨道失败', false, error as Error);
    }
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
    if (!this.pc) {
      throw new WebRTCError('PC_NOT_READY', 'PeerConnection未准备就绪', false);
    }

    return this.pc.createDataChannel(label, options);
  }

  async renegotiate(options: NegotiationOptions = {}): Promise<void> {
    if (!this.pc || this.isNegotiating) {
      this.negotiationQueue.push(() => this.doRenegotiate(options));
      return;
    }

    await this.doRenegotiate(options);
  }

  private async doRenegotiate(options: NegotiationOptions): Promise<void> {
    if (!this.pc || this.isNegotiating) return;

    this.isNegotiating = true;
    
    try {
      const offer = await this.createOffer(options);
      this.config.onSignalingMessage({
        type: 'offer',
        payload: offer
      });
    } catch (error) {
      this.isNegotiating = false;
      throw error;
    }
  }

  private processNegotiationQueue(): void {
    if (this.negotiationQueue.length === 0) return;

    const nextNegotiation = this.negotiationQueue.shift();
    if (nextNegotiation) {
      nextNegotiation().catch(error => {
        console.error('处理协商队列失败:', error);
      });
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (!this.pc) {
      throw new WebRTCError('PC_NOT_READY', 'PeerConnection未准备就绪', false);
    }

    return this.pc.getStats();
  }

  getConnectionState(): RTCPeerConnectionState {
    return this.pc?.connectionState || 'closed';
  }

  getIceConnectionState(): RTCIceConnectionState {
    return this.pc?.iceConnectionState || 'closed';
  }

  getSignalingState(): RTCSignalingState {
    return this.pc?.signalingState || 'stable';
  }

  destroyPeerConnection(): void {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    this.isNegotiating = false;
    this.negotiationQueue = [];
    this.localCandidates = [];
    this.remoteCandidates = [];
    
    this.emit('state-change', { type: 'state-change', state: { isPeerConnected: false } });
  }

  on(event: string, handler: EventHandler<ConnectionEvent>): this {
    return super.on(event, handler);
  }

  emit(eventName: string, event?: ConnectionEvent): boolean {
    return super.emit(eventName, event);
  }
}
