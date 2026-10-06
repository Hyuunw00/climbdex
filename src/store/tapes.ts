import { supabase } from '../lib/supabase';

export type Tape = { label: string; color: string | null; v: number | null; vMin: number | null; vMax: number | null };
export type TapeSet = { gymId: string; tapes: Tape[]; source: string; confidence: string | null; recordCount: number | null };
export type Vote = { userId: string; label: string; vMin: number; vMax: number };
export type TapeData = { set: TapeSet | null; votes: Vote[] };
export type TapeSummary = { label: string; color: string | null; vMin: number | null; vMax: number | null; votes: number; voted: boolean };

export const V_MIN = -1;
export const V_MAX = 12;
export const MIN_VOTES = 3;

export const PALETTE: { label: string; color: string }[] = [
  { label: '흰색', color: '#f5f5f5' },
  { label: '노랑', color: '#f4d03f' },
  { label: '주황', color: '#f39c12' },
  { label: '연두', color: '#8bc34a' },
  { label: '초록', color: '#27ae60' },
  { label: '하늘', color: '#5dade2' },
  { label: '파랑', color: '#2e86de' },
  { label: '남색', color: '#1f3a93' },
  { label: '보라', color: '#8e44ad' },
  { label: '핑크', color: '#ff6fb5' },
  { label: '빨강', color: '#e74c3c' },
  { label: '자주', color: '#8e244d' },
  { label: '갈색', color: '#8d6e63' },
  { label: '회색', color: '#95a5a6' },
  { label: '검정', color: '#111111' },
];

export function formatV(v: number) {
  return v <= -1 ? 'Vb' : `V${v}`;
}

export function formatRange(min: number | null, max: number | null) {
  if (min === null || max === null) return '?';
  return min === max ? formatV(min) : `${formatV(min)}~${formatV(max)}`;
}

type SetRow = { gym_id: string; tapes: Tape[]; source: string; confidence: string | null; record_count: number | null };
type VoteRow = { user_id: string; label: string; v_min: number; v_max: number };

export async function fetchTapes(gymId: string): Promise<TapeData> {
  const [{ data: setRow, error: e1 }, { data: voteRows, error: e2 }] = await Promise.all([
    supabase.from('gym_tapes').select('gym_id, tapes, source, confidence, record_count').eq('gym_id', gymId).maybeSingle(),
    supabase.from('tape_votes').select('user_id, label, v_min, v_max').eq('gym_id', gymId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const row = setRow as SetRow | null;
  return {
    set: row ? { gymId: row.gym_id, tapes: row.tapes, source: row.source, confidence: row.confidence, recordCount: row.record_count } : null,
    votes: ((voteRows ?? []) as VoteRow[]).map((r) => ({ userId: r.user_id, label: r.label, vMin: r.v_min, vMax: r.v_max })),
  };
}

export async function saveTapeSet(userId: string, gymId: string, tapes: Tape[]) {
  const { error } = await supabase.from('gym_tapes').insert({ gym_id: gymId, tapes, source: 'user', updated_by: userId });
  if (error) throw error;
}

export async function castVote(userId: string, gymId: string, label: string, vMin: number, vMax: number) {
  const { error } = await supabase.from('tape_votes').upsert({ user_id: userId, gym_id: gymId, label, v_min: vMin, v_max: vMax });
  if (error) throw error;
}

export async function removeVote(userId: string, gymId: string, label: string) {
  const { error } = await supabase.from('tape_votes').delete().eq('user_id', userId).eq('gym_id', gymId).eq('label', label);
  if (error) throw error;
}

export async function sendReport(userId: string, gymId: string, kind: 'order' | 'v', label: string | null, note: string, checkedIn: boolean) {
  const { error } = await supabase.from('tape_reports').insert({ user_id: userId, gym_id: gymId, kind, label, note, checked_in: checkedIn });
  if (error) throw error;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function summarize(data: TapeData, userId: string | null): TapeSummary[] {
  if (!data.set) return [];
  return data.set.tapes.map((t) => {
    const votes = data.votes.filter((v) => v.label === t.label);
    const voted = votes.some((v) => v.userId === userId);
    if (votes.length >= (t.vMin === null ? 1 : MIN_VOTES)) {
      return { label: t.label, color: t.color, vMin: median(votes.map((v) => v.vMin)), vMax: median(votes.map((v) => v.vMax)), votes: votes.length, voted };
    }
    return { label: t.label, color: t.color, vMin: t.vMin, vMax: t.vMax, votes: votes.length, voted };
  });
}
