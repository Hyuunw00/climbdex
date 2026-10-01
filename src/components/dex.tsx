import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { type Gym, formatNo } from '../data/gyms';
import type { DexState } from '../store/dex';

export const RED = '#d7263d';
export const CHECKIN_METERS = 100;
export const SKIP_DISTANCE_CHECK = false;

export function allowedMeters(accuracy: number | null | undefined) {
  return Math.max(CHECKIN_METERS, accuracy ?? 0);
}

export function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

export function formatDate(value: string | number | Date) {
  const d = new Date(value);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function daysSince(value: string | number | Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

export function formatAgo(value: string | number | Date) {
  const days = daysSince(value);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

export function Progress({ value, total, color = RED, track = '#eee' }: { value: number; total: number; color?: string; track?: string }) {
  const ratio = total > 0 ? value / total : 0;
  return (
    <View style={[styles.track, { backgroundColor: track }]}>
      <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

export function GymCard({ gym, dex, size, onPress }: { gym: Gym; dex: DexState; size: number; onPress: () => void }) {
  const count = dex.visits.filter((v) => v.gymId === gym.id).length;
  const visited = count > 0;
  const photo = visited ? dex.photos[gym.id] : undefined;
  return (
    <Pressable style={[styles.cell, { width: size }]} onPress={onPress}>
      <View style={[styles.card, { height: size * 1.1 }, visited && styles.cardVisited]}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <Silhouette size={size * 0.8} visited={visited} seed={gym.id} region={gym.region1} />}
        <Text style={[styles.no, visited && styles.noVisited]}>{formatNo(gym.no)}</Text>
        {visited && (
          <View style={styles.stamp}>
            <Text style={styles.stampText}>{count > 1 ? `×${count}` : '✓'}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.name, !visited && styles.nameDim]} numberOfLines={2}>
        {gym.name}
      </Text>
    </Pressable>
  );
}

export function GymRow({ gym, dex, meta, onPress }: { gym: Gym; dex: DexState; meta: string; onPress: () => void }) {
  const visited = dex.visits.some((v) => v.gymId === gym.id);
  const photo = visited ? dex.photos[gym.id] : undefined;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.rowThumb, visited && styles.rowThumbVisited]}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <Silhouette size={40} visited={visited} seed={gym.id} region={gym.region1} />}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {gym.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {visited && (
        <View style={styles.stampInline}>
          <Text style={styles.stampText}>✓</Text>
        </View>
      )}
    </Pressable>
  );
}

const HOLDS = [
  require('../../assets/holds/jug.png'),
  require('../../assets/holds/crimp.png'),
  require('../../assets/holds/sloper.png'),
  require('../../assets/holds/pinch.png'),
  require('../../assets/holds/pocket.png'),
  require('../../assets/holds/volume.png'),
  require('../../assets/holds/foot.png'),
  require('../../assets/holds/edge.png'),
];

const DIM = '#3a3a44';
const REGION_COLORS: Record<string, string> = {
  서울: '#e63946',
  경기: '#f4743b',
  충남: '#f2a900',
  경남: '#b5c400',
  경북: '#6ab417',
  전북: '#2aa84a',
  인천: '#1fa17a',
  울산: '#12a3a0',
  부산: '#1198b8',
  강원: '#2b7fd3',
  대전: '#3f5fe0',
  세종: '#6a4ce6',
  충북: '#8f3fd8',
  '광주·전남': '#b83fc4',
  대구: '#d63f9c',
  제주: '#e0437a',
};

export function regionColor(region: string) {
  return REGION_COLORS[region] ?? RED;
}

function hash(seed: string) {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 33) ^ seed.charCodeAt(i)) >>> 0;
  return h;
}

export function Silhouette({ size, visited, seed, region }: { size: number; visited: boolean; seed: string; region: string }) {
  const source = HOLDS[hash(seed) % HOLDS.length];
  return <Image source={source} style={{ width: size, height: size, tintColor: visited ? regionColor(region) : DIM }} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  cell: { gap: 5 },
  card: { borderRadius: 14, backgroundColor: '#eceef2', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  cardVisited: { borderColor: RED, backgroundColor: '#fff3d6' },
  photo: { width: '100%', height: '100%' },
  no: { position: 'absolute', left: 8, top: 6, fontSize: 11, fontWeight: '700', color: '#8a8a94' },
  noVisited: { color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  stamp: { position: 'absolute', right: 6, top: 6, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  stampInline: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  stampText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  name: { fontSize: 12, fontWeight: '600', color: '#111', lineHeight: 16 },
  nameDim: { color: '#999', fontWeight: '400' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e5' },
  rowThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#eceef2', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  rowThumbVisited: { borderColor: RED, backgroundColor: '#fff3d6' },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12, color: '#888' },
});
