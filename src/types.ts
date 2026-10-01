import type { DetectedSegment } from '../modules/climb-video';

export type Clip = { start: number; end: number };

export type PickedVideo = {
  uri: string;
  assetId: string | null;
  duration: number;
  width: number;
  height: number;
  fileName: string | null;
  createdAt?: number;
  thumbnail?: string;
  segments?: DetectedSegment[];
  handheld?: boolean;
  clips?: Clip[];
  saved?: number;
};
