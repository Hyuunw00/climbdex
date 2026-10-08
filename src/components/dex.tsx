import { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
import { type Gym, formatNo } from '../data/gyms';
import type { DexState } from '../store/dex';
import { colors } from '../theme';

export const RED = colors.accent;
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

export function GymCard({ gym, dex, size, onPress, delay }: { gym: Gym; dex: DexState; size: number; onPress: () => void; delay?: number }) {
  const count = dex.visits.filter((v) => v.gymId === gym.id).length;
  const visited = count > 0;
  const photo = visited ? dex.photos[gym.id] : undefined;
  const rise = useRef(new Animated.Value(delay === undefined ? 1 : 0)).current;
  useEffect(() => {
    if (delay === undefined) return;
    Animated.timing(rise, { toValue: 1, duration: 260, delay, useNativeDriver: true }).start();
  }, [delay, rise]);
  return (
    <AnimatedPressable style={[styles.cell, { width: size, opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]} onPress={onPress}>
      <View style={[styles.card, { height: size * 1.1 }, visited && styles.cardVisited]}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <WallPanel width={size - 4} height={size * 1.1 - 4} visited={visited} seed={gym.id} region={gym.region1} />}
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
    </AnimatedPressable>
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
  require('../../assets/holds/sloper.png'),
  require('../../assets/holds/crimp.png'),
  require('../../assets/holds/pinch.png'),
  require('../../assets/holds/pocket.png'),
  require('../../assets/holds/volume.png'),
  require('../../assets/holds/foot.png'),
  require('../../assets/holds/edge.png'),
  require('../../assets/holds/macro.png'),
  require('../../assets/holds/dual.png'),
  require('../../assets/holds/screwon.png'),
  require('../../assets/holds/cube.png'),
];
const OUTLINES = [
  require('../../assets/holds/outline/jug.png'),
  require('../../assets/holds/outline/sloper.png'),
  require('../../assets/holds/outline/crimp.png'),
  require('../../assets/holds/outline/pinch.png'),
  require('../../assets/holds/outline/pocket.png'),
  require('../../assets/holds/outline/volume.png'),
  require('../../assets/holds/outline/foot.png'),
  require('../../assets/holds/outline/edge.png'),
  require('../../assets/holds/outline/macro.png'),
  require('../../assets/holds/outline/dual.png'),
  require('../../assets/holds/outline/screwon.png'),
  require('../../assets/holds/outline/cube.png'),
];

const DIM = '#b4b8bf';
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
  const index = hash(seed) % HOLDS.length;
  const source = visited ? HOLDS[index] : OUTLINES[index];
  return <Image source={source} style={{ width: size, height: size, tintColor: visited ? regionColor(region) : DIM }} resizeMode="contain" />;
}

const PANEL_COLS = 4;

export function WallPanel({ width, height, visited, seed, region, hold }: { width: number; height: number; visited: boolean; seed: string; region: string; hold?: number }) {
  const step = width / PANEL_COLS;
  const rows = Math.max(2, Math.round(height / step));
  const dots: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < PANEL_COLS; c++) dots.push({ x: step * (c + 0.5), y: (height / rows) * (r + 0.5) });
  const holdSize = hold ?? Math.min(width, height) * 0.72;
  return (
    <View style={[styles.panel, { width, height }, visited ? styles.panelVisited : styles.panelEmpty]}>
      {dots.map((d, i) => (
        <View key={i} style={[styles.nut, visited ? styles.nutVisited : styles.nutEmpty, { left: d.x - 2.5, top: d.y - 2.5 }]} />
      ))}
      {visited && <View style={[styles.holdShadow, { width: holdSize * 0.9, height: holdSize * 0.5, borderRadius: holdSize * 0.3, top: height / 2 + holdSize * 0.1 }]} />}
      <Silhouette size={holdSize} visited={visited} seed={seed} region={region} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  cell: { gap: 5 },
  card: { borderRadius: 14, backgroundColor: '#e8e9ec', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  cardVisited: { borderColor: RED, backgroundColor: '#ecdfc8' },
  panel: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  panelVisited: { backgroundColor: '#ecdfc8' },
  panelEmpty: { backgroundColor: '#e8e9ec' },
  nut: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5 },
  nutVisited: { backgroundColor: 'rgba(90,70,40,0.22)' },
  nutEmpty: { backgroundColor: 'rgba(0,0,0,0.08)' },
  holdShadow: { position: 'absolute', backgroundColor: 'rgba(60,40,10,0.18)' },
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
