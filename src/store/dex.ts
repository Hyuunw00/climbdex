import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type Visit = { gymId: string; at: string; photo?: string };

export type DexState = {
  visits: Visit[];
  photos: Record<string, string>;
};

const store = new File(Paths.document, 'dex.json');
const photoDir = new Directory(Paths.document, 'gym-photos');
const PHOTO_WIDTH = 720;

export function loadDex(): DexState {
  try {
    if (!store.exists) return { visits: [], photos: {} };
    const saved = JSON.parse(store.textSync()) as DexState;
    return { visits: saved.visits ?? [], photos: saved.photos ?? {} };
  } catch {
    return { visits: [], photos: {} };
  }
}

export function saveDex(state: DexState) {
  store.write(JSON.stringify(state));
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

function deletePhoto(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

export function removeVisit(state: DexState, at: string): DexState {
  const target = state.visits.find((v) => v.at === at);
  if (!target) return state;
  const visits = state.visits.filter((v) => v.at !== at);
  const photos = { ...state.photos };
  const current = photos[target.gymId];
  if (target.photo && target.photo !== current) deletePhoto(target.photo);
  if (current && !visits.some((v) => v.gymId === target.gymId)) {
    deletePhoto(current);
    delete photos[target.gymId];
  }
  return { visits, photos };
}

export function replacePhoto(state: DexState, gymId: string, photo: string): DexState {
  const previous = state.photos[gymId];
  if (previous && previous !== photo && !state.visits.some((v) => v.photo === previous)) deletePhoto(previous);
  return { ...state, photos: { ...state.photos, [gymId]: photo } };
}

export function dayKey(value: string | number | Date) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function visitedToday(state: DexState, gymId: string) {
  const today = dayKey(new Date());
  return state.visits.some((v) => v.gymId === gymId && dayKey(v.at) === today);
}
