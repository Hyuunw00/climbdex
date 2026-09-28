import { NativeModule, requireNativeModule } from 'expo';

export type DetectedSegment = { start: number; end: number };

declare class ClimbVideoModule extends NativeModule {
  trim(uri: string, start: number, end: number): Promise<string>;
  detect(uri: string): Promise<DetectedSegment[]>;
}

export default requireNativeModule<ClimbVideoModule>('ClimbVideo');
