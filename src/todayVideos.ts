import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { gymById, type Gym } from './data/gyms';
import { dayKey, type DexState } from './store/dex';
import type { PickedVideo } from './types';

const MIN_SECONDS = 5;
const dismissedStore = new File(Paths.document, 'today-dismissed.json');

export function todayGym(dex: DexState): Gym | null {
  const today = dayKey(new Date());
  const last = dex.visits.filter((v) => dayKey(v.at) === today).sort((a, b) => b.at.localeCompare(a.at))[0];
  return last ? (gymById.get(last.gymId) ?? null) : null;
}

function readDismissed(): string[] {
  try {
    if (!dismissedStore.exists) return [];
    const saved = JSON.parse(dismissedStore.textSync()) as { day: string; keys: string[] };
    return saved.day === dayKey(new Date()) ? saved.keys : [];
  } catch {
    return [];
  }
}

export function dismissedToday(key: string) {
  return readDismissed().includes(key);
}

export function dismissToday(...keys: string[]) {
  try {
    dismissedStore.write(JSON.stringify({ day: dayKey(new Date()), keys: [...readDismissed(), ...keys] }));
  } catch {}
}

export async function newVideosToday(known: Set<string>): Promise<PickedVideo[] | null> {
  if (Platform.OS !== 'ios') return null;
  const permission = await MediaLibrary.getPermissionsAsync();
  if (!permission.granted || permission.accessPrivileges !== 'all') return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const page = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.video,
    createdAfter: start,
    first: 200,
    sortBy: [[MediaLibrary.SortBy.creationTime, true]],
  });
  const dismissed = new Set(readDismissed());
  return page.assets
    .filter((a) => a.duration >= MIN_SECONDS && !known.has(a.id) && !dismissed.has(`asset:${a.id}`))
    .map((a) => ({
      uri: `ph://${a.id}`,
      assetId: a.id,
      duration: a.duration,
      width: a.width,
      height: a.height,
      fileName: a.filename,
      createdAt: a.creationTime,
    }));
}
