export interface TTSRequest {
  text: string;
  language?: string;
  voice?: string;
  speed?: number;
}

export interface TTSResult {
  audio: Buffer;
  mimeType: 'audio/wav' | 'audio/mpeg';
  durationSeconds: number;
  provider: string;
}

export interface TTSProvider {
  readonly id: string;
  synthesize(request: TTSRequest): Promise<TTSResult>;
  healthCheck(): Promise<{ available: boolean; message: string }>;
}
