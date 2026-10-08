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

const hints = new File(Paths.document, 'hints.json');

function readHints(): Record<string, boolean | number | string> {
  try {
    return hints.exists ? (JSON.parse(hints.textSync()) as Record<string, boolean | number | string>) : {};
  } catch {
    return {};
  }
}

export function hintShown(key: string) {
  return !!readHints()[key];
}

export function markHint(key: string) {
  try {
    hints.write(JSON.stringify({ ...readHints(), [key]: true }));
  } catch {}
}

export function hintCount(key: string) {
  const v = readHints()[key];
  return typeof v === 'number' ? v : v ? 1 : 0;
}

export function bumpHint(key: string) {
  try {
    hints.write(JSON.stringify({ ...readHints(), [key]: hintCount(key) + 1 }));
  } catch {}
}

export function cardRatio(): '1:1' | '4:5' | '9:16' {
  const v = readHints()['cardRatio'];
  return v === '1:1' || v === '4:5' || v === '9:16' ? v : '9:16';
}

export function setCardRatio(ratio: '1:1' | '4:5' | '9:16') {
  try {
    hints.write(JSON.stringify({ ...readHints(), cardRatio: ratio }));
  } catch {}
}
