import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '../components/ScreenHeader';
import { RED } from '../components/dex';
import type { Gym } from '../data/gyms';
import { colors } from '../theme';
import Button from '../components/Button';
import Card from '../components/Card';
import { showToast } from '../components/Toast';
import InfoTip from '../components/InfoTip';
import { randomUUID } from 'expo-crypto';
import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, LayoutAnimation, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { ClimbVideo, type FollowPlan } from '../../modules/climb-video';
import FollowPreview from '../components/FollowPreview';
import Timeline from '../components/Timeline';
import type { Clip, PickedVideo } from '../types';
import { clipsOf } from '../clips';
import { deleteFile } from '../videoFiles';
import { type Settings, bumpHint, hintCount } from '../settings';
import type { DexState } from '../store/dex';
import { type GymCandidate, judgeSend, rememberManualGym, resolveGyms } from '../store/sends';
import GymPickerSheet from '../components/GymPickerSheet';
import { deliverSends } from '../store/outbox';
import { OrderSheet, VoteSheet } from '../components/TapeSection';
import { PALETTE, type Tape, type TapeData, type TapeSummary, castVote, fetchTapes, saveTapeSet, summarize } from '../store/tapes';
import { SAVE_DENIED, askSettings } from '../permissions';

type Props = {
  video: PickedVideo;
  settings: Settings;
  index: number;
  total: number;
  onBack: () => void;
  onNavigate: (delta: number) => void;
  onUpdate: (patch: Partial<PickedVideo>) => void;
  userId: string | null;
  member: boolean;
  dex: DexState;
  onSaved?: (gym: Gym, basis: GymCandidate['basis'], shotAt?: number) => void;
};

const THUMB_COUNT = 12;
const lastTape = new Map<string, string>();

function windowFor(clip: Clip, duration: number) {
  const margin = Math.max(3, (clip.end - clip.start) * 0.25);
  return { start: Math.max(0, clip.start - margin), end: Math.min(duration, clip.end + margin) };
}

function formatSeconds(seconds: number) {
  return seconds.toFixed(1) + 's';
}


