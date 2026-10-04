import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { ClimbVideo, type FollowPlan } from '../../modules/climb-video';
import FollowPreview from '../components/FollowPreview';
import Timeline from '../components/Timeline';
import type { Clip, PickedVideo } from '../types';
import { clipsOf } from '../clips';
import { deleteFile } from '../videoFiles';
import type { Settings } from '../settings';

type Props = {
  video: PickedVideo;
  settings: Settings;
  index: number;
  total: number;
  onBack: () => void;
  onNavigate: (delta: number) => void;
  onUpdate: (patch: Partial<PickedVideo>) => void;
};

const THUMB_COUNT = 12;

function windowFor(clip: Clip, duration: number) {
  const margin = Math.max(3, (clip.end - clip.start) * 0.25);
  return { start: Math.max(0, clip.start - margin), end: Math.min(duration, clip.end + margin) };
}

function formatSeconds(seconds: number) {
  return seconds.toFixed(1) + 's';
}


export default function TrimScreen({ video, settings, index, total, onBack, onNavigate, onUpdate }: Props) {
  const initialClips = (v: PickedVideo) => clipsOf(v, settings);
  const [clips, setClips] = useState<Clip[]>(() => initialClips(video));
  const [current, setCurrent] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [view, setView] = useState<{ start: number; end: number } | null>(() => {
    const first = initialClips(video);
    return first.length > 1 ? windowFor(first[0], video.duration) : null;
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [position, setPosition] = useState(() => initialClips(video)[0].start);
  const [follow, setFollow] = useState(false);
  const [plan, setPlan] = useState<FollowPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const previewHeight = Math.min(460, (screenWidth - 32) * (16 / 9));
  const previewWidth = previewHeight * (9 / 16);

  const clip = clips[current] ?? clips[0];
  const freePlay = useRef(false);

  const player = useVideoPlayer(video.uri.startsWith('ph://') ? null : video.uri, (p) => {
    p.timeUpdateEventInterval = 0.1;
  });

  useEffect(() => {
    if (!video.uri.startsWith('ph://')) return;
    let cancelled = false;
    ClimbVideo.resolveUri?.(video.uri)
      .then(async (uri) => {
        if (cancelled) return;
        await player.replaceAsync(uri);
        player.currentTime = clipsOf(video, settings)[0]?.start ?? 0;
        player.play();
      })
      .catch((e) => Alert.alert('영상을 열지 못했어요', String((e as Error)?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [video.uri]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    return () => sub.remove();
  }, [player]);

  const togglePlay = () => {
    if (playing) player.pause();
    else playRange();
  };

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      setPosition(currentTime);
      if (!freePlay.current && currentTime >= clip.end && currentTime < clip.end + 1) player.pause();
    });
    return () => sub.remove();
  }, [player, clip.end]);

  useEffect(() => {
    const from = view?.start ?? 0;
    const to = view?.end ?? video.duration;
    const times = Array.from({ length: THUMB_COUNT }, (_, i) => from + ((i + 0.5) / THUMB_COUNT) * (to - from));
    let cancelled = false;
    ClimbVideo.thumbnails(video.uri, times, 160)
      .then((uris) => {
        if (!cancelled) setThumbnails(uris);
      })
      .catch((e) => console.log('thumbnails error', String(e)));
    return () => {
      cancelled = true;
    };
  }, [video.uri, video.duration, view?.start, view?.end]);

  useEffect(() => {
    if (video.segments !== undefined && !video.clips) {
      const next = initialClips(video);
      setClips(next);
      setCurrent(0);
      seek(next[0].start);
    }
  }, [video.segments]);

  const autoPlay = useRef(true);

  useEffect(() => {
    seek(clip.start);
    if (autoPlay.current) {
      autoPlay.current = false;
      freePlay.current = false;
      player.play();
    }
  }, [current]);

  const selectClip = (index: number) => {
    autoPlay.current = true;
    setView(windowFor(clips[index], video.duration));
    if (index === current) {
      seek(clip.start);
      player.play();
    } else {
      setCurrent(index);
    }
  };

  const loadPlan = async () => {
    setPlanning(true);
    try {
      setPlan(await ClimbVideo.followPath(video.uri, clip.start, clip.end, video.tracks));
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
    player.currentTime = time;
    setPosition(time);
  };

  const updateClip = (start: number, end: number) => {
    const next = clips.map((c, i) => (i === current ? { ...c, start, end } : c));
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

  const inside = position >= clip.start && position < clip.end - 0.2;

  const playRange = () => {
    freePlay.current = !inside;
    const from = inside ? position : position >= clip.end - 0.2 && position < clip.end + 0.2 ? clip.start : position;
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
          ? await ClimbVideo.exportFollow(video.uri, target.start, target.end, video.tracks)
          : await ClimbVideo.trim(video.uri, target.start, target.end);
        await MediaLibrary.saveToLibraryAsync(outUri);
        deleteFile(outUri);
        done += 1;
      }
      const marked = clips.map((c) => (targets.includes(c) ? { ...c, saved: true } : c));
      setClips(marked);
      onUpdate({ saved: (video.saved ?? 0) + done, clips: marked });
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
      : video.segments.length === 0 && !video.candidates?.length
        ? '시도 구간을 못 찾았어요. 직접 잡아 주세요'
        : `시도 구간 ${clips.length}개${video.handheld ? ' (들고 찍은 영상: 사람이 보이는 구간)' : ''}`;

  const shownPlan = follow ? plan : null;
  const boxWidth = shownPlan ? previewWidth : screenWidth - 32;

  return (
    <View style={styles.root}>
    <View style={styles.topRow}>
      <Pressable onPress={onBack} hitSlop={8}>
        <Text style={styles.back}>← 목록</Text>
      </Pressable>
      <View style={styles.nav}>
        <Pressable onPress={() => onNavigate(-1)} disabled={index === 0} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={index === 0 ? '#ccc' : '#111'} />
        </Pressable>
        <Text style={styles.navText}>
          {index + 1} / {total}
        </Text>
        <Pressable onPress={() => onNavigate(1)} disabled={index >= total - 1} hitSlop={10}>
          <Ionicons name="chevron-forward" size={24} color={index >= total - 1 ? '#ccc' : '#111'} />
        </Pressable>
      </View>
    </View>
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable style={[styles.videoBox, { width: boxWidth, height: previewHeight }]} onPress={togglePlay}>
        {shownPlan ? (
          <FollowPreview player={player} plan={shownPlan} width={previewWidth} height={previewHeight} />
        ) : (
          <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
        )}
        <Pressable style={styles.mute} onPress={() => setMuted((m) => !m)} hitSlop={8}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
        </Pressable>
        {!playing && (
          <View pointerEvents="none" style={styles.playBadge}>
            <Ionicons name="play" size={30} color="#fff" />
          </View>
        )}
      </Pressable>
      {follow && planning && (
        <View style={styles.planning}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.followHint}>따라가기 경로 계산 중…</Text>
        </View>
      )}
      <View style={styles.statusRow}>
        <Text style={styles.status}>{status}</Text>
        <Pressable onPress={() => setView(view ? null : windowFor(clip, video.duration))} hitSlop={8}>
          <Text style={styles.reset}>{view ? '전체 보기' : '구간 확대'}</Text>
        </Pressable>
        {video.clips && (
          <Pressable onPress={reset} hitSlop={8}>
            <Text style={styles.reset}>처음으로</Text>
          </Pressable>
        )}
      </View>
      {clips.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {clips.map((c, i) => (
            <Pressable key={i} style={[styles.chip, i === current && styles.chipActive, c.low && styles.chipLow, c.saved && styles.chipSaved]} onPress={() => selectClip(i)}>
              <Text style={[styles.chipText, i === current && styles.chipTextActive]}>
                {i + 1}. {formatSeconds(c.start)}–{formatSeconds(c.end)}
                {c.saved ? ' ✓' : ''}
              </Text>
              <Pressable hitSlop={8} onPress={() => removeClip(i)}>
                <Text style={[styles.chipRemove, i === current && styles.chipTextActive]}>×</Text>
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Timeline
        thumbnails={thumbnails}
        duration={video.duration}
        start={clip.start}
        end={clip.end}
        position={position}
        viewStart={view?.start}
        viewEnd={view?.end}
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
          <Text style={styles.followHint}>켜면 클라이머를 따라가는 세로 9:16 영상으로 저장해요. 저장이 오래 걸려요</Text>
        </View>
        <Switch value={follow} onValueChange={setFollow} trackColor={{ true: '#111' }} />
      </View>
      {video.saved ? <Text style={styles.savedNote}>이 영상에서 저장한 클립 {video.saved}개</Text> : null}
    </ScrollView>
    <View style={styles.bar}>
      <View style={styles.buttons}>
        <Pressable style={styles.secondary} onPress={togglePlay}>
          <Text style={styles.secondaryText}>{playing ? '일시정지' : '재생'}</Text>
        </Pressable>
        <Pressable style={[styles.primary, saving !== null && styles.disabled]} onPress={() => save([clip])} disabled={saving !== null}>
          <Text style={styles.primaryText}>{saving ?? `${current + 1}번 저장`}</Text>
        </Pressable>
      </View>
      {clips.length > 1 && (
        <Pressable onPress={() => save(clips)} disabled={saving !== null} hitSlop={6} style={styles.allLink}>
          <Text style={[styles.allLinkText, saving !== null && styles.disabled]}>모든 구간 저장 ({clips.length}개)</Text>
        </Pressable>
      )}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 10 },
  bar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd', backgroundColor: '#fff', gap: 6 },
  allLink: { alignSelf: 'center', paddingVertical: 4 },
  allLinkText: { fontSize: 14, color: '#0a58ca' },
  back: { fontSize: 16, paddingVertical: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, backgroundColor: '#fff' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navText: { fontSize: 14, color: '#333', minWidth: 44, textAlign: 'center' },
  videoBox: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  playBadge: { position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  mute: { position: 'absolute', right: 12, bottom: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  status: { fontSize: 14, color: '#666', flex: 1 },
  reset: { fontSize: 14, color: '#0a58ca' },
  chips: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
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
  chipLow: { borderWidth: 1, borderColor: '#bbb', borderStyle: 'dashed' },
  chipSaved: { borderWidth: 1, borderColor: '#2a9d8f' },
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
  disabled: { opacity: 0.5 },
  savedNote: { fontSize: 13, color: '#888', textAlign: 'center' },
});
