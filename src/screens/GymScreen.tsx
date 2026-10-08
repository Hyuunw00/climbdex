import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { type Candidate, type Gym, distanceMeters, formatNo, nearbyGyms } from '../data/gyms';
import { CHECKIN_METERS, RED, SKIP_DISTANCE_CHECK, WallPanel, allowedMeters, formatDate, formatDistance } from '../components/dex';
import { type DexState, dayKey, visitedToday } from '../store/dex';
import TapeSection from '../components/TapeSection';
import ClipPlayer from '../components/ClipPlayer';
import { useRefreshControl } from '../components/refresh';
import type { PickedVideo } from '../types';
import { ClimbVideo } from '../../modules/climb-video';
import { type GymSend, fetchGymSends, resolveGyms, sameAttempt, updateSendRange, videoKey } from '../store/sends';
import { askSettings } from '../permissions';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors } from '../theme';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import Card from '../components/Card';
import GymReportSheet from '../components/GymReportSheet';
import { PALETTE, type TapeData, fetchTapes, summarize } from '../store/tapes';

function Chip({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={colors.text} />
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

type Props = {
  gym: Gym;
  dex: DexState;
  videos: PickedVideo[];
  onBack: () => void;
  onCheckIn: (candidates: Candidate[], open?: boolean, instant?: boolean) => void;
  onRemoveVisit: (id: string) => void;
  onPhoto: (gym: Gym, photoUri: string) => void;
  onShowCard: (gym: Gym) => void;
  day?: string | null;
  ownerId: string | null;
  onNeedAuth: () => void;
  userId: string | null;
  onRefresh?: () => Promise<void>;
  guest?: boolean;
};

export async function takePhoto(): Promise<string | null | undefined> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    askSettings('카메라 권한이 필요해요', '도감 사진을 찍으려면 설정에서 카메라 접근을 허용해 주세요');
    return undefined;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

export async function pickPhoto(): Promise<string | null | undefined> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    askSettings('사진 접근이 필요해요', '앨범에서 도감 사진을 고르려면 설정에서 사진 접근을 허용해 주세요');
    return undefined;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

export async function locate(gym: Gym): Promise<{ distance: number; allowed: number; candidates: Candidate[] } | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude, accuracy } = position.coords;
    const distance = distanceMeters(latitude, longitude, gym.lat, gym.lng);
    const allowed = allowedMeters(accuracy);
    const others = nearbyGyms(latitude, longitude, allowed).filter((c) => c.gym.id !== gym.id);
    return { distance, allowed, candidates: [{ gym, distance }, ...others].slice(0, 5) };
  } catch {
    return null;
  }
}

export type PhotoChoice = { uri: string | null } | undefined;

export function choosePhoto(): Promise<PhotoChoice> {
  return new Promise((resolve) => {
    Alert.alert('도감 대표 사진', '나중에 바꿀 수 있어요', [
      { text: '카메라로 찍기', onPress: async () => { const uri = await takePhoto(); resolve(uri === undefined ? undefined : { uri }); } },
      { text: '앨범에서 고르기', onPress: async () => { const uri = await pickPhoto(); resolve(uri === undefined ? undefined : { uri }); } },
      { text: '사진 없이 등록', onPress: () => resolve({ uri: null }) },
      { text: '취소', style: 'cancel', onPress: () => resolve(undefined) },
    ]);
  });
}

