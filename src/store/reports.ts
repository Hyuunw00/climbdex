import { supabase } from '../lib/supabase';

export type GymReportKind = 'missing' | 'closed' | 'moved' | 'wrong';

export async function sendGymReport(userId: string, kind: GymReportKind, gymId: string | null, name: string | null, note: string) {
  const { error } = await supabase.from('gym_reports').insert({ user_id: userId, kind, gym_id: gymId, name, note });
  if (error) throw error;
}
