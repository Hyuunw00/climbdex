import { NativeModule, requireNativeModule } from 'expo';

export type DetectedSegment = { start: number; end: number };
export type DetectResult = { handheld: boolean; segments: DetectedSegment[]; candidates?: DetectedSegment[] };
export type FollowPlan = {
  frame: { width: number; height: number };
  crop: { width: number; height: number };
  points: { t: number; x: number; y: number }[];
};

declare class ClimbVideoModule extends NativeModule {
  trim(uri: string, start: number, end: number): Promise<string>;
  followPath(uri: string, start: number, end: number): Promise<FollowPlan>;
  exportFollow(uri: string, start: number, end: number): Promise<string>;
  exportCrop(uri: string, start: number, end: number): Promise<string>;
  cropPlan(uri: string): Promise<FollowPlan>;
  thumbnails(uri: string, times: number[], width: number): Promise<string[]>;
  detect(uri: string): Promise<DetectResult>;
  startBackgroundRun?(title: string, subtitle: string, totalSeconds: number): boolean;
  updateBackgroundRun?(completedSeconds: number, subtitle: string): void;
  finishBackgroundRun?(success: boolean): void;
  backgroundRunActive?(): boolean;
}

export default requireNativeModule<ClimbVideoModule>('ClimbVideo');
