import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type Visit = { id: string; gymId: string; at: string; photo?: string; photoPath?: string };

export type DexState = {
  visits: Visit[];
  photos: Record<string, string>;
  photoPaths: Record<string, string>;
  pending: string[];
};

export const EMPTY_DEX: DexState = { visits: [], photos: {}, photoPaths: {}, pending: [] };

const legacyStore = new File(Paths.document, 'dex.json');
export const photoDir = new Directory(Paths.document, 'gym-photos');
const PHOTO_WIDTH = 720;

function parse(text: string): DexState {
  const saved = JSON.parse(text) as Partial<DexState>;
  return {
    visits: (saved.visits ?? []).map((v) => ({ ...v, id: v.id ?? randomUUID() })),
    photos: saved.photos ?? {},
    photoPaths: saved.photoPaths ?? {},
    pending: saved.pending ?? [],
  };
}

function cacheFile(userId: string) {
  return new File(Paths.document, `dex-${userId}.json`);
}

export function loadCache(userId: string): DexState {
  try {
    const file = cacheFile(userId);
    if (!file.exists) return EMPTY_DEX;
    return parse(file.textSync());
  } catch {
    return EMPTY_DEX;
  }
}

export function saveCache(userId: string, state: DexState) {
  cacheFile(userId).write(JSON.stringify(state));
}

export function loadLegacy(): DexState | null {
  try {
    if (!legacyStore.exists) return null;
    const state = parse(legacyStore.textSync());
    return state.visits.length > 0 ? state : null;
  } catch {
    return null;
  }
}

export function clearLegacy() {
  try {
    if (legacyStore.exists) legacyStore.delete();
  } catch {}
}

export async function storePhoto(sourceUri: string, gymId: string): Promise<string> {
  if (!photoDir.exists) photoDir.create();
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: PHOTO_WIDTH });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const target = new File(photoDir, `${gymId}-${Date.now()}.jpg`);
  new File(result.uri).move(target);
  return target.uri;
}

export function deletePhotoFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

export function removeVisit(state: DexState, id: string): DexState {
  const target = state.visits.find((v) => v.id === id);
  if (!target) return state;
  const visits = state.visits.filter((v) => v.id !== id);
  const photos = { ...state.photos };
  const photoPaths = { ...state.photoPaths };
  const current = photos[target.gymId];
  if (target.photo && target.photo !== current) deletePhotoFile(target.photo);
  if (current && !visits.some((v) => v.gymId === target.gymId)) {
    deletePhotoFile(current);
    delete photos[target.gymId];
    delete photoPaths[target.gymId];
  }
  return { ...state, visits, photos, photoPaths, pending: state.pending.filter((p) => p !== id) };
}

export function replacePhoto(state: DexState, gymId: string, photo: string, photoPath?: string): DexState {
  const previous = state.photos[gymId];
  if (previous && previous !== photo && !state.visits.some((v) => v.photo === previous)) deletePhotoFile(previous);
  return {
    ...state,
    photos: { ...state.photos, [gymId]: photo },
    photoPaths: photoPath ? { ...state.photoPaths, [gymId]: photoPath } : state.photoPaths,
  };
}

export function dayKey(value: string | number | Date) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function visitedToday(state: DexState, gymId: string) {
  const today = dayKey(new Date());
  return state.visits.some((v) => v.gymId === gymId && dayKey(v.at) === today);
}

export function lastVisits(state: DexState) {
  const last = new Map<string, string>();
  for (const v of state.visits) {
    const current = last.get(v.gymId);
    if (!current || v.at > current) last.set(v.gymId, v.at);
  }
  return last;
}
