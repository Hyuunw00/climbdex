import { View } from 'react-native';

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

type Part =
  | { kind?: 'rect'; x: number; y: number; w: number; h: number; r: [number, number, number, number]; skew?: string }
  | { kind: 'ring'; x: number; y: number; w: number; h: number; border: number }
  | { kind: 'triangle'; x: number; y: number; w: number; h: number };

const SHAPES: Part[][] = [
  [{ x: 0.18, y: 0.2, w: 0.64, h: 0.5, r: [0.32, 0.32, 0.18, 0.18] }, { x: 0.26, y: 0.6, w: 0.48, h: 0.18, r: [0.04, 0.04, 0.12, 0.12] }],
  [{ x: 0.12, y: 0.42, w: 0.76, h: 0.12, r: [0.06, 0.06, 0.03, 0.03] }, { x: 0.2, y: 0.52, w: 0.6, h: 0.2, r: [0.02, 0.02, 0.1, 0.1] }],
  [{ x: 0.14, y: 0.3, w: 0.72, h: 0.42, r: [0.36, 0.36, 0.08, 0.08] }],
  [{ x: 0.32, y: 0.14, w: 0.36, h: 0.3, r: [0.18, 0.18, 0.1, 0.1] }, { x: 0.4, y: 0.4, w: 0.2, h: 0.18, r: [0.04, 0.04, 0.04, 0.04] }, { x: 0.32, y: 0.54, w: 0.36, h: 0.3, r: [0.1, 0.1, 0.18, 0.18] }],
  [{ kind: 'ring', x: 0.21, y: 0.24, w: 0.58, h: 0.52, border: 0.15 }],
  [{ kind: 'triangle', x: 0.12, y: 0.2, w: 0.76, h: 0.58 }],
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
  const shape = hash(seed) % SHAPES.length;
  const fill = visited ? regionColor(region) : DIM;
  return (
    <View style={{ width: size, height: size }}>
      {SHAPES[shape].map((p, i) => {
        const box = { position: 'absolute' as const, left: p.x * size, top: p.y * size, width: p.w * size, height: p.h * size };
        if (p.kind === 'ring') {
          return <View key={i} style={[box, { borderRadius: (p.w * size) / 2, borderWidth: p.border * size, borderColor: fill }]} />;
        }
        if (p.kind === 'triangle') {
          return (
            <View
              key={i}
              style={[
                box,
                {
                  width: 0,
                  height: 0,
                  borderLeftWidth: (p.w * size) / 2,
                  borderRightWidth: (p.w * size) / 2,
                  borderBottomWidth: p.h * size,
                  borderLeftColor: 'transparent',
                  borderRightColor: 'transparent',
                  borderBottomColor: fill,
                },
              ]}
            />
          );
        }
        return (
          <View
            key={i}
            style={[
              box,
              {
                backgroundColor: fill,
                borderTopLeftRadius: p.r[0] * size,
                borderTopRightRadius: p.r[1] * size,
                borderBottomRightRadius: p.r[2] * size,
                borderBottomLeftRadius: p.r[3] * size,
                transform: p.skew ? [{ skewX: p.skew }] : undefined,
              },
            ]}
          />
        );
      })}
    </View>
  );
}
