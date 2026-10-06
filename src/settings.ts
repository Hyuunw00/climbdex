import { File, Paths } from 'expo-file-system';

export type Settings = { padBefore: number; padAfter: number; includeLow: boolean };

export const DEFAULT_SETTINGS: Settings = { padBefore: 3, padAfter: 2, includeLow: true };

const store = new File(Paths.document, 'settings.json');

export function loadSettings(): Settings {
  try {
    if (!store.exists) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(store.textSync()) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    store.write(JSON.stringify(settings));
  } catch (e) {
    console.log('settings save error', String(e));
  }
}
