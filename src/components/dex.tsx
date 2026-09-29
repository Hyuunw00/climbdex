import { View } from 'react-native';

export const RED = '#d7263d';
export const CHECKIN_METERS = 100;
export const SKIP_DISTANCE_CHECK = false;

export function allowedMeters(accuracy: number | null | undefined) {
  return Math.max(CHECKIN_METERS, accuracy ?? 0);
}

export function Silhouette({ size, visited }: { size: number; visited: boolean }) {
  const color = visited ? '#f2a900' : '#3a3a44';
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.52, height: size * 0.34, backgroundColor: color, borderTopLeftRadius: size * 0.26, borderTopRightRadius: size * 0.2, borderBottomLeftRadius: size * 0.08, borderBottomRightRadius: size * 0.3 }} />
      <View style={{ width: size * 0.22, height: size * 0.16, backgroundColor: color, borderRadius: size * 0.11, marginTop: size * 0.06, marginLeft: size * 0.2 }} />
    </View>
  );
}
