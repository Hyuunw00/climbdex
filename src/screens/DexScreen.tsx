import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import DexHeader from '../components/DexHeader';
import EmptyState from '../components/EmptyState';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Button from '../components/Button';
import { askSettings } from '../permissions';
import { dismissToday, dismissedToday } from '../todayVideos';
import { useRefreshControl } from '../components/refresh';
import { type Candidate, type Gym, distanceMeters, gymById, gyms, nearbyGyms } from '../data/gyms';
import { type DexState, lastVisits, visitedToday } from '../store/dex';
import { GymCard, GymRow, Progress, RED, allowedMeters, daysSince, formatAgo, formatDistance } from '../components/dex';

type Props = {
  dex: DexState;
  onOpenGym: (gym: Gym) => void;
  onCheckIn: (candidates: Candidate[]) => void;
  onOpenAll: () => void;
  onOpenHistory: () => void;
  onAccount: () => void;
  account: { name: string; email: string } | null;
  clipCount: number;
  onOpenSettings: () => void;
  onRefresh?: () => Promise<void>;
};

const COLUMNS = 3;
const NEAR = 5;
const STALE_DAYS = 7;

export default function DexScreen({ dex, onOpenGym, onCheckIn, onOpenAll, onOpenHistory, onAccount, account, clipCount, onOpenSettings, onRefresh }: Props) {
  const refreshControl = useRefreshControl(onRefresh);
  const { width } = useWindowDimensions();
  const [nearby, setNearby] = useState<Candidate[]>([]);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<'unknown' | 'granted' | 'ask' | 'denied'>('unknown');
  const [locCardHidden, setLocCardHidden] = useState(() => dismissedToday('locationCard'));

  const last = useMemo(() => lastVisits(dex), [dex.visits]);
  const mine = useMemo(
    () =>
      [...last.entries()]
        .sort((a, b) => b[1].localeCompare(a[1]))
        .map(([id]) => gymById.get(id))
        .filter((g): g is Gym => Boolean(g)),
    [last],
  );
  const rows = useMemo(() => {
    const out: Gym[][] = [];
    for (let i = 0; i < mine.length; i += COLUMNS) out.push(mine.slice(i, i + COLUMNS));
    return out;
  }, [mine]);

  const loadPosition = async () => {
    try {
      const known = await Location.getLastKnownPositionAsync();
      if (known) setPosition({ lat: known.coords.latitude, lng: known.coords.longitude });
    } catch {}
    try {
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPosition({ lat: coords.latitude, lng: coords.longitude });
      setNearby(nearbyGyms(coords.latitude, coords.longitude, allowedMeters(coords.accuracy)).slice(0, 5));
    } catch {}
  };

  const readPermission = async () => {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.granted) {
      setLocState('granted');
      loadPosition();
    } else {
      setLocState(permission.canAskAgain ? 'ask' : 'denied');
    }
  };

  useEffect(() => {
    readPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') readPermission();
    });
    return () => sub.remove();
  }, []);

  const allowLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.granted) {
      setLocState('granted');
      loadPosition();
    } else if (!permission.canAskAgain) {
      setLocState('denied');
      askSettings('위치 권한이 꺼져 있어요', '근처 암장을 찾고 도감에 등록하려면 설정에서 위치 접근을 허용해 주세요');
    }
  };

  const stale = useMemo(
    () =>
      [...last.entries()]
        .filter(([, at]) => daysSince(at) >= STALE_DAYS)
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, at]) => ({ gym: gymById.get(id), at }))
        .filter((e): e is { gym: Gym; at: string } => Boolean(e.gym)),
    [last],
  );

  const unvisitedNear = useMemo(() => {
    if (!position) return [];
    return gyms
      .filter((g) => !last.has(g.id))
      .map((gym) => ({ gym, distance: distanceMeters(position.lat, position.lng, gym.lat, gym.lng) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, NEAR);
  }, [position, last]);

  const cell = (width - 32 - 10 * (COLUMNS - 1)) / COLUMNS;

  const header = (
    <DexHeader
      title="암장 도감"
      account={account}
      onAccount={onAccount}
      onOpenSettings={onOpenSettings}
      stats={[
        { value: `${last.size} / ${gyms.length}`, label: '암장' },
        { value: dex.visits.length, label: '방문' },
        { value: clipCount, label: '클립' },
      ]}
      progress={{ value: last.size, total: gyms.length }}
    />
  );

  const locationCard =
    locState === 'ask' && !locCardHidden ? (
      <Card style={styles.locCard}>
        <Text style={styles.locTitle}>근처 암장을 알려드릴까요?</Text>
        <Text style={styles.locHint}>암장에 있을 때 도감에 등록하려면 위치가 필요해요. 위치는 암장을 찾는 데만 써요</Text>
        <View style={styles.locActions}>
          <Button small label="허용하기" onPress={allowLocation} />
          <Button
            small
            variant="text"
            label="나중에"
            onPress={() => {
              dismissToday('locationCard');
              setLocCardHidden(true);
            }}
          />
        </View>
      </Card>
    ) : locState === 'denied' ? (
      <View style={styles.locDenied}>
        <Text style={styles.locHint}>위치가 꺼져 있어요. 위치 없이도 전체 도감에서 암장을 찾아볼 수 있어요</Text>
        <Button small variant="text" label="설정 열기" onPress={() => askSettings('위치 권한이 꺼져 있어요', '근처 암장을 찾고 도감에 등록하려면 설정에서 위치 접근을 허용해 주세요')} />
      </View>
    ) : null;

  const quick = (
    <View style={styles.quick}>
      {locationCard && <View style={styles.full}>{locationCard}</View>}
      <Card style={styles.quickCard} onPress={onOpenAll}>
        <Ionicons name="albums-outline" size={20} color="#111" />
        <Text style={styles.quickText}>전체 도감</Text>
        <Ionicons name="chevron-forward" size={16} color="#999" />
      </Card>
      <Card style={styles.quickCard} onPress={onOpenHistory}>
        <Ionicons name="calendar-outline" size={20} color="#111" />
        <Text style={styles.quickText}>내 기록</Text>
        <Ionicons name="chevron-forward" size={16} color="#999" />
      </Card>
      {nearby.length > 0 && (
        <Card style={styles.banner} onPress={() => onCheckIn(nearby)}>
          <View style={styles.bannerDot} />
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>{nearby[0].gym.name}에 있네요</Text>
            <Text style={styles.bannerHint}>
              {visitedToday(dex, nearby[0].gym.id) ? '오늘 방문 등록 완료 · 암장 페이지 열기' : '도감에 등록하고 사진 찍기'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#111" />
        </Card>
      )}
    </View>
  );

  const footer =
    stale.length > 0 || unvisitedNear.length > 0 ? (
      <View>
        <Text style={styles.suggestTitle}>오늘 어디 갈까요?</Text>
        {stale.length > 0 && (
          <View>
            <Text style={styles.listTitle}>오랜만에 가 볼까요?</Text>
            {stale.map(({ gym, at }) => (
              <GymRow key={gym.id} gym={gym} dex={dex} meta={`마지막 방문 ${formatAgo(at)} · ${gym.region1} ${gym.region2}`} onPress={() => onOpenGym(gym)} />
            ))}
          </View>
        )}
        {unvisitedNear.length > 0 && (
          <View>
            <Text style={styles.listTitle}>근처 새 암장 가 볼까요?</Text>
            {unvisitedNear.map(({ gym, distance }) => (
              <GymRow key={gym.id} gym={gym} dex={dex} meta={`${formatDistance(distance)} · ${gym.region1} ${gym.region2}`} onPress={() => onOpenGym(gym)} />
            ))}
          </View>
        )}
      </View>
    ) : null;

  return (
    <View style={styles.container}>
      {header}
      <FlatList
        data={rows}
        refreshControl={refreshControl}
        keyExtractor={(row) => row.map((g) => g.id).join('-')}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
          {quick}
          {!account ? (
            <Card style={styles.guest} onPress={onAccount}>
              <Text style={styles.guestTitle}>로그인하면 다녀온 암장이 여기 모여요</Text>
              <Text style={styles.guestHint}>암장에서 방문 등록하고 사진을 남겨 도감을 채워 보세요</Text>
            </Card>
          ) : mine.length > 0 ? (
            <Text style={styles.listTitle}>내 암장</Text>
          ) : (
            <EmptyState small title="첫 암장을 도감에 등록해 보세요" lines={['암장에 가서 방문 등록하면 여기 쌓여요']} seed="dex" />
          )}
          </>
        }
        renderItem={({ item: row, index }) => (
          <View style={styles.row}>
            {row.map((gym, col) => (
              <GymCard key={gym.id} gym={gym} dex={dex} size={cell} delay={index < 6 ? index * 60 + col * 30 : undefined} onPress={() => onOpenGym(gym)} />
            ))}
          </View>
        )}
        ListFooterComponent={footer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  full: { flexBasis: '100%' },
  locCard: { gap: 6 },
  locTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  locHint: { fontSize: 13, color: '#666', lineHeight: 18 },
  locActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  locDenied: { gap: 2, paddingHorizontal: 4 },
  quickCard: { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 14 },
  quickText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111' },
  guest: { marginTop: 12, padding: 14, gap: 4 },
  guestTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  guestHint: { fontSize: 13, color: '#666' },
  banner: { flexBasis: '100%', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: RED },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { color: '#111', fontSize: 15, fontWeight: '700' },
  bannerHint: { color: '#666', fontSize: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  suggestTitle: { fontSize: 20, fontWeight: '800', color: '#111', paddingTop: 28 },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#666', paddingTop: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
});
