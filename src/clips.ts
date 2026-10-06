import type { Settings } from './settings';
import type { Clip, PickedVideo } from './types';

export function padded(video: PickedVideo, seg: { start: number; end: number }, settings: Settings, low?: boolean): Clip {
  return {
    start: Math.max(0, seg.start - settings.padBefore),
    end: Math.min(video.duration, seg.end + settings.padAfter),
    ...(low ? { low } : {}),
  };
}

export function clipsOf(video: PickedVideo, settings: Settings): Clip[] {
  if (video.clips && video.clips.length > 0) return video.clips;
  const found = [
    ...(video.segments ?? []).map((seg) => padded(video, seg, settings)),
    ...(settings.includeLow ? (video.candidates ?? []).map((seg) => padded(video, seg, settings, true)) : []),
  ].sort((a, b) => a.start - b.start);
  return found.length > 0 ? found : [{ start: 0, end: video.duration }];
}
