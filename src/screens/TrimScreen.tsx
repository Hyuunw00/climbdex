import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { ClimbVideo, type FollowPlan } from '../../modules/climb-video';
import FollowPreview from '../components/FollowPreview';
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
  const [position, setPosition] = useState(0);
  const [follow, setFollow] = useState(false);
  const [plan, setPlan] = useState<FollowPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const previewHeight = Math.min(380, (screenWidth - 32) * (16 / 9));
  const previewWidth = previewHeight * (9 / 16);

  const clip = clips[current] ?? clips[0];

  const player = useVideoPlayer(video.uri, (p) => {
    p.timeUpdateEventInterval = 0.1;
  });

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      setPosition(currentTime);
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

  const loadPlan = async () => {
    setPlanning(true);
    try {
      setPlan(await ClimbVideo.followPath(video.uri, clip.start, clip.end));
    } catch (e) {
      setPlan(null);
      Alert.alert('따라가기 경로를 못 만들었어요', String(e));
      setFollow(false);
    } finally {
      setPlanning(false);
    }
  };

  useEffect(() => {
    if (follow) loadPlan();
    else setPlan(null);
  }, [follow, current]);

  const seek = (time: number) => {
    player.pause();
    player.currentTime = time;
    setPosition(time);
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

  const reset = () => {
    Alert.alert('처음 찾은 구간으로 되돌릴까요?', '편집한 구간은 사라져요', [
      { text: '취소', style: 'cancel' },
      {
        text: '되돌리기',
        style: 'destructive',
        onPress: () => {
          const next = initialClips({ ...video, clips: undefined });
          setClips(next);
          setCurrent(0);
          seek(next[0].start);
          onUpdate({ clips: undefined });
        },
      },
    ]);
  };

  const playRange = () => {
    const from = position > clip.start && position < clip.end - 0.2 ? position : clip.start;
    player.currentTime = from;
    setPosition(from);
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
        setSaving(`${follow ? '따라가기 ' : ''}저장 중 ${done + 1}/${targets.length}`);
        const outUri = follow
          ? await ClimbVideo.exportFollow(video.uri, target.start, target.end)
          : await ClimbVideo.trim(video.uri, target.start, target.end);
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
      {follow && plan ? (
        <FollowPreview player={player} plan={plan} width={previewWidth} height={previewHeight} />
      ) : (
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
      )}
      {follow && planning && (
        <View style={styles.planning}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.followHint}>따라가기 경로 계산 중…</Text>
        </View>
      )}
      <View style={styles.statusRow}>
        <Text style={styles.status}>{status}</Text>
        {video.clips && (
          <Pressable onPress={reset} hitSlop={8}>
            <Text style={styles.reset}>처음으로</Text>
          </Pressable>
        )}
      </View>
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
        position={position}
        onChange={updateClip}
        onSeek={seek}
        onScrub={seek}
        onRelease={() => {
          if (follow) loadPlan();
        }}
      />
      <View style={styles.labels}>
        <Text style={styles.label}>시작 {formatSeconds(clip.start)}</Text>
        <Text style={styles.label}>현재 {formatSeconds(position)} · 길이 {formatSeconds(clip.end - clip.start)}</Text>
        <Text style={styles.label}>끝 {formatSeconds(clip.end)}</Text>
      </View>
      <View style={styles.followRow}>
        <View style={styles.followText}>
          <Text style={styles.label}>클라이머 따라가기</Text>
          <Text style={styles.followHint}>세로 9:16으로 잘라 클라이머를 따라갑니다. 저장이 오래 걸려요</Text>
        </View>
        <Switch value={follow} onValueChange={setFollow} trackColor={{ true: '#111' }} />
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
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  status: { fontSize: 14, color: '#666', flex: 1 },
  reset: { fontSize: 14, color: '#0a58ca' },
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
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  planning: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  followText: { flex: 1, gap: 2 },
  followHint: { fontSize: 12, color: '#888' },
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
