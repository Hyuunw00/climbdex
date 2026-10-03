import type { DetectedSegment } from '../modules/climb-video';

export type Clip = { start: number; end: number; low?: boolean; saved?: boolean };

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
  candidates?: DetectedSegment[];
  handheld?: boolean;
  clips?: Clip[];
  saved?: number;
};
