import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { type Gym, formatNo } from '../data/gyms';
import { RED, Silhouette, formatDate, regionColor } from './dex';

export type CardRatio = '1:1' | '4:5' | '9:16';
export type ShareCardProps = { gym: Gym; photo?: string; rank: number; date?: Date; total: number; ratio?: CardRatio };

export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 640;
export const RATIOS: Record<CardRatio, { height: number; out: [number, number] }> = {
  '1:1': { height: 360, out: [1080, 1080] },
  '4:5': { height: 450, out: [1080, 1350] },
  '9:16': { height: 640, out: [1080, 1920] },
};

const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard({ gym, photo, rank, date = new Date(), total, ratio = '9:16' }, ref) {
  const color = regionColor(gym.region1);
  const compact = ratio === '1:1';
  const height = RATIOS[ratio].height;
  const frame = compact ? 150 : ratio === '4:5' ? 220 : 264;
  return (
    <View ref={ref} collapsable={false} style={[styles.card, { height, paddingTop: compact ? 22 : ratio === '4:5' ? 44 : 96 }]}>
      <View style={styles.top}>
        <Text style={styles.brand}>CLIMBDEX</Text>
        <Text style={styles.no}>{formatNo(gym.no)}</Text>
      </View>
      <View style={[styles.frame, { borderColor: color, width: frame, height: frame, marginBottom: compact ? 12 : 24 }]}>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <Silhouette size={frame * 0.75} visited seed={gym.id} region={gym.region1} />}
      </View>
      <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={compact ? 1 : 2}>
        {gym.name}
      </Text>
      <Text style={styles.region}>
        {gym.region1} {gym.region2}
      </Text>
      <View style={[styles.badge, { backgroundColor: color, marginTop: compact ? 10 : 22 }]}>
        <Text style={styles.badgeText}>내 {rank}번째 암장</Text>
      </View>
      <View style={[styles.bottom, { bottom: compact ? 18 : ratio === '4:5' ? 36 : 112 }]}>
        <Text style={styles.date}>{formatDate(date)}</Text>
        <Text style={styles.progress}>
          {rank} / {total}
        </Text>
      </View>
    </View>
  );
});

export default ShareCard;

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: '#111', alignItems: 'center', paddingTop: 96, paddingHorizontal: 28 },
  top: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  brand: { color: RED, fontSize: 14, fontWeight: '900', letterSpacing: 3 },
  no: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  frame: { width: 264, height: 264, borderRadius: 28, borderWidth: 5, backgroundColor: '#fff3d6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 24 },
  photo: { width: '100%', height: '100%' },
  name: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', lineHeight: 34 },
  nameCompact: { fontSize: 22, lineHeight: 26 },
  region: { color: 'rgba(255,255,255,0.65)', fontSize: 15, marginTop: 6 },
  badge: { marginTop: 22, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  bottom: { position: 'absolute', bottom: 112, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between' },
  date: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  progress: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontVariant: ['tabular-nums'] },
});
