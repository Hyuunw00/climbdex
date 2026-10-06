import { File, Paths } from 'expo-file-system';
import { supabase } from '../lib/supabase';
import type { PickedVideo } from '../types';
import { type GymCandidate, type SendRecord, pushSends, pushVideoSummary, videoKey } from './sends';

type Item =
  | { kind: 'sends'; userId: string; at: number; video: PickedVideo; records: SendRecord[] }
  | { kind: 'summary'; userId: string; at: number; video: PickedVideo; gym: GymCandidate | null; detectMs: number };

const store = new File(Paths.document, 'outbox.json');
const MAX_AGE = 30 * 24 * 3600 * 1000;
let flushing: Promise<void> | null = null;

function slim(video: PickedVideo): PickedVideo {
  const { tracks, thumbnail, clips, ...rest } = video;
  return rest;
}

function read(): Item[] {
  try {
    return store.exists ? (JSON.parse(store.textSync()) as Item[]) : [];
  } catch {
    return [];
  }
}

function write(items: Item[]) {
  try {
    store.write(JSON.stringify(items));
  } catch (e) {
    console.log('outbox write error', String(e));
  }
}

async function send(item: Item) {
  if (item.kind === 'sends') await pushSends(item.userId, item.video, item.records);
  else await pushVideoSummary(item.userId, item.video, item.gym, item.detectMs);
}

function clipKey(r: SendRecord) {
  return r.clip.id ?? `${r.clip.start}-${r.clip.end}`;
}

function without(items: Item[], newer: Item): Item[] {
  const key = videoKey(newer.video);
  return items.flatMap((i) => {
    if (i.kind !== newer.kind || i.userId !== newer.userId || videoKey(i.video) !== key) return [i];
    if (i.kind === 'summary' || newer.kind === 'summary') return [];
    const replaced = new Set(newer.records.map(clipKey));
    const records = i.records.filter((r) => !replaced.has(clipKey(r)));
    return records.length > 0 ? [{ ...i, records }] : [];
  });
}

async function deliver(item: Item) {
  if (flushing) await flushing;
  write(without(read(), item));
  try {
    await send(item);
    return true;
  } catch (e) {
    console.log('queued', item.kind, String(e));
    write([...read(), item]);
    return false;
  }
}

export function deliverSends(userId: string, video: PickedVideo, records: SendRecord[]) {
  return deliver({ kind: 'sends', userId, at: Date.now(), video: slim(video), records });
}

export function deliverSummary(userId: string, video: PickedVideo, gym: GymCandidate | null, detectMs: number) {
  return deliver({ kind: 'summary', userId, at: Date.now(), video: slim(video), gym, detectMs });
}

export function reassignOutbox(from: string, to: string) {
  write(read().map((i) => (i.userId === from ? { ...i, userId: to } : i)));
}

export function flushOutbox() {
  if (flushing) return flushing;
  flushing = (async () => {
    const all = read();
    const items = all.filter((i) => Date.now() - i.at < MAX_AGE);
    if (items.length === 0) {
      if (all.length > 0) write(read().slice(all.length));
      return;
    }
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    const left: Item[] = [];
    for (const item of items) {
      if (item.userId !== userId) {
        left.push(item);
        continue;
      }
      try {
        await send(item);
      } catch (e) {
        console.log('outbox retry failed', String(e));
        left.push(item);
      }
    }
    const added = read().slice(all.length);
    write([...left, ...added]);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
