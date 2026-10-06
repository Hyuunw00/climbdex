import type { DetectedSegment } from '../modules/climb-video';

export type Clip = { start: number; end: number; low?: boolean; saved?: boolean; gymId?: string; tape?: string; sent?: boolean };

export type PickedVideo = {
  uri: string;
  assetId: string | null;
  duration: number;
  width: number;
  height: number;
  fileName: string | null;
  createdAt?: number;
  location?: { lat: number; lng: number } | null;
  pickedAt?: number;
  thumbnail?: string;
  segments?: DetectedSegment[];
  candidates?: DetectedSegment[];
  tracks?: number[][][];
  handheld?: boolean;
  clips?: Clip[];
  saved?: number;
};
