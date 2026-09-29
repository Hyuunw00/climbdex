import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClimbVideo } from '../../modules/climb-video';
import Timeline from '../components/Timeline';
import type { Clip, PickedVideo } from '../types';

type Props = {
  video: PickedVideo;
  onBack: () => void;
  onUpdate: (patch: Partial<PickedVideo>) => void;
};

const PAD_BEFORE = 3;
const PAD_AFTER = 2;
const THUMB_COUNT = 12;

function formatSeconds(seconds: number) {
  return seconds.toFixed(1) + 's';
}

function initialClips(video: PickedVideo): Clip[] {
  if (video.clips && video.clips.length > 0) return video.clips;
  if (video.segments && video.segments.length > 0) {
    return video.segments.map((seg) => ({
      start: Math.max(0, seg.start - PAD_BEFORE),
      end: Math.min(video.duration, seg.end + PAD_AFTER),
    }));
  }
  return [{ start: 0, end: video.duration }];
}

export default function TrimScreen({ video, onBack, onUpdate }: Props) {
  const [clips, setClips] = useState<Clip[]>(() => initialClips(video));
  const [current, setCurrent] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const clip = clips[current] ?? clips[0];

  const player = useVideoPlayer(video.uri, (p) => {
    p.timeUpdateEventInterval = 0.1;
  });

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime >= clip.end) player.pause();
    });
    return () => sub.remove();
  }, [player, clip.end]);

  useEffect(() => {
    const times = Array.from({ length: THUMB_COUNT }, (_, i) => ((i + 0.5) / THUMB_COUNT) * video.duration);
    ClimbVideo.thumbnails(video.uri, times, 160)
      .then(setThumbnails)
      .catch((e) => console.log('thumbnails error', String(e)));
  }, [video.uri, video.duration]);

  useEffect(() => {
    if (video.segments !== undefined && !video.clips) {
      const next = initialClips(video);
      setClips(next);
      setCurrent(0);
      seek(next[0].start);
    }
  }, [video.segments]);

  useEffect(() => {
    seek(clip.start);
  }, [current]);

  const seek = (time: number) => {
    player.pause();
    player.currentTime = time;
  };

  const updateClip = (start: number, end: number) => {
    const next = clips.map((c, i) => (i === current ? { start, end } : c));
    setClips(next);
    onUpdate({ clips: next });
  };

  const removeClip = (index: number) => {
    if (clips.length <= 1) return;
    const next = clips.filter((_, i) => i !== index);
    setClips(next);
    setCurrent(Math.min(current, next.length - 1));
    onUpdate({ clips: next });
  };

  const playRange = () => {
    player.currentTime = clip.start;
    player.play();
  };

  const save = async (targets: Clip[]) => {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert('사진 앱 저장 권한이 필요해요');
      return;
    }
    let done = 0;
    try {
      for (const target of targets) {
        setSaving(`저장 중 ${done + 1}/${targets.length}`);
        const outUri = await ClimbVideo.trim(video.uri, target.start, target.end);
        await MediaLibrary.saveToLibraryAsync(outUri);
        done += 1;
      }
      onUpdate({ saved: (video.saved ?? 0) + done });
      Alert.alert('저장했어요', `클립 ${done}개를 사진 앱에 넣었어요`);
    } catch (e) {
      Alert.alert('저장 실패', String(e));
    } finally {
      setSaving(null);
    }
  };

  const status =
    video.segments === undefined
      ? '시도 구간 찾는 중…'
      : video.segments.length === 0
        ? '시도 구간을 못 찾았어요. 직접 잡아 주세요'
        : `시도 구간 ${clips.length}개${video.handheld ? ' (들고 찍은 영상: 사람이 보이는 구간)' : ''}`;

  return (
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={saving === null}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← 목록</Text>
      </Pressable>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
      <Text style={styles.status}>{status}</Text>
      {clips.length > 1 && (
        <View style={styles.chips}>
          {clips.map((c, i) => (
            <Pressable key={i} style={[styles.chip, i === current && styles.chipActive]} onPress={() => setCurrent(i)}>
              <Text style={[styles.chipText, i === current && styles.chipTextActive]}>
                {i + 1}. {formatSeconds(c.start)}–{formatSeconds(c.end)}
              </Text>
              <Pressable hitSlop={8} onPress={() => removeClip(i)}>
                <Text style={[styles.chipRemove, i === current && styles.chipTextActive]}>×</Text>
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}
      <Timeline
        thumbnails={thumbnails}
        duration={video.duration}
        start={clip.start}
        end={clip.end}
        onChange={updateClip}
        onSeek={seek}
      />
      <View style={styles.labels}>
        <Text style={styles.label}>시작 {formatSeconds(clip.start)}</Text>
        <Text style={styles.label}>길이 {formatSeconds(clip.end - clip.start)}</Text>
        <Text style={styles.label}>끝 {formatSeconds(clip.end)}</Text>
      </View>
      <View style={styles.buttons}>
        <Pressable style={styles.secondary} onPress={playRange}>
          <Text style={styles.secondaryText}>구간 재생</Text>
        </Pressable>
        <Pressable style={[styles.primary, saving !== null && styles.disabled]} onPress={() => save([clip])} disabled={saving !== null}>
          <Text style={styles.primaryText}>{saving ?? '이 구간 저장'}</Text>
        </Pressable>
      </View>
      {clips.length > 1 && (
        <Pressable style={[styles.wide, saving !== null && styles.disabled]} onPress={() => save(clips)} disabled={saving !== null}>
          <Text style={styles.secondaryText}>모든 구간 저장 ({clips.length}개)</Text>
        </Pressable>
      )}
      {video.saved ? <Text style={styles.savedNote}>이 영상에서 저장한 클립 {video.saved}개</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, gap: 10 },
  back: { fontSize: 16, paddingVertical: 8 },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 380, backgroundColor: '#000', borderRadius: 8 },
  status: { fontSize: 14, color: '#666' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#eee',
  },
  chipActive: { backgroundColor: '#111' },
  chipText: { fontSize: 13 },
  chipTextActive: { color: '#fff' },
  chipRemove: { fontSize: 16, color: '#999' },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 14, color: '#333' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  secondary: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#111', alignItems: 'center' },
  secondaryText: { fontSize: 16 },
  primary: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#111', alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  wide: { paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#111', alignItems: 'center' },
  disabled: { opacity: 0.5 },
  savedNote: { fontSize: 13, color: '#888', textAlign: 'center' },
});
