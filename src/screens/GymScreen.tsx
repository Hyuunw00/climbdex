import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Candidate, type Gym, distanceMeters, formatNo, nearbyGyms } from '../data/gyms';
import { CHECKIN_METERS, RED, SKIP_DISTANCE_CHECK, Silhouette, allowedMeters, formatDate, formatDistance } from '../components/dex';
import { type DexState, dayKey, visitedToday } from '../store/dex';
import type { PickedVideo } from '../types';
import { ClimbVideo } from '../../modules/climb-video';

type Props = {
  gym: Gym;
  dex: DexState;
  videos: PickedVideo[];
  onBack: () => void;
  onCheckIn: (candidates: Candidate[]) => void;
  onRemoveVisit: (id: string) => void;
  onPhoto: (gym: Gym, photoUri: string) => void;
  onOpenVideo: (index: number) => void;
  onShowCard: (gym: Gym) => void;
  guest?: boolean;
};

export async function takePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

export async function pickPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
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
      { text: '카메라로 찍기', onPress: async () => resolve({ uri: await takePhoto() }) },
      { text: '앨범에서 고르기', onPress: async () => resolve({ uri: await pickPhoto() }) },
      { text: '사진 없이 등록', onPress: () => resolve({ uri: null }) },
      { text: '취소', style: 'cancel', onPress: () => resolve(undefined) },
    ]);
  });
}

