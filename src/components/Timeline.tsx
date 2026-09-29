import { useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';

type Props = {
  thumbnails: string[];
  duration: number;
  start: number;
  end: number;
  position: number;
  onChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  onScrub: (time: number) => void;
  onRelease?: () => void;
};

const MIN_GAP = 0.5;
const HANDLE = 20;
const HEIGHT = 64;

export default function Timeline({ thumbnails, duration, start, end, position, onChange, onSeek, onScrub, onRelease }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const range = useRef({ start, end });
  range.current = { start, end };
  const callbacks = useRef({ onChange, onSeek, onScrub, onRelease, duration });
  callbacks.current = { onChange, onSeek, onScrub, onRelease, duration };
  const origin = useRef(0);

  const toTime = (x: number) => {
    const d = callbacks.current.duration;
    return Math.min(d, Math.max(0, (x / widthRef.current) * d));
  };
  const toX = (t: number) => (duration > 0 ? (t / duration) * width : 0);

  const makeResponder = (side: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        origin.current = range.current[side];
      },
      onPanResponderMove: (_, g) => {
        const { onChange: change, onSeek: seekTo, duration: d } = callbacks.current;
        const t = toTime((origin.current / d) * widthRef.current + g.dx);
        const { start: s, end: e } = range.current;
        if (side === 'start') {
          const next = Math.min(t, e - MIN_GAP);
          change(next, e);
          seekTo(next);
        } else {
          const next = Math.max(t, s + MIN_GAP);
          change(s, next);
          seekTo(next);
        }
      },
      onPanResponderRelease: () => callbacks.current.onRelease?.(),
      onPanResponderTerminate: () => callbacks.current.onRelease?.(),
    });

  const startResponder = useRef(makeResponder('start')).current;
  const endResponder = useRef(makeResponder('end')).current;
  const scrubResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => scrubTo(e.nativeEvent.locationX),
      onPanResponderMove: (e) => scrubTo(e.nativeEvent.locationX),
    }),
  ).current;

  function scrubTo(x: number) {
    const { start: s, end: e } = range.current;
    callbacks.current.onScrub(Math.min(e, Math.max(s, toTime(x))));
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
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
          <View pointerEvents="none" style={[styles.dim, { left: 0, width: toX(start) }]} />
          <View pointerEvents="none" style={[styles.dim, { left: toX(end), right: 0 }]} />
          <View pointerEvents="none" style={[styles.window, { left: toX(start), width: Math.max(0, toX(end) - toX(start)) }]} />
          <View pointerEvents="none" style={[styles.playhead, { left: toX(Math.min(end, Math.max(start, position))) - 1 }]} />
          <View {...startResponder.panHandlers} style={[styles.handle, { left: toX(start) - HANDLE / 2 }]} hitSlop={12}>
            <View style={styles.grip} />
          </View>
          <View {...endResponder.panHandlers} style={[styles.handle, { left: toX(end) - HANDLE / 2 }]} hitSlop={12}>
            <View style={styles.grip} />
          </View>
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