export default function GymScreen({ gym, dex, videos, onBack, onCheckIn, onRemoveVisit, onPhoto, onShowCard, day, ownerId, onNeedAuth, userId, onRefresh, guest }: Props) {
  const [tapeRefresh, setTapeRefresh] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const tapeY = useRef(0);
  const { width } = useWindowDimensions();
  const clipW = (width - 32 - 16) / 3;
  const heroSize = Math.min(width - 32, 360);
  const boulder = gym.types.length === 0 || gym.types.includes('볼더링');
  const [tapeData, setTapeData] = useState<TapeData | null>(null);
  const [reporting, setReporting] = useState(false);
  useEffect(() => {
    if (!boulder) return;
    fetchTapes(gym.id).then(setTapeData).catch(() => {});
  }, [gym.id, boulder, tapeRefresh]);
  const tapeSummary = tapeData?.set ? summarize(tapeData, userId) : null;
  const tapeVotes = tapeData?.votes.length ?? 0;
  const refreshControl = useRefreshControl(onRefresh && (async () => { setTapeRefresh((n) => n + 1); await onRefresh(); }));
  const visits = dex.visits.filter((v) => v.gymId === gym.id).sort((a, b) => b.at.localeCompare(a.at));
  const photo = dex.photos[gym.id];
  const visitDays = new Set(visits.map((v) => dayKey(v.at)));
  const dayVideos = videos
    .map((video, index) => ({ video, index }))
    .filter(({ video }) => video.createdAt && visitDays.has(dayKey(video.createdAt)));
  const [sends, setSends] = useState<GymSend[]>([]);
  const savedKey = videos.map((v) => `${v.uri}:${(v.clips ?? []).filter((c) => c.saved).length}`).join('|');
  useEffect(() => {
    if (!ownerId) return setSends([]);
    let cancelled = false;
    fetchGymSends(ownerId, gym.id)
      .then((rows) => {
        if (!cancelled) setSends(rows);
      })
      .catch((e) => console.log('gym sends error', String(e)));
    return () => {
      cancelled = true;
    };
  }, [ownerId, gym.id, savedKey]);
  const [showAll, setShowAll] = useState(!day);
  const allClips = [
    ...sends.map((s) => ({
      key: `${s.videoKey}#${s.clipId}`,
      uri: Platform.OS === 'ios' ? `ph://${s.videoKey}` : s.videoKey,
      start: s.start,
      end: s.end,
      label: s.label ?? undefined,
      sent: s.sent,
      at: s.at as string | number | undefined,
      record: { videoKey: s.videoKey, clipId: s.clipId } as { videoKey: string; clipId: string } | null,
    })),
    ...videos.flatMap((video) => {
      const onVisitDay = !!video.createdAt && visitDays.has(dayKey(video.createdAt));
      return (video.clips ?? [])
        .filter((c) => c.saved && (c.gymId ? c.gymId === gym.id : onVisitDay) && !sends.some((s) => s.videoKey === videoKey(video) && sameAttempt(c, s.start, s.end)))
        .map((c) => ({ key: `${video.uri}#${c.start}-${c.end}`, uri: video.uri, start: c.start, end: c.end, label: c.tape, sent: c.sent ?? true, at: video.createdAt as string | number | undefined, record: null }));
    }),
  ];
  const clips = showAll || !day ? allClips : allClips.filter((c) => c.at && dayKey(c.at) === day);
  const clipCounts = allClips.reduce<Record<string, number>>((acc, c) => {
    if (c.label) acc[c.label] = (acc[c.label] ?? 0) + 1;
    return acc;
  }, {});
  const labelOrder = tapeSummary ? [...tapeSummary].reverse().map((t) => t.label) : [];
  const colorOf = (label: string) => tapeSummary?.find((t) => t.label === label)?.color ?? PALETTE.find((p) => p.label === label)?.color ?? '#ddd';
  const clipGroups = (() => {
    const map = new Map<string, number[]>();
    clips.forEach((c, i) => {
      const key = c.label ?? '';
      map.set(key, [...(map.get(key) ?? []), i]);
    });
    const known = labelOrder.filter((l) => map.has(l));
    const extra = [...map.keys()].filter((l) => l && !labelOrder.includes(l)).sort();
    return [...known, ...extra, ...(map.has('') ? [''] : [])].map((label) => ({ label, indices: map.get(label) ?? [] }));
  })();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState<number | null>(null);
  const clipTitle = (c: (typeof allClips)[number]) => {
    const date = c.at ? new Date(c.at) : null;
    return [c.label, c.sent ? '완등' : '추락', date ? `${date.getMonth() + 1}월 ${date.getDate()}일` : null].filter(Boolean).join(' · ');
  };
  const clipKeys = clips.map((c) => c.key).join('|');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const byVideo = new Map<string, typeof clips>();
      for (const c of clips) if (!thumbs[c.key]) byVideo.set(c.uri, [...(byVideo.get(c.uri) ?? []), c]);
      for (const [uri, list] of byVideo) {
        try {
          const uris = await ClimbVideo.thumbnails(uri, list.map((c) => (c.start + c.end) / 2), 200);
          if (cancelled) return;
          setMissing((prev) => ({ ...prev, ...Object.fromEntries(list.map((c) => [c.key, false])) }));
          setThumbs((prev) => {
            const next = { ...prev };
            list.forEach((c, i) => {
              if (uris[i]) next[c.key] = uris[i];
            });
            return next;
          });
        } catch (e) {
          console.log('gym clip thumbnails error', String(e));
          if (!cancelled) setMissing((prev) => ({ ...prev, ...Object.fromEntries(list.map((c) => [c.key, true])) }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clipKeys]);

  const changePhoto = () => {
    Alert.alert('도감 사진', undefined, [
      { text: '카메라로 찍기', onPress: async () => { const uri = await takePhoto(); if (uri) onPhoto(gym, uri); } },
      { text: '앨범에서 고르기', onPress: async () => { const uri = await pickPhoto(); if (uri) onPhoto(gym, uri); } },
      ...dayVideos.filter(({ video }) => video.thumbnail).slice(0, 1).map(({ video }) => ({
        text: '이 암장 클립 썸네일로',
        onPress: () => onPhoto(gym, video.thumbnail!),
      })),
      { text: '취소', style: 'cancel' as const },
    ]);
  };

  const [checking, setChecking] = useState(false);
  const doneToday = visitedToday(dex, gym.id);

  const evidenceToday = videos.some(
    (v) =>
      !!v.createdAt &&
      dayKey(v.createdAt) === dayKey(new Date()) &&
      !!v.location &&
      (v.clips ?? []).some((c) => c.saved && c.gymId === gym.id) &&
      resolveGyms(v, dex).some((c) => c.gym.id === gym.id && c.basis === 'location'),
  );

  const register = async () => {
    if (guest) {
      onCheckIn([]);
      return;
    }
    if (evidenceToday) {
      onCheckIn([{ gym, distance: 0 }], true, true);
      return;
    }
    setChecking(true);
    const result = await locate(gym);
    setChecking(false);
    if (result === null) {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) askSettings('위치 권한이 필요해요', '암장에 있는지 확인하려면 설정에서 위치 접근을 허용해 주세요');
      else if (!(await Location.hasServicesEnabledAsync())) askSettings('위치 서비스가 꺼져 있어요', '설정에서 위치 서비스를 켜 주세요');
      else Alert.alert('위치를 확인할 수 없어요', '잠시 뒤 다시 시도해 주세요');
      return;
    }
    if (result.distance > result.allowed && !SKIP_DISTANCE_CHECK) {
      Alert.alert('암장에서 등록할 수 있어요', `${gym.name}까지 ${formatDistance(result.distance)}`);
      return;
    }
    onCheckIn(result.candidates);
  };

  return (
    <View style={styles.screen}>
    <ScreenHeader title={gym.name} onBack={onBack} />
    <ScrollView ref={scrollRef} contentContainerStyle={styles.container} refreshControl={refreshControl}>
      <Pressable style={[styles.hero, visits.length > 0 && styles.heroVisited]} onPress={visits.length > 0 ? changePhoto : undefined}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.heroImage} />
        ) : (
          <View style={styles.heroEmpty}>
            <WallPanel width={heroSize} height={heroSize} visited={visits.length > 0} seed={gym.id} region={gym.region1} hold={heroSize * 0.5} />
            <Text style={styles.heroEmptyText}>{visits.length > 0 ? '눌러서 도감 사진 넣기' : '아직 가 보지 않은 암장'}</Text>
          </View>
        )}
        <Text style={styles.heroNo}>{formatNo(gym.no)}</Text>
        {visits.length > 0 && (
          <View style={styles.heroStamp}>
            <Text style={styles.heroStampText}>방문 {visits.length}회</Text>
          </View>
        )}
        {photo ? <Text style={styles.heroHint}>사진 바꾸기</Text> : null}
      </Pressable>
      <Text style={styles.name}>{gym.name}</Text>
      <Text style={styles.meta}>
        {[`${gym.region1} ${gym.region2}`, gym.kind, ...gym.types].join(' · ')}
      </Text>
      <Text style={styles.address}>{gym.address}</Text>
      {boulder && tapeSummary && tapeSummary.length > 0 && (
        <Pressable style={styles.tapeBar} onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, tapeY.current - 12), animated: true })}>
          <View style={styles.tapeBarRow}>
            {tapeSummary.map((t) => (
              <View key={t.label} style={[styles.tapeSeg, { backgroundColor: t.color ?? '#ddd' }]} />
            ))}
          </View>
          <Text style={styles.tapeBarText}>
            난이도 {tapeSummary.length}개 · {tapeVotes > 0 ? `투표 ${tapeVotes}` : '추정'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </Pressable>
      )}
      <View style={styles.chips}>
        {gym.phone ? <Chip icon="call-outline" label="전화" onPress={() => Linking.openURL(`tel:${gym.phone}`)} /> : null}
        <Chip icon="map-outline" label="카카오맵" onPress={() => Linking.openURL(gym.placeUrl)} />
        {visits.length > 0 && <Chip icon="id-card-outline" label="도감 카드" onPress={() => onShowCard(gym)} />}
      </View>

      <Button
        label={doneToday ? '오늘 방문 등록 완료 ✓' : checking ? '위치 확인 중…' : visits.length > 0 ? '오늘 방문 등록' : '도감에 등록'}
        onPress={register}
        disabled={checking || doneToday}
        style={[styles.primary, doneToday && styles.done]}
      />
      <Text style={styles.hint}>{doneToday ? '방문은 하루 한 번 기록돼요' : evidenceToday ? '오늘 여기서 찍은 영상이 있어요 · 바로 등록돼요' : `암장 ${CHECKIN_METERS}m 안에서만 등록돼요 · 사진은 선택`}</Text>

      {boulder && (
        <View onLayout={(e) => (tapeY.current = e.nativeEvent.layout.y)}>
          <TapeSection gymId={gym.id} userId={userId} checkedIn={visits.length > 0 || sends.length > 0} onNeedAuth={onNeedAuth} refreshKey={tapeRefresh} clipCounts={clipCounts} />
        </View>
      )}

      <Text style={styles.sectionTitle}>방문 {visits.length}회</Text>
      {visits.length === 0 ? (
        <Text style={styles.empty}>방문 기록이 없어요</Text>
      ) : (
        visits.map((v) => (
          <View key={v.id} style={styles.visitRow}>
            <Text style={styles.visit}>{formatDate(v.at)}</Text>
            <Pressable
              hitSlop={8}
              onPress={() => Alert.alert('방문 기록 삭제', formatDate(v.at), [
                { text: '취소', style: 'cancel' },
                { text: '삭제', style: 'destructive', onPress: () => onRemoveVisit(v.id) },
              ])}
            >
              <Ionicons name="close" size={18} color="#bbb" style={styles.visitRemove} />
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.clipHeader}>
        <Text style={styles.sectionTitle}>
          {day && !showAll ? `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 저장한 클립 ${clips.length}개` : `이 암장에서 저장한 클립 ${clips.length}개`}
        </Text>
        {day && allClips.length > 0 && (
          <Pressable onPress={() => setShowAll(!showAll)} hitSlop={8}>
            <Text style={styles.clipToggle}>{showAll ? '그날만 보기' : `전체 보기 (${allClips.length})`}</Text>
          </Pressable>
        )}
      </View>
      {clips.length === 0 ? (
        day && !showAll ? (
          <Text style={styles.empty}>이날 이 암장에서 저장한 클립이 없어요</Text>
        ) : (
          <EmptyState small title="아직 여기서 자른 클립이 없어요" lines={['이 암장에서 찍은 영상을 자르면 여기 모여요']} seed={gym.id} />
        )
      ) : (
        <View style={styles.clipGroups}>
          {clipGroups.map((group) => {
            const sent = group.indices.filter((i) => clips[i].sent).length;
            return (
              <View key={group.label || '_none'} style={styles.clipGroup}>
                <View style={styles.clipGroupHead}>
                  <View style={[styles.clipSwatch, { backgroundColor: group.label ? colorOf(group.label) : '#ddd' }]} />
                  <Text style={styles.clipGroupTitle}>{group.label || '난이도 미정'}</Text>
                  <Text style={styles.clipGroupMeta}>
                    {group.indices.length}개 · 완등 {sent}
                    {group.indices.length - sent > 0 ? ` · 추락 ${group.indices.length - sent}` : ''}
                  </Text>
                </View>
                <View style={styles.clips}>
                  {group.indices.map((i) => {
                    const c = clips[i];
                    return (
                      <Pressable key={c.key} style={[styles.clip, { width: clipW, height: (clipW * 4) / 3 }]} onPress={() => (missing[c.key] ? Alert.alert('원본 영상이 없어요', '사진 앱에서 원본을 지우면 기록만 남아요') : setPlaying(i))}>
                        {thumbs[c.key] ? <Image source={{ uri: thumbs[c.key] }} style={styles.clipImage} /> : null}
                        {missing[c.key] ? <Text style={styles.clipMissing}>원본 없음</Text> : null}
                        {!c.sent ? <Text style={styles.clipLabel}>추락</Text> : null}
                        <Text style={styles.clipLength}>{Math.round(c.end - c.start)}초</Text>
                        {c.at && (showAll || !day) ? <Text style={styles.clipDate}>{`${new Date(c.at).getMonth() + 1}/${new Date(c.at).getDate()}`}</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}
      <Card style={styles.reportCard} onPress={() => (userId ? setReporting(true) : onNeedAuth())}>
        <Ionicons name="help-circle-outline" size={22} color={colors.accent} />
        <View style={styles.reportText}>
          <Text style={styles.reportTitle}>뭔가 다른가요?</Text>
          <Text style={styles.reportHint}>폐업·이전·정보가 다르면 알려 주세요</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
      {reporting && userId && <GymReportSheet gym={gym} userId={userId} onClose={() => setReporting(false)} />}
    </ScrollView>
      {playing !== null && (
        <ClipPlayer
          items={clips.map((c) => ({ key: c.key, uri: c.uri, start: c.start, end: c.end, title: clipTitle(c), editable: !!c.record }))}
          initial={playing}
          onClose={() => setPlaying(null)}
          onSaved={async (key, start, end) => {
            const record = clips.find((c) => c.key === key)?.record;
            if (!record || !ownerId) return;
            await updateSendRange(ownerId, record.videoKey, record.clipId, start, end);
            setSends(await fetchGymSends(ownerId, gym.id));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, paddingTop: 8, paddingBottom: 40, gap: 8 },
  hero: { aspectRatio: 1, maxHeight: 360, alignSelf: 'center', width: '100%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#eceef2', borderWidth: 3, borderColor: 'transparent' },
  heroVisited: { borderColor: RED, backgroundColor: '#fff3d6' },
  heroImage: { width: '100%', height: '100%' },
  heroEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroEmptyText: { position: 'absolute', bottom: 12, color: '#6b6b6b', fontSize: 13, fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  heroNo: { position: 'absolute', left: 12, top: 10, fontSize: 14, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  heroStamp: { position: 'absolute', right: 10, top: 10, backgroundColor: RED, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  heroStampText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  heroHint: { position: 'absolute', right: 10, bottom: 8, color: '#fff', fontSize: 12, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  name: { fontSize: 24, fontWeight: '700', marginTop: 8 },
  meta: { color: colors.textSub, fontSize: 13, marginTop: -4 },
  address: { color: '#333', fontSize: 14 },
  tapeBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  tapeBarRow: { flex: 1, flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 },
  tapeSeg: { flex: 1 },
  tapeBarText: { fontSize: 13, color: colors.textSub, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  chipPressed: { opacity: 0.6 },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  primary: { marginTop: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 28 },
  clipHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  clipToggle: { fontSize: 13, color: '#666', fontWeight: '600' },
  empty: { color: '#999', fontSize: 13 },
  visitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  visit: { fontSize: 14, color: '#333' },
  visitRemove: { paddingHorizontal: 6 },
  hint: { fontSize: 12, color: '#999', textAlign: 'center' },
  disabled: { opacity: 0.6 },
  done: { backgroundColor: colors.textMuted },
  reportCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28, padding: 14 },
  reportText: { flex: 1, gap: 2 },
  reportTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  reportHint: { fontSize: 12, color: colors.textSub },
  clipGroups: { gap: 16 },
  clipGroup: { gap: 8 },
  clipGroupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clipSwatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  clipGroupTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  clipGroupMeta: { fontSize: 13, color: colors.textSub },
  clips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clip: { borderRadius: 10, backgroundColor: '#ddd', overflow: 'hidden' },
  clipImage: { width: '100%', height: '100%' },
  clipMissing: { position: 'absolute', top: 50, left: 0, right: 0, textAlign: 'center', color: '#888', fontSize: 11, fontWeight: '600' },
  clipDate: { position: 'absolute', left: 4, bottom: 4, color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden' },
  clipLabel: { position: 'absolute', left: 4, top: 4, color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden' },
  clipLength: { position: 'absolute', right: 4, bottom: 4, color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden' },
});
