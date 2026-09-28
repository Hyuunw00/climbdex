import { NativeModule, requireNativeModule } from 'expo';

declare class ClimbVideoModule extends NativeModule {
  trim(uri: string, start: number, end: number): Promise<string>;
}

export default requireNativeModule<ClimbVideoModule>('ClimbVideo');
