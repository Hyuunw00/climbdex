import { type Gym, gymById, nearbyGyms } from '../data/gyms';
import { supabase } from '../lib/supabase';
import { type DexState, dayKey } from './dex';
import type { Clip, PickedVideo } from '../types';
import { APP_VERSION, DETECT_VERSION, PLATFORM } from '../version';

export type Basis = 'location' | 'visit';
export type GymCandidate = { gym: Gym; basis: Basis };
export type SendRecord = { gymId: string; basis: Basis; clip: Clip; label: string | null; sent: boolean; vMin: number | null; vMax: number | null };

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

export type MySend = { gymId: string; at: string; sent: boolean };

export async function fetchMySends(userId: string): Promise<MySend[]> {
  const { data, error } = await supabase.from('sends').select('gym_id, at, sent').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ gymId: r.gym_id, at: r.at, sent: r.sent }));
}

export type GymSend = { videoKey: string; clipId: string; start: number; end: number; label: string | null; sent: boolean; at: string };

export async function fetchGymSends(userId: string, gymId: string): Promise<GymSend[]> {
  const { data, error } = await supabase
    .from('sends')
    .select('video_key, clip_id, clip_start, clip_end, label, sent, at')
    .eq('user_id', userId)
    .eq('gym_id', gymId)
    .order('at', { ascending: false })
    .order('clip_start');
  if (error) throw error;
  return (data ?? []).map((r) => ({ videoKey: r.video_key, clipId: r.clip_id, start: Number(r.clip_start), end: Number(r.clip_end), label: r.label, sent: r.sent, at: r.at }));
}

export async function updateSendRange(userId: string, key: string, clipId: string, start: number, end: number) {
  const { error } = await supabase
    .from('sends')
    .update({ clip_start: Math.round(start * 10) / 10, clip_end: Math.round(end * 10) / 10 })
    .eq('user_id', userId)
    .eq('video_key', key)
    .eq('clip_id', clipId);
  if (error) throw error;
}

export function sameAttempt(a: { start: number; end: number }, start: number, end: number) {
  const overlap = Math.min(a.end, end) - Math.max(a.start, start);
  return overlap > 0.5 * (Math.max(a.end, end) - Math.min(a.start, start));
}

export async function pushVideoSummary(userId: string, video: PickedVideo, gym: GymCandidate | null, detectMs: number) {
  const segments = video.segments ?? [];
  const { error } = await supabase.from('video_summaries').upsert({
    user_id: userId,
    video_key: videoKey(video),
    at: new Date(video.createdAt ?? video.pickedAt ?? Date.now()).toISOString(),
    duration: Math.round(video.duration * 10) / 10,
    attempts: segments.length,
    candidates: video.candidates?.length ?? 0,
    climb_seconds: Math.round(segments.reduce((sum, s) => sum + (s.end - s.start), 0) * 10) / 10,
    handheld: !!video.handheld,
    gym_id: gym?.gym.id ?? null,
    basis: gym?.basis ?? null,
    detect_ms: Math.round(detectMs),
    detect_version: DETECT_VERSION,
    app_version: APP_VERSION,
    platform: PLATFORM,
  });
  if (error) throw error;
}

export function videoKey(video: PickedVideo) {
  return video.assetId ?? `${video.fileName ?? 'video'}:${Math.round(video.duration)}`;
}

export async function pushSends(userId: string, video: PickedVideo, records: SendRecord[]) {
  const at = new Date(video.createdAt ?? Date.now()).toISOString();
  const key = videoKey(video);
  const { data: existing, error: lookupError } = await supabase.from('sends').select('clip_id, clip_start, clip_end').eq('user_id', userId).eq('video_key', key);
  if (lookupError) throw lookupError;
  const used = new Set<string>();
  const matchId = (clip: Clip) => {
    const pool = (existing ?? []).filter((e) => !used.has(e.clip_id));
    const exact = clip.id ? pool.find((e) => e.clip_id === clip.id) : undefined;
    const hit = exact ?? pool.find((e) => sameAttempt(clip, Number(e.clip_start), Number(e.clip_end)));
    const id = hit?.clip_id ?? clip.id ?? `${clip.start}-${clip.end}`;
    used.add(id);
    return id;
  };
  const rows = records.map((r) => ({
    user_id: userId,
    gym_id: r.gymId,
    at,
    label: r.label,
    sent: r.sent,
    basis: r.basis,
    video_key: key,
    clip_id: matchId(r.clip),
    clip_start: Math.round(r.clip.start * 10) / 10,
    clip_end: Math.round(r.clip.end * 10) / 10,
    auto_sent: r.clip.autoSent ?? null,
    tape_version: 1,
    v_min: r.vMin,
    v_max: r.vMax,
    detect_version: DETECT_VERSION,
    app_version: APP_VERSION,
  }));
  const { error } = await supabase.from('sends').upsert(rows, { onConflict: 'user_id,video_key,clip_id' });
  if (error) throw error;
}