export default function TrimScreen({ video, settings, index, total, onBack, onNavigate, onUpdate, userId, member, dex, onSaved }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;
  const initialClips = (v: PickedVideo) =>
    clipsOf(v, settings).map((c) => {
      const autoSent = c.autoSent !== undefined ? c.autoSent : judgeSend(v.tracks, c.start, c.end);
      return { ...c, id: c.id ?? randomUUID(), autoSent, sent: c.sent ?? autoSent ?? true };
    });
  const [clips, setClips] = useState<Clip[]>(() => initialClips(video));
  const [current, setCurrent] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [view, setView] = useState<{ start: number; end: number } | null>(() => {
    const first = clipsOf(video, settings);
    return first.length > 1 ? windowFor(first[0], video.duration) : null;
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GymCandidate[]>([]);
  const [choice, setChoice] = useState<GymCandidate | null>(null);
  const [resolved, setResolved] = useState(false);
  const [pickingGym, setPickingGym] = useState(false);
  const [mediaDenied, setMediaDenied] = useState(false);
  const [tapes, setTapes] = useState<TapeData | null | undefined>(undefined);
  const [noRecord, setNoRecord] = useState(false);
  const [voteFor, setVoteFor] = useState<{ tape: TapeSummary; resolve: (v: { min: number; max: number } | null | undefined) => void } | null>(null);
  const [orderFor, setOrderFor] = useState<{ resolve: (tapes: Tape[] | null | undefined) => void } | null>(null);
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
    const openedAt = Date.now();
    ClimbVideo.resolveUri?.(video.uri)
      .then(async (uri) => {
        if (cancelled) return;
        console.log('trim resolved', video.fileName, Date.now() - openedAt + 'ms');
        await player.replaceAsync(uri);
        console.log('trim player ready', video.fileName, Date.now() - openedAt + 'ms');
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
    if (!userId) return;
    let cancelled = false;
    (async () => {
      let current = video;
      if (Platform.OS === 'android') {
        try {
          const permission = await MediaLibrary.getPermissionsAsync(false, ['video']);
          if (!cancelled) setMediaDenied(!permission.granted && permission.accessPrivileges !== 'limited');
        } catch {}
      }
      if (video.assetId && video.location === undefined) {
        try {
          let location: { lat: number; lng: number } | null = null;
          let source: PickedVideo['source'];
          if (Platform.OS === 'android') {
            const info = await ClimbVideo.assetLocation?.(video.assetId);
            location = info?.lat !== undefined && info?.lng !== undefined ? { lat: info.lat, lng: info.lng } : null;
            source = info?.camera ? 'camera' : 'other';
          } else {
            const info = await MediaLibrary.getAssetInfoAsync(video.assetId);
            location = info.location ? { lat: info.location.latitude, lng: info.location.longitude } : null;
          }
          onUpdate({ location, source });
          current = { ...video, location, source };
        } catch (e) {
          console.log('asset location error', String(e));
        }
      }
      if (cancelled) return;
      const found = resolveGyms(current, dex);
      console.log('record gym', video.fileName, JSON.stringify({ createdAt: current.createdAt, pickedAt: current.pickedAt, location: current.location, visits: dex.visits.map((v) => [v.gymId, v.at]), found: found.map((c) => [c.gym.name, c.basis]) }));
      setCandidates(found);
      setChoice(found.find((c) => c.gym.id === clips[0]?.gymId) ?? (found.length === 1 ? found[0] : null));
      setResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, video.uri, dex.visits.length]);

  const tapesFor = useRef<string | null>(null);
  const loadTapes = async (gymId: string) => {
    tapesFor.current = gymId;
    try {
      const data = await fetchTapes(gymId);
      if (tapesFor.current === gymId) setTapes(data);
    } catch (e) {
      console.log('tapes load error', String(e));
      if (tapesFor.current === gymId) setTapes(null);
    }
  };

  useEffect(() => {
    setTapes(undefined);
    if (choice) loadTapes(choice.gym.id);
  }, [choice?.gym.id]);

  const patchClip = (i: number, changes: Partial<Clip>) => {
    const next = clips.map((c, k) => (k === i ? { ...c, ...changes } : c));
    setClips(next);
    onUpdate({ clips: next });
  };

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    return () => sub.remove();
  }, [player]);

  const togglePlay = () => {
    if (player.playing) player.pause();
    else playRange();
  };

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      setPosition(currentTime);
      setPlaying(player.playing);
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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

  const recording = !!(userId && candidates.length > 0 && !noRecord);

  useEffect(() => {
    if (!recording || !choice || tapes === undefined || clip.tape) return;
    const labels = (tapes?.set?.tapes ?? PALETTE).map((t) => t.label);
    const before = clips.slice(0, current).reverse().find((c) => c.tape && labels.includes(c.tape))?.tape;
    const fallback = before ?? lastTape.get(choice.gym.id);
    if (fallback && labels.includes(fallback)) patchClip(current, { tape: fallback, tapeAuto: true });
  }, [video.uri, current, choice?.gym.id, tapes, recording]);
  const unsaved = clips.filter((c) => !c.saved).length;
  const needGym = recording && !choice;

  const pickRecordGym = () => {
    const others = candidates.filter((c) => c.gym.id !== choice?.gym.id);
    if (others.length === 0) {
      setPickingGym(true);
      return;
    }
    Alert.alert('어느 암장이에요?', undefined, [
      ...others.map((c) => ({ text: c.gym.name, onPress: () => setChoice(c) })),
      { text: '직접 검색', onPress: () => setPickingGym(true) },
      { text: '닫기', style: 'cancel' as const },
    ]);
  };

  const save = async (targets: Clip[]) => {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      askSettings(...SAVE_DENIED);
      return;
    }
    if (recording && !choice) return;
    let order: Tape[] | null = null;
    let vote: { label: string; min: number; max: number } | null = null;
    const eligible = recording && member && choice && choice.basis !== 'manual';
    if (eligible && tapes !== undefined && !tapes?.set && targets.some((c) => c.tape && !c.tapeAuto)) {
      const answer = await new Promise<Tape[] | null | undefined>((resolve) => setOrderFor({ resolve }));
      setOrderFor(null);
      if (answer === undefined) return;
      order = answer;
    } else if (eligible && tapes?.set && targets[0].tape && !targets[0].tapeAuto) {
      const tape = summarize(tapes, userId).find((t) => t.label === targets[0].tape);
      if (tape && !tape.voted) {
        const answer = await new Promise<{ min: number; max: number } | null | undefined>((resolve) => setVoteFor({ tape, resolve }));
        setVoteFor(null);
        if (answer === undefined) return;
        if (answer !== null) vote = { label: tape.label, ...answer };
      }
    }
    let done = 0;
    try {
      for (const target of targets) {
        setSaving(`${follow ? '따라가기 ' : ''}저장 중 ${done + 1}/${targets.length}`);
        const outUri = follow
          ? await ClimbVideo.exportFollow(video.uri, target.start, target.end, video.tracks)
          : await ClimbVideo.trim(video.uri, target.start, target.end);
        if (ClimbVideo.saveClip) await ClimbVideo.saveClip(outUri);
        else await MediaLibrary.saveToLibraryAsync(outUri);
        deleteFile(outUri);
        done += 1;
      }
      const marked = clips.map((c) => (targets.includes(c) ? { ...c, saved: true, ...(recording ? { gymId: choice!.gym.id } : {}) } : c));
      setClips(marked);
      onUpdate({ saved: (video.saved ?? 0) + done, clips: marked });
      let sent = 0;
      if (recording && userId && choice) {
        const summary = tapes ? summarize(tapes, userId) : [];
        const records = targets.map((c) => {
          const tape = summary.find((t) => t.label === c.tape);
          const own = vote && vote.label === c.tape ? vote : null;
          return { gymId: choice.gym.id, basis: choice.basis, clip: c, label: c.tape ?? null, sent: c.sent ?? true, vMin: tape?.vMin ?? own?.min ?? null, vMax: tape?.vMax ?? own?.max ?? null };
        });
        sent = records.filter((r) => r.sent).length;
        const delivered = await deliverSends(userId, video, records);
        if (delivered && (order || vote)) {
          try {
            if (order) await saveTapeSet(userId, choice.gym.id, order);
            if (vote) await castVote(userId, choice.gym.id, vote.label, vote.min, vote.max);
            loadTapes(choice.gym.id);
          } catch (e) {
            console.log('tape push error', String(e));
            Alert.alert('투표를 남기지 못했어요', '클립은 저장됐어요. 네트워크가 연결되면 암장 페이지에서 다시 해 주세요');
          }
        } else if (order || vote) {
          Alert.alert('투표를 남기지 못했어요', '클립은 저장됐어요. 네트워크가 연결되면 암장 페이지에서 다시 해 주세요');
        }
      }
      showToast(`클립 ${done}개를 사진 앱에 넣었어요` + (recording ? ` · 등반 기록 ${done}개(완등 ${sent})` : ''));
      Animated.sequence([
        Animated.spring(pulse, { toValue: 1.08, friction: 4, tension: 160, useNativeDriver: true }),
        Animated.spring(pulse, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      ]).start();
      if (recording && choice) onSaved?.(choice.gym, choice.basis, video.createdAt);
    } catch (e) {
      Alert.alert('저장 실패', String(e));
    } finally {
      setSaving(null);
    }
  };

  const noSegments = video.segments !== undefined && video.segments.length === 0 && !video.candidates?.length;
  const [showHints] = useState(() => {
    const n = hintCount('trimHandles');
    if (n < 3) bumpHint('trimHandles');
    return n < 3;
  });
  const status =
    video.segments === undefined
      ? '시도 찾는 중…'
      : noSegments
        ? '시도를 못 찾았어요. 직접 잡아 주세요'
        : `시도 ${clips.length}번${recording ? ` · 완등 ${clips.filter((c) => c.sent !== false).length}` : ''}${video.handheld ? ' (들고 찍은 영상)' : ''}`;
  const gymNotice = mediaDenied
    ? { title: '영상에서 암장을 못 찾았어요', body: '사진 위치 접근을 허용하면 다음부터 자동으로 잡아요' }
    : Platform.OS === 'android' && video.location === null && video.source === 'camera'
      ? { title: '영상에 위치 정보가 없어요', body: "카메라 설정에서 위치 태그를 켜면 다음부터 암장을 자동으로 잡아요" }
      : video.location === null
        ? { title: '영상에 위치 정보가 없어요', body: '암장을 직접 골라 주세요' }
        : { title: '영상의 위치·날짜로 암장을 못 찾았어요', body: null };

  const shownPlan = follow ? plan : null;
  const boxWidth = shownPlan ? previewWidth : screenWidth - 32;

  return (
    <View style={styles.root}>
    <View style={styles.topRow}>
      <BackButton onPress={onBack} />
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
      <View style={[styles.videoBox, { width: boxWidth, height: previewHeight }]}>
        {shownPlan ? (
          <FollowPreview player={player} plan={shownPlan} width={previewWidth} height={previewHeight} />
        ) : (
          <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
        )}
        <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay} />
        <Pressable style={styles.mute} onPress={() => setMuted((m) => !m)} hitSlop={8}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
        </Pressable>
        {!playing && (
          <View pointerEvents="none" style={styles.playBadge}>
            <Ionicons name="play" size={30} color="#fff" />
          </View>
        )}
      </View>
      {follow && planning && (
        <View style={styles.planning}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.followHint}>따라가기 경로 계산 중…</Text>
        </View>
      )}
      {noSegments && (
        <Card style={styles.tipCard}>
          <Text style={styles.tip}>멀리서 찍으면 사람을 못 찾을 수 있어요. 가까이서나 2배 줌으로 찍으면 잘 잡혀요</Text>
        </Card>
      )}
      <View style={styles.statusRow}>
        <Text style={styles.status}>{status}</Text>
        <Button variant="text" small label={view ? '전체 보기' : '구간 확대'} onPress={() => setView(view ? null : windowFor(clip, video.duration))} />
        {video.clips && <Button variant="text" small label="처음으로" onPress={reset} />}
      </View>
      {clips.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {clips.map((c, i) => (
            <Pressable key={i} style={[styles.chip, i === current && styles.chipActive, c.low && styles.chipLow, c.saved && styles.chipSaved]} onPress={() => selectClip(i)}>
              {c.saved && <Ionicons name="checkmark-circle" size={14} color={i === current ? '#fff' : '#2a9d8f'} />}
              {c.low && !c.saved && <Ionicons name="help-circle" size={14} color={i === current ? '#fff' : '#999'} />}
              <Text style={[styles.chipText, i === current && styles.chipTextActive]}>
                시도 {i + 1} · {formatSeconds(c.start)}–{formatSeconds(c.end)}
              </Text>
              <Pressable hitSlop={8} onPress={() => removeClip(i)}>
                <Ionicons name="close" size={14} color={i === current ? '#fff' : '#999'} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {clip.low && (
        <View style={styles.lowRow}>
          <Text style={styles.lowNote}>이 시도는 확신이 낮아요</Text>
          <InfoTip text="사람이 가려지거나 멀어서 등반인지 확실하지 않은 구간이에요. 영상을 보고 맞으면 그대로 저장하고, 아니면 칩의 ×로 빼세요" />
        </View>
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
      {showHints && (
        <View style={styles.hints}>
          <Text style={styles.hint}>검정 핸들을 끌어 시작·끝을 맞춰요 · 위 칩을 누르면 다른 시도로 넘어가요</Text>
        </View>
      )}
      <View style={styles.labels}>
        <Text style={styles.label}>시작 {formatSeconds(clip.start)}</Text>
        <Text style={styles.label}>현재 {formatSeconds(position)} · 길이 {formatSeconds(clip.end - clip.start)}</Text>
        <Text style={styles.label}>끝 {formatSeconds(clip.end)}</Text>
      </View>
      <View style={styles.followRow}>
        <View style={styles.followText}>
          <Text style={styles.label}>클라이머 따라가기</Text>
          <Text style={styles.followHint}>클라이머를 따라가는 세로 9:16으로 저장해요</Text>
        </View>
        <Switch value={follow} onValueChange={setFollow} trackColor={{ true: RED }} />
      </View>
      {userId && resolved && candidates.length === 0 && (
        <View style={[styles.record, styles.recordOff]}>
          <Text style={styles.recordTitle}>{gymNotice.title}</Text>
          {gymNotice.body && <Text style={styles.recordBody}>{gymNotice.body}</Text>}
          <View style={styles.recordLinks}>
            <Pressable onPress={() => setPickingGym(true)} hitSlop={6}>
              <Text style={styles.recordLink}>암장 고르기</Text>
            </Pressable>
            {mediaDenied && (
              <Pressable onPress={() => Linking.openSettings()} hitSlop={6}>
                <Text style={styles.recordLink}>설정에서 허용하기</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
      {pickingGym && (
        <GymPickerSheet
          dex={dex}
          onClose={() => setPickingGym(false)}
          onPick={(gym) => {
            rememberManualGym(gym, video.createdAt ?? video.pickedAt ?? Date.now());
            const picked: GymCandidate = { gym, basis: 'manual' };
            setCandidates([picked]);
            setChoice(picked);
            setNoRecord(false);
            setPickingGym(false);
          }}
        />
      )}
      {userId && candidates.length > 0 && noRecord && (
        <Pressable onPress={() => setNoRecord(false)} hitSlop={6} style={[styles.record, styles.recordOff]}>
          <Text style={styles.recordMuted}>등반 기록 안 남김 · 다시 켜기</Text>
          <Text style={styles.recordMuted}>기록을 남기면 내 등반 기록이 쌓여요</Text>
        </Pressable>
      )}
      {recording && !choice && (
        <View style={styles.record}>
          <Text style={styles.label}>어느 암장이에요?</Text>
          <View style={styles.pills}>
            {candidates.map((c) => (
              <Pressable key={c.gym.id} style={styles.pill} onPress={() => setChoice(c)}>
                <Text style={styles.pillText}>{c.gym.name}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setNoRecord(true)} hitSlop={6} style={styles.recordFoot}>
            <Text style={styles.recordMuted}>기록 안 함</Text>
          </Pressable>
        </View>
      )}
      {recording && choice && (
        <View style={styles.record}>
          <View style={styles.recordHead}>
            <Pressable onPress={pickRecordGym} hitSlop={6} style={styles.recordGymButton} disabled={candidates.length < 2 && choice.basis !== 'manual'}>
              <Text style={styles.recordGym}>{choice.gym.name}</Text>
              {(candidates.length > 1 || choice.basis === 'manual') && <Ionicons name="chevron-down" size={16} color="#666" />}
            </Pressable>
            <InfoTip text="완등/추락은 등반 기록에 남아요. 자동 판정은 기본 완등이라 떨어진 시도면 추락으로 바꿔 주세요" />
            <View style={styles.sentSwitch}>
              {([[true, '완등'], [false, '추락']] as const).map(([v, text]) => (
                <Pressable key={text} style={[styles.sentItem, (clip.sent ?? true) === v && styles.sentItemOn]} onPress={() => patchClip(current, { sent: v })}>
                  <Text style={[styles.sentText, (clip.sent ?? true) === v && styles.sentTextOn]}>{text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {tapes === undefined ? (
            <Text style={styles.followHint}>난이도 불러오는 중…</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tapeChips}>
              <Text style={styles.tapeLabel}>난이도</Text>
              {(tapes?.set?.tapes ?? PALETTE.map((p) => ({ label: p.label, color: p.color }))).map((t) => (
                <Pressable key={t.label} style={[styles.tapeChip, clip.tape === t.label && styles.tapeChipOn]} onPress={() => {
                  patchClip(current, { tape: t.label, tapeAuto: false });
                  if (choice) lastTape.set(choice.gym.id, t.label);
                }}>
                  <View style={[styles.swatch, { backgroundColor: t.color ?? '#ddd' }]} />
                  <Text style={styles.tapeChipText}>{t.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Pressable onPress={() => setNoRecord(true)} hitSlop={6} style={styles.recordFoot}>
            <Text style={styles.recordMuted}>기록 안 함</Text>
          </Pressable>
        </View>
      )}
      {video.saved ? <Text style={styles.savedNote}>이 영상에서 저장한 클립 {video.saved}개</Text> : null}
    </ScrollView>
    <View style={styles.bar}>
      <View style={styles.buttons}>
        <Button variant="secondary" label={playing ? '일시정지' : '재생'} onPress={togglePlay} style={styles.secondary} />
        <Animated.View style={[styles.primary, { transform: [{ scale: pulse }] }]}>
          <Button
            label={saving ?? (needGym ? '암장을 골라 주세요' : clip.saved ? `${current + 1}번 저장됨` : `${current + 1}번 저장`)}
            icon={clip.saved && !saving ? 'checkmark-circle' : undefined}
            onPress={() => (clip.saved ? Alert.alert('이미 저장한 구간이에요', undefined, [{ text: '취소', style: 'cancel' }, { text: '다시 저장', onPress: () => save([clip]) }]) : save([clip]))}
            disabled={saving !== null || needGym}
            style={clip.saved ? styles.primarySaved : undefined}
          />
        </Animated.View>
      </View>
      {unsaved === 0 && clips.every((c) => c.saved) && index < total - 1 ? (
        <Button variant="text" small label="다음 영상 →" onPress={() => onNavigate(1)} style={styles.allLink} />
      ) : clips.length > 1 && (
        <Button
          variant="text"
          small
          label={unsaved === 0 ? '모든 시도 저장됨 ✓' : unsaved === clips.length ? `모든 시도 저장 (${clips.length}개)` : `남은 시도 저장 (${unsaved}개)`}
          onPress={() => save(clips.filter((c) => !c.saved))}
          disabled={saving !== null || unsaved === 0 || needGym}
          style={styles.allLink}
        />
      )}
    </View>
    {orderFor && (
      <OrderSheet onClose={() => orderFor.resolve(undefined)} onSkip={() => orderFor.resolve(null)} onSubmit={(tapes) => orderFor.resolve(tapes)} skipLabel="모르겠어요 · 그냥 저장" />
    )}
    {voteFor && (
      <VoteSheet
        tape={voteFor.tape}
        mine={null}
        onClose={() => voteFor.resolve(undefined)}
        onSkip={() => voteFor.resolve(null)}
        onSubmit={(min, max) => voteFor.resolve({ min, max })}
        onRemove={() => voteFor.resolve(undefined)}
        skipLabel="모르겠어요 · 그냥 저장"
        confirmLabel="투표하고 저장"
      />
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 10 },
  bar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd', backgroundColor: '#fff', gap: 6 },
  allLink: { alignSelf: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 8, paddingRight: 16, height: 48, backgroundColor: '#fff' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navText: { fontSize: 14, color: '#333', minWidth: 44, textAlign: 'center' },
  videoBox: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  playBadge: { position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  mute: { position: 'absolute', right: 12, bottom: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  status: { fontSize: 14, color: '#666', flex: 1 },
  tipCard: { paddingVertical: 10, paddingHorizontal: 12 },
  tip: { fontSize: 13, color: '#888', lineHeight: 19 },
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
  chipActive: { backgroundColor: RED },
  chipText: { fontSize: 13 },
  chipTextActive: { color: '#fff' },
  chipLow: { borderWidth: 1, borderColor: '#bbb', borderStyle: 'dashed' },
  lowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 },
  lowNote: { fontSize: 12, color: '#888', lineHeight: 17 },
  chipSaved: { borderWidth: 1, borderColor: '#2a9d8f' },
  hints: { gap: 2, marginTop: -4 },
  hint: { fontSize: 12, color: '#888', lineHeight: 17 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  planning: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  followText: { flex: 1, gap: 2 },
  followHint: { fontSize: 12, color: '#888' },
  label: { fontSize: 14, color: '#333' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  secondary: { flex: 1 },
  primary: { flex: 2 },
  primarySaved: { backgroundColor: colors.textMuted },
  disabled: { opacity: 0.5 },
  savedNote: { fontSize: 13, color: '#888', textAlign: 'center' },
  record: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.surface },
  recordOff: { gap: 4 },
  recordTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  recordBody: { fontSize: 13, color: '#777', lineHeight: 19 },
  recordFoot: { alignSelf: 'flex-end' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  pillText: { fontSize: 14, color: '#111' },
  recordMuted: { fontSize: 12, color: '#999' },
  recordLinks: { flexDirection: 'row', gap: 16, marginTop: 6 },
  recordHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recordGymButton: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  recordGym: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  recordLink: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  sentSwitch: { flexDirection: 'row', backgroundColor: '#e6e6ea', borderRadius: 9, padding: 2 },
  sentItem: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 7 },
  sentItemOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  sentText: { fontSize: 13, color: '#666' },
  sentTextOn: { color: '#111', fontWeight: '600' },
  tapeChips: { gap: 8, paddingVertical: 2, alignItems: 'center' },
  tapeLabel: { fontSize: 12, color: '#666', marginRight: 2 },
  tapeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#fff', borderWidth: 2, borderColor: 'transparent' },
  tapeChipOn: { borderColor: '#d7263d' },
  tapeChipText: { fontSize: 13 },
  swatch: { width: 22, height: 12, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
});
