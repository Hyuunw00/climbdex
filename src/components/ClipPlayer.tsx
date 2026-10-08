import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ClimbVideo } from '../../modules/climb-video';
import { deleteFile } from '../videoFiles';
import Timeline from './Timeline';
import { SAVE_DENIED, askSettings } from '../permissions';
import { colors } from '../theme';
import { ToastHost, showToast } from './Toast';

export type PlayItem = { key: string; uri: string; start: number; end: number; title: string; editable: boolean };

type Props = {
  items: PlayItem[];
  initial: number;
  onClose: () => void;
  onSaved: (key: string, start: number, end: number) => Promise<void>;
};

const THUMB_COUNT = 12;

function windowFor(start: number, end: number, duration: number) {
  const margin = Math.max(5, (end - start) * 0.5);
  return { start: Math.max(0, start - margin), end: Math.min(duration, end + margin) };
}

export default function ClipPlayer({ items, initial, onClose, onSaved }: Props) {
  const [index, setIndex] = useState(initial);
  const item = items[Math.min(index, items.length - 1)];
  const [range, setRange] = useState({ start: item.start, end: item.end });
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(item.start);
  const [playing, setPlaying] = useState(false);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const source = useRef<string | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.1;
  });
  const view = duration > 0 ? windowFor(item.start, item.end, duration) : null;

  useEffect(() => {
    let cancelled = false;
    setRange({ start: item.start, end: item.end });
    setPosition(item.start);
    setDuration(0);
    setThumbnails([]);
    setFailed(false);
    (async () => {
      try {
        const uri = item.uri.startsWith('ph://') && ClimbVideo.resolveUri ? await ClimbVideo.resolveUri(item.uri) : item.uri;
        if (cancelled) return;
        if (source.current !== uri) {
          await player.replaceAsync(uri);
          source.current = uri;
        }
        if (cancelled) return;
        player.currentTime = item.start;
        player.play();
        if (player.duration > 0) setDuration(player.duration);
      } catch (e) {
        console.log('clip player error', String(e));
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [index]);

  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    const times = Array.from({ length: THUMB_COUNT }, (_, i) => view.start + ((i + 0.5) / THUMB_COUNT) * (view.end - view.start));
    ClimbVideo.thumbnails(item.uri, times, 160)
      .then((uris) => {
        if (!cancelled) setThumbnails(uris);
      })
      .catch((e) => console.log('clip player thumbnails error', String(e)));
    return () => {
      cancelled = true;
    };
  }, [index, duration]);

  useEffect(() => {
    const time = player.addListener('timeUpdate', ({ currentTime }) => {
      setPosition(currentTime);
      const { start, end } = rangeRef.current;
      if (currentTime >= end && currentTime < end + 1) {
        player.pause();
        player.currentTime = start;
      }
    });
    const state = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    const status = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && player.duration > 0) setDuration(player.duration);
    });
    return () => {
      time.remove();
      state.remove();
      status.remove();
    };
  }, [player]);

  const seek = (t: number) => {
    player.currentTime = t;
    setPosition(t);
  };

  const toggle = () => {
    if (playing) return player.pause();
    if (position < range.start || position >= range.end - 0.1) seek(range.start);
    player.play();
  };

  const move = (delta: number) => setIndex(Math.max(0, Math.min(items.length - 1, index + delta)));

  const save = async () => {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return askSettings(...SAVE_DENIED);
    setSaving(true);
    player.pause();
    try {
      const out = await ClimbVideo.trim(item.uri, range.start, range.end);
      if (ClimbVideo.saveClip) await ClimbVideo.saveClip(out);
      else await MediaLibrary.saveToLibraryAsync(out);
      deleteFile(out);
      await onSaved(item.key, range.start, range.end);
      showToast('사진 앱에 새 클립으로 넣었어요');
    } catch (e) {
      Alert.alert('저장 실패', String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        {failed ? (
          <View style={styles.videoBox}>
            <Text style={styles.message}>원본 영상을 찾지 못했어요</Text>
          </View>
        ) : (
          <Pressable style={styles.videoBox} onPress={toggle}>
            <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
            {duration === 0 && <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" />}
          </Pressable>
        )}
        {view && !failed && (
          <View style={styles.timeline}>
            <Timeline
              thumbnails={thumbnails}
              duration={duration}
              start={range.start}
              end={range.end}
              position={position}
              viewStart={view.start}
              viewEnd={view.end}
              onChange={(start, end) => setRange({ start, end })}
              onSeek={seek}
              onScrub={seek}
            />
            <Text style={styles.length}>
              {(range.end - range.start).toFixed(1)}초
            </Text>
          </View>
        )}
        <View style={styles.nav}>
          <Pressable onPress={() => move(-1)} disabled={index === 0} hitSlop={12}>
            <Ionicons name="chevron-back" size={28} color={index === 0 ? '#444' : '#fff'} />
          </Pressable>
          <Text style={styles.count}>
            {index + 1}/{items.length}
          </Text>
          <Pressable onPress={() => move(1)} disabled={index === items.length - 1} hitSlop={12}>
            <Ionicons name="chevron-forward" size={28} color={index === items.length - 1 ? '#444' : '#fff'} />
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.secondary} onPress={toggle} disabled={failed}>
            <Text style={styles.secondaryText}>{playing ? '일시정지' : '재생'}</Text>
          </Pressable>
          {item.editable && (
            <Pressable style={[styles.primary, saving && styles.primaryOff]} onPress={save} disabled={saving || failed}>
              <Text style={styles.primaryText}>{saving ? '저장 중…' : '이 구간 저장'}</Text>
            </Pressable>
          )}
        </View>
      </View>
      <ToastHost above={16} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  title: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  close: { color: '#fff', fontSize: 22 },
  videoBox: { flex: 1, justifyContent: 'center' },
  video: { flex: 1 },
  message: { color: '#aaa', textAlign: 'center' },
  timeline: { paddingHorizontal: 16, paddingTop: 12, gap: 6 },
  length: { color: '#aaa', fontSize: 12, textAlign: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, paddingTop: 8 },
  count: { color: '#fff', fontSize: 15, fontWeight: '700', minWidth: 48, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  secondary: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#555', alignItems: 'center' },
  secondaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  primary: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center' },
  primaryOff: { opacity: 0.4 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
