import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Gym, distanceMeters, formatNo } from '../data/gyms';
import { RED, Silhouette } from './DexScreen';
import { type DexState, dayKey } from '../store/dex';
import type { PickedVideo } from '../types';

type Props = {
  gym: Gym;
  dex: DexState;
  videos: PickedVideo[];
  onBack: () => void;
  onVisit: (gym: Gym, photoUri: string | null) => void;
  onRemoveVisit: (at: string) => void;
  onPhoto: (gym: Gym, photoUri: string) => void;
  onOpenVideo: (index: number) => void;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export async function takePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

export async function pickPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

export const CHECKIN_METERS = 200;

export async function distanceTo(gym: Gym): Promise<number | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return distanceMeters(position.coords.latitude, position.coords.longitude, gym.lat, gym.lng);
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

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

export default function GymScreen({ gym, dex, videos, onBack, onVisit, onRemoveVisit, onPhoto, onOpenVideo }: Props) {
  const visits = dex.visits.filter((v) => v.gymId === gym.id).sort((a, b) => b.at.localeCompare(a.at));
  const photo = dex.photos[gym.id];
  const visitDays = new Set(visits.map((v) => dayKey(v.at)));
  const clips = videos
    .map((video, index) => ({ video, index }))
    .filter(({ video }) => video.createdAt && visitDays.has(dayKey(new Date(video.createdAt).toISOString())));

  const changePhoto = () => {
    Alert.alert('도감 사진', undefined, [
      { text: '카메라로 찍기', onPress: async () => { const uri = await takePhoto(); if (uri) onPhoto(gym, uri); } },
      { text: '앨범에서 고르기', onPress: async () => { const uri = await pickPhoto(); if (uri) onPhoto(gym, uri); } },
      ...clips.filter(({ video }) => video.thumbnail).slice(0, 1).map(({ video }) => ({
        text: '이 암장 클립 썸네일로',
        onPress: () => onPhoto(gym, video.thumbnail!),
      })),
      { text: '취소', style: 'cancel' as const },
    ]);
  };

  const [checking, setChecking] = useState(false);

  const register = async () => {
    setChecking(true);
    const distance = await distanceTo(gym);
    setChecking(false);
    if (distance === null) {
      Alert.alert('위치를 확인할 수 없어요', '설정에서 위치 권한을 허용해 주세요');
      return;
    }
    if (distance > CHECKIN_METERS) {
      Alert.alert('암장에서 등록할 수 있어요', `${gym.name}까지 ${formatDistance(distance)}`);
      return;
    }
    const choice = await choosePhoto();
    if (!choice) return;
    onVisit(gym, choice.uri);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← 도감</Text>
      </Pressable>
      <Pressable style={[styles.hero, visits.length > 0 && styles.heroVisited]} onPress={changePhoto}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.heroImage} />
        ) : (
          <View style={styles.heroEmpty}>
            <Silhouette size={140} visited={visits.length > 0} />
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
      </View>

      <Pressable style={[styles.primary, checking && styles.disabled]} onPress={register} disabled={checking}>
        <Text style={styles.primaryText}>{checking ? '위치 확인 중…' : visits.length > 0 ? '오늘 방문 등록' : '도감에 등록'}</Text>
      </Pressable>
      <Text style={styles.hint}>암장 {CHECKIN_METERS}m 안에서만 등록돼요 · 사진은 선택</Text>

      <Text style={styles.sectionTitle}>방문 {visits.length}회</Text>
      {visits.length === 0 ? (
        <Text style={styles.empty}>방문 기록이 없어요</Text>
      ) : (
        visits.map((v) => (
          <View key={v.at} style={styles.visitRow}>
            <Text style={styles.visit}>{formatDate(v.at)}</Text>
            <Pressable
              hitSlop={8}
              onPress={() => Alert.alert('방문 기록 삭제', formatDate(v.at), [
                { text: '취소', style: 'cancel' },
                { text: '삭제', style: 'destructive', onPress: () => onRemoveVisit(v.at) },
              ])}
            >
              <Text style={styles.visitRemove}>×</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>이 암장에서 자른 클립 {clips.length}개</Text>
      {clips.length === 0 ? (
        <Text style={styles.empty}>방문한 날에 찍은 영상을 고르면 여기 모여요</Text>
      ) : (
        <View style={styles.clips}>
          {clips.map(({ video, index }) => (
            <Pressable key={video.uri} style={styles.clip} onPress={() => onOpenVideo(index)}>
              {video.thumbnail ? <Image source={{ uri: video.thumbnail }} style={styles.clipImage} /> : null}
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
  hero: { height: 260, borderRadius: 18, overflow: 'hidden', backgroundColor: '#eceef2', borderWidth: 3, borderColor: 'transparent' },
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
  clips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clip: { width: 90, height: 120, borderRadius: 8, backgroundColor: '#ddd', overflow: 'hidden' },
  clipImage: { width: '100%', height: '100%' },
});