export default function GymScreen({ gym, dex, videos, onBack, onCheckIn, onRemoveVisit, onPhoto, onOpenVideo, onShowCard, guest }: Props) {
  const visits = dex.visits.filter((v) => v.gymId === gym.id).sort((a, b) => b.at.localeCompare(a.at));
  const photo = dex.photos[gym.id];
  const visitDays = new Set(visits.map((v) => dayKey(v.at)));
  const dayVideos = videos
    .map((video, index) => ({ video, index }))
    .filter(({ video }) => video.createdAt && visitDays.has(dayKey(video.createdAt)));
  const clips = dayVideos.flatMap(({ video, index }) =>
    (video.clips ?? []).filter((c) => c.saved).map((clip) => ({ video, index, clip, key: `${video.uri}#${clip.start}-${clip.end}` })),
  );
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const clipKeys = clips.map((c) => c.key).join('|');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const byVideo = new Map<string, typeof clips>();
      for (const c of clips) if (!thumbs[c.key]) byVideo.set(c.video.uri, [...(byVideo.get(c.video.uri) ?? []), c]);
      for (const [uri, list] of byVideo) {
        try {
          const uris = await ClimbVideo.thumbnails(uri, list.map((c) => (c.clip.start + c.clip.end) / 2), 200);
          if (cancelled) return;
          setThumbs((prev) => {
            const next = { ...prev };
            list.forEach((c, i) => {
              if (uris[i]) next[c.key] = uris[i];
            });
            return next;
          });
        } catch (e) {
          console.log('gym clip thumbnails error', String(e));
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

  const register = async () => {
    if (guest) {
      onCheckIn([]);
      return;
    }
    setChecking(true);
    const result = await locate(gym);
    setChecking(false);
    if (result === null) {
      Alert.alert('위치를 확인할 수 없어요', '설정에서 위치 권한을 허용해 주세요');
      return;
    }
    if (result.distance > result.allowed && !SKIP_DISTANCE_CHECK) {
      Alert.alert('암장에서 등록할 수 있어요', `${gym.name}까지 ${formatDistance(result.distance)}`);
      return;
    }
    onCheckIn(result.candidates);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← 도감</Text>
      </Pressable>
      <Pressable style={[styles.hero, visits.length > 0 && styles.heroVisited]} onPress={visits.length > 0 ? changePhoto : undefined}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.heroImage} />
        ) : (
          <View style={styles.heroEmpty}>
            <Silhouette size={140} visited={visits.length > 0} seed={gym.id} region={gym.region1} />
            <Text style={styles.heroEmptyText}>{visits.length > 0 ? '눌러서 도감 사진 넣기' : '아직 가 보지 않은 암장'}</Text>
          </View>
        )}
        <Text style={styles.heroNo}>{formatNo(gym.no)}</Text>
        {visits.length > 0 && (
          <View style={styles.heroStamp}>
            <Text style={styles.heroStampText}>포획 · {visits.length}회</Text>
          </View>
        )}
        {photo ? <Text style={styles.heroHint}>사진 바꾸기</Text> : null}
      </Pressable>
      <Text style={styles.name}>{gym.name}</Text>
      <Text style={styles.meta}>
        {gym.region1} {gym.region2} · {gym.kind}
      </Text>
      <Text style={styles.address}>{gym.address}</Text>
      <View style={styles.links}>
        {gym.phone ? (
          <Pressable onPress={() => Linking.openURL(`tel:${gym.phone}`)}>
            <Text style={styles.link}>{gym.phone}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => Linking.openURL(gym.placeUrl)}>
          <Text style={styles.link}>카카오맵에서 보기</Text>
        </Pressable>
        {visits.length > 0 && (
          <Pressable onPress={() => onShowCard(gym)}>
            <Text style={styles.link}>도감 카드 보기</Text>
          </Pressable>
        )}
      </View>

      <Pressable style={[styles.primary, (checking || doneToday) && styles.disabled, doneToday && styles.done]} onPress={register} disabled={checking || doneToday}>
        <Text style={styles.primaryText}>
          {doneToday ? '오늘 방문 등록 완료 ✓' : checking ? '위치 확인 중…' : visits.length > 0 ? '오늘 방문 등록' : '도감에 등록'}
        </Text>
      </Pressable>
      <Text style={styles.hint}>{doneToday ? '방문은 하루 한 번 기록돼요' : `암장 ${CHECKIN_METERS}m 안에서만 등록돼요 · 사진은 선택`}</Text>

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
              <Text style={styles.visitRemove}>×</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>이 암장에서 저장한 클립 {clips.length}개</Text>
      {clips.length === 0 ? (
        <Text style={styles.empty}>방문한 날 찍은 영상에서 클립을 저장하면 여기 모여요</Text>
      ) : (
        <View style={styles.clips}>
          {clips.map(({ index, clip, key }) => (
            <Pressable key={key} style={styles.clip} onPress={() => onOpenVideo(index)}>
              {thumbs[key] ? <Image source={{ uri: thumbs[key] }} style={styles.clipImage} /> : null}
              <Text style={styles.clipLength}>{Math.round(clip.end - clip.start)}초</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, gap: 8 },
  back: { fontSize: 16, paddingVertical: 8 },
  hero: { aspectRatio: 1, maxHeight: 360, alignSelf: 'center', width: '100%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#eceef2', borderWidth: 3, borderColor: 'transparent' },
  heroVisited: { borderColor: RED, backgroundColor: '#fff3d6' },
  heroImage: { width: '100%', height: '100%' },
  heroEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  heroEmptyText: { color: '#999', fontSize: 13 },
  heroNo: { position: 'absolute', left: 12, top: 10, fontSize: 14, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  heroStamp: { position: 'absolute', right: 10, top: 10, backgroundColor: RED, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  heroStampText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  heroHint: { position: 'absolute', right: 10, bottom: 8, color: '#fff', fontSize: 12, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  name: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  meta: { color: '#666' },
  address: { color: '#333' },
  links: { flexDirection: 'row', gap: 16 },
  link: { color: '#0a58ca', fontSize: 14 },
  primary: { paddingVertical: 14, borderRadius: 12, backgroundColor: RED, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginTop: 16 },
  empty: { color: '#999', fontSize: 13 },
  visitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  visit: { fontSize: 14, color: '#333' },
  visitRemove: { fontSize: 18, color: '#bbb', paddingHorizontal: 6 },
  hint: { fontSize: 12, color: '#999', textAlign: 'center' },
  disabled: { opacity: 0.6 },
  done: { backgroundColor: '#3a3a44', opacity: 1 },
  clips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clip: { width: 90, height: 120, borderRadius: 8, backgroundColor: '#ddd', overflow: 'hidden' },
  clipImage: { width: '100%', height: '100%' },
  clipLength: { position: 'absolute', right: 4, bottom: 4, color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden' },
});
