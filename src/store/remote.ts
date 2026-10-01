import { File } from 'expo-file-system';
import { supabase } from '../lib/supabase';
import { type DexState, type Visit, photoDir } from './dex';

const BUCKET = 'gym-photos';

type VisitRow = { id: string; gym_id: string; at: string; photo_path: string | null };
type PhotoRow = { gym_id: string; photo_path: string };

async function uploadPhoto(userId: string, gymId: string, localUri: string): Promise<string> {
  const path = `${userId}/${gymId}-${Date.now()}.jpg`;
  const bytes = await new File(localUri).bytes();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

async function downloadPhoto(path: string): Promise<string> {
  if (!photoDir.exists) photoDir.create();
  const target = new File(photoDir, path.split('/').pop() ?? `${Date.now()}.jpg`);
  if (target.exists) return target.uri;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) throw error ?? new Error('signed url');
  const file = await File.downloadFileAsync(data.signedUrl, target);
  return file.uri;
}

export async function fetchDex(userId: string, local: DexState): Promise<DexState> {
  const [{ data: visitRows, error: e1 }, { data: photoRows, error: e2 }] = await Promise.all([
    supabase.from('visits').select('id, gym_id, at, photo_path').eq('user_id', userId),
    supabase.from('gym_photos').select('gym_id, photo_path').eq('user_id', userId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const localById = new Map(local.visits.map((v) => [v.id, v]));
  const visits: Visit[] = [];
  for (const row of (visitRows ?? []) as VisitRow[]) {
    const known = localById.get(row.id);
    let photo = known?.photo;
    if (row.photo_path && (!photo || !new File(photo).exists)) {
      try {
        photo = await downloadPhoto(row.photo_path);
      } catch {}
    }
    visits.push({ id: row.id, gymId: row.gym_id, at: row.at, photo, photoPath: row.photo_path ?? undefined });
  }
  for (const id of local.pending) {
    const v = localById.get(id);
    if (v && !visits.some((x) => x.id === id)) visits.push(v);
  }
  const photos: Record<string, string> = {};
  const photoPaths: Record<string, string> = {};
  for (const row of (photoRows ?? []) as PhotoRow[]) {
    photoPaths[row.gym_id] = row.photo_path;
    const cached = local.photoPaths[row.gym_id] === row.photo_path ? local.photos[row.gym_id] : undefined;
    try {
      photos[row.gym_id] = cached && new File(cached).exists ? cached : await downloadPhoto(row.photo_path);
    } catch {}
  }
  return { visits, photos, photoPaths, pending: local.pending.filter((id) => !visitRows?.some((r: VisitRow) => r.id === id)) };
}

export async function pushVisit(userId: string, visit: Visit): Promise<Visit> {
  let photoPath = visit.photoPath;
  if (visit.photo && !photoPath) photoPath = await uploadPhoto(userId, visit.gymId, visit.photo);
  const { error } = await supabase.from('visits').upsert({ id: visit.id, user_id: userId, gym_id: visit.gymId, at: visit.at, photo_path: photoPath ?? null });
  if (error) throw error;
  return { ...visit, photoPath };
}

export async function pushGymPhoto(userId: string, gymId: string, localUri: string, existingPath?: string): Promise<string> {
  const path = existingPath ?? (await uploadPhoto(userId, gymId, localUri));
  const { error } = await supabase.from('gym_photos').upsert({ user_id: userId, gym_id: gymId, photo_path: path, updated_at: new Date().toISOString() });
  if (error) throw error;
  return path;
}

export async function deleteVisitRemote(id: string, photoPath?: string, keepPhoto = false) {
  const { error } = await supabase.from('visits').delete().eq('id', id);
  if (error) throw error;
  if (photoPath && !keepPhoto) await supabase.storage.from(BUCKET).remove([photoPath]);
}

export async function deleteGymPhotoRemote(userId: string, gymId: string) {
  await supabase.from('gym_photos').delete().eq('user_id', userId).eq('gym_id', gymId);
}

export async function deleteAccount(userId: string) {
  const { data } = await supabase.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (data && data.length) await supabase.storage.from(BUCKET).remove(data.map((o) => `${userId}/${o.name}`));
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}
