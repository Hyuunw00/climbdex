import type { DetectedSegment } from '../modules/climb-video';

export type PickedVideo = {
  uri: string;
  assetId: string | null;
  duration: number;
  width: number;
  height: number;
  fileName: string | null;
  segments?: DetectedSegment[];
};
