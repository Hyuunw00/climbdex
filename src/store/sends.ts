import { type Gym, gymById, nearbyGyms } from '../data/gyms';
import { supabase } from '../lib/supabase';
import { type DexState, dayKey } from './dex';
import type { Clip, PickedVideo } from '../types';

export type Basis = 'location' | 'visit';
export type GymCandidate = { gym: Gym; basis: Basis };
export type SendRecord = { gymId: string; basis: Basis; clip: Clip; label: string; sent: boolean };

const VIDEO_RADIUS = 200;
const FALL_DROP = 1.5;
const FALL_WINDOW = 0.6;
const STILL = 1.5;

export function resolveGyms(video: PickedVideo, dex: DexState): GymCandidate[] {
  if (video.location) {
    const near = nearbyGyms(video.location.lat, video.location.lng, VIDEO_RADIUS);
    if (near.length > 0) return near.map((c) => ({ gym: c.gym, basis: 'location' as const }));
  }
  for (const shot of [video.createdAt, video.pickedAt]) {
    if (!shot) continue;
    const day = dayKey(shot);
    const visits = dex.visits
      .filter((v) => dayKey(v.at) === day)
      .sort((a, b) => Math.abs(new Date(a.at).getTime() - shot) - Math.abs(new Date(b.at).getTime() - shot));
    const seen = new Set<string>();
    const out: GymCandidate[] = [];
    for (const v of visits) {
      const gym = gymById.get(v.gymId);
      if (!gym || seen.has(gym.id)) continue;
      seen.add(gym.id);
      out.push({ gym, basis: 'visit' });
    }
    if (out.length > 0) return out;
  }
  return [];
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function judgeSend(tracks: number[][][] | undefined, start: number, end: number): boolean | null {
  if (!tracks) return null;
  const people = tracks.map((track) => track.filter((s) => s.length >= 5 && s[0] >= start && s[0] <= end));
  const person = people.reduce((best, p) => (p.length > best.length ? p : best), [] as number[][]);
  if (person.length < 10) return null;
  const torsos = person.map((s) => s[3]).filter((v) => v > 0);
  if (torsos.length === 0) return null;
  const torso = median(torsos);
  const t = person.map((s) => s[0]);
  const y = person.map((s) => s[2]);
  for (let i = 0; i < t.length; i++) {
    let low = Infinity;
    for (let k = i + 1; k < t.length && t[k] - t[i] <= FALL_WINDOW; k++) if (y[k] < low) low = y[k];
    if (low > y[i] - FALL_DROP * torso) continue;
    const fallT = t[i];
    let peak = -Infinity;
    for (let k = 0; k <= i; k++) if (t[k] >= fallT - 3 && y[k] > peak) peak = y[k];
    let still = 0;
    let k = i;
    while (k > 0 && Math.abs(y[k - 1] - peak) < 0.3 * torso) {
      k--;
      still = fallT - t[k];
    }
    return still >= STILL;
  }
  return null;
}

export function videoKey(video: PickedVideo) {
  return video.assetId ?? `${video.fileName ?? 'video'}:${Math.round(video.duration)}`;
}

export async function pushSends(userId: string, video: PickedVideo, records: SendRecord[]) {
  const at = new Date(video.createdAt ?? Date.now()).toISOString();
  const key = videoKey(video);
  const rows = records.map((r) => ({
    user_id: userId,
    gym_id: r.gymId,
    at,
    label: r.label,
    sent: r.sent,
    basis: r.basis,
    video_key: key,
    clip_start: Math.round(r.clip.start * 10) / 10,
    clip_end: Math.round(r.clip.end * 10) / 10,
  }));
  const { error } = await supabase.from('sends').upsert(rows, { onConflict: 'user_id,video_key,clip_start,clip_end' });
  if (error) throw error;
}
