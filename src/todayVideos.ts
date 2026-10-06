import { File, Paths } from 'expo-file-system';
import { dayKey } from './store/dex';

const dismissedStore = new File(Paths.document, 'today-dismissed.json');

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
