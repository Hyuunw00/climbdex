import { NativeModule, requireNativeModule } from 'expo';

export type DetectedSegment = { start: number; end: number };
export type DetectResult = { handheld: boolean; info: string; segments: DetectedSegment[] };

declare class ClimbVideoModule extends NativeModule {
  trim(uri: string, start: number, end: number): Promise<string>;
  detect(uri: string): Promise<DetectResult>;
}

export default requireNativeModule<ClimbVideoModule>('ClimbVideo');
