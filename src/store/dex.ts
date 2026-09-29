import { Directory, File, Paths } from 'expo-file-system';

export type Visit = { gymId: string; at: string; photo?: string };

export type DexState = {
  visits: Visit[];
  photos: Record<string, string>;
};

const store = new File(Paths.document, 'dex.json');
const photoDir = new Directory(Paths.document, 'gym-photos');

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

export function storePhoto(sourceUri: string, gymId: string): string {
  if (!photoDir.exists) photoDir.create();
  const target = new File(photoDir, `${gymId}-${Date.now()}.jpg`);
  new File(sourceUri).copy(target);
  return target.uri;
}

export function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export function visitedToday(state: DexState, gymId: string) {
  const today = dayKey(new Date().toISOString());
  return state.visits.some((v) => v.gymId === gymId && dayKey(v.at) === today);
}
