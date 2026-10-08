import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';

type Props = {
  thumbnails: string[];
  duration: number;
  start: number;
  end: number;
  position: number;
  viewStart?: number;
  viewEnd?: number;
  onChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  onScrub: (time: number) => void;
  onRelease?: () => void;
};

const MIN_GAP = 0.5;
const HANDLE = 20;
const HEIGHT = 64;

export default function Timeline({ thumbnails, duration, start, end, position, viewStart, viewEnd, onChange, onSeek, onScrub, onRelease }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const range = useRef({ start, end });
  range.current = { start, end };
  const vs = viewStart ?? 0;
  const ve = viewEnd ?? duration;
  const callbacks = useRef({ onChange, onSeek, onScrub, onRelease, vs, ve });
  callbacks.current = { onChange, onSeek, onScrub, onRelease, vs, ve };
  const origin = useRef(0);
  const containerRef = useRef<View>(null);
  const pageX = useRef(0);

  const toTime = (x: number) => {
    const { vs: a, ve: b } = callbacks.current;
    return Math.min(b, Math.max(a, a + (x / widthRef.current) * (b - a)));
  };
  const toX = (t: number) => (ve > vs ? ((t - vs) / (ve - vs)) * width : 0);

  const lastBump = useRef(0);
  const bump = () => {
    const now = Date.now();
    if (now - lastBump.current < 250) return;
    lastBump.current = now;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const makeResponder = (side: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        origin.current = range.current[side];
        Haptics.selectionAsync().catch(() => {});
      },
      onPanResponderMove: (_, g) => {
        const { onChange: change, onSeek: seekTo, vs: a, ve: b } = callbacks.current;
        const t = toTime(((origin.current - a) / (b - a)) * widthRef.current + g.dx);
        const { start: s, end: e } = range.current;
        if (side === 'start') {
          const next = Math.min(t, e - MIN_GAP);
          if (next !== t || next <= 0) bump();
          change(next, e);
          seekTo(next);
        } else {
          const next = Math.max(t, s + MIN_GAP);
          if (next !== t || next >= duration) bump();
          change(s, next);
          seekTo(next);
        }
      },
      onPanResponderRelease: () => {
        Haptics.selectionAsync().catch(() => {});
        callbacks.current.onRelease?.();
      },
      onPanResponderTerminate: () => callbacks.current.onRelease?.(),
    });

  const startResponder = useRef(makeResponder('start')).current;
  const endResponder = useRef(makeResponder('end')).current;
  const scrubResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, g) => scrubTo(g.x0 - pageX.current),
      onPanResponderMove: (_, g) => scrubTo(g.moveX - pageX.current),
    }),
  ).current;

  function scrubTo(x: number) {
    callbacks.current.onScrub(toTime(x));
  }

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
        containerRef.current?.measureInWindow((x) => {
          pageX.current = x;
        });
      }}
    >
      <View style={styles.strip} pointerEvents="none">
        {thumbnails.map((uri, i) => (
          <Image key={i} source={{ uri }} style={styles.thumb} />
        ))}
      </View>
      <View style={styles.scrubLayer} {...scrubResponder.panHandlers} />
      {width > 0 && (
        <>
          <View pointerEvents="none" style={[styles.dim, { left: 0, width: Math.max(0, toX(start)) }]} />
          <View pointerEvents="none" style={[styles.dim, { left: Math.min(width, toX(end)), right: 0 }]} />
          <View pointerEvents="none" style={[styles.window, { left: Math.max(0, toX(start)), width: Math.max(0, Math.min(width, toX(end)) - Math.max(0, toX(start))) }]} />
          {position >= vs && position <= ve && <View pointerEvents="none" style={[styles.playhead, { left: toX(position) - 1 }]} />}
          {start >= vs && (
            <View {...startResponder.panHandlers} style={[styles.handle, { left: toX(start) - HANDLE / 2 }]} hitSlop={12}>
              <View style={styles.grip} />
            </View>
          )}
          {end <= ve && (
            <View {...endResponder.panHandlers} style={[styles.handle, { left: toX(end) - HANDLE / 2 }]} hitSlop={12}>
              <View style={styles.grip} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: HEIGHT, marginVertical: 8 },
  strip: { flexDirection: 'row', height: HEIGHT, borderRadius: 6, overflow: 'hidden', backgroundColor: '#ddd' },
  scrubLayer: { position: 'absolute', left: 0, right: 0, top: 0, height: HEIGHT },
  thumb: { flex: 1, height: HEIGHT },
  dim: { position: 'absolute', top: 0, height: HEIGHT, backgroundColor: 'rgba(255,255,255,0.65)' },
  window: { position: 'absolute', top: 0, height: HEIGHT, borderWidth: 2, borderColor: '#111', borderRadius: 4 },
  playhead: { position: 'absolute', top: -4, width: 2, height: HEIGHT + 8, backgroundColor: '#e5322d', borderRadius: 1 },
  handle: {
    position: 'absolute',
    top: -6,
    width: HANDLE,
    height: HEIGHT + 12,
    borderRadius: 6,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grip: { width: 3, height: 22, borderRadius: 2, backgroundColor: '#fff' },
});
