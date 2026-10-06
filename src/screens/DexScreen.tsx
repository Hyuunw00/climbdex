import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  onRefresh?: () => Promise<void>;
};

const COLUMNS = 3;
const NEAR = 5;
const STALE_DAYS = 7;

export default function DexScreen({ dex, onOpenGym, onCheckIn, onOpenAll, onOpenHistory, onAccount, account, onRefresh }: Props) {
  const refreshControl = useRefreshControl(onRefresh);
  const { width } = useWindowDimensions();
  const [nearby, setNearby] = useState<Candidate[]>([]);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

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

  useEffect(() => {
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      try {
        const known = await Location.getLastKnownPositionAsync();
        if (known) setPosition({ lat: known.coords.latitude, lng: known.coords.longitude });
      } catch {}
      try {
        const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setPosition({ lat: coords.latitude, lng: coords.longitude });
        setNearby(nearbyGyms(coords.latitude, coords.longitude, allowedMeters(coords.accuracy)).slice(0, 5));
      } catch {}
    })();
  }, []);

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
    <View style={styles.header}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>CLIMBDEX · 대한민국</Text>
        {account ? (
          <Pressable style={styles.profileChip} onPress={onAccount} hitSlop={6}>
            <View style={styles.chipAvatar}>
              <Text style={styles.chipInitial}>{(account.name || account.email || '?').slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={styles.chipName} numberOfLines={1}>
              {account.name || account.email.split('@')[0]}
            </Text>
            <Text style={styles.chipArrow}>›</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onAccount} hitSlop={10}>
            <Text style={styles.loginText}>로그인</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>암장 도감</Text>
        </View>
        <View style={styles.counter}>
          <Text style={styles.counterBig}>{last.size}</Text>
          <Text style={styles.counterSmall}>/ {gyms.length}</Text>
        </View>
      </View>
      <Progress value={last.size} total={gyms.length} color="#fff" track="rgba(255,255,255,0.25)" />
      <View style={styles.links}>
        <Pressable style={styles.link} onPress={onOpenAll}>
          <Text style={styles.linkText}>전체 도감</Text>
          <Text style={styles.linkArrow}>›</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={onOpenHistory}>
          <Text style={styles.linkText}>내 기록</Text>
          <Text style={styles.linkArrow}>›</Text>
        </Pressable>
      </View>
      {nearby.length > 0 && (
        <Pressable style={styles.banner} onPress={() => onCheckIn(nearby)}>
          <View style={styles.bannerDot} />
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>{nearby[0].gym.name}에 있네요</Text>
            <Text style={styles.bannerHint}>
              {visitedToday(dex, nearby[0].gym.id) ? '오늘 방문 등록 완료 · 암장 페이지 열기' : '도감에 등록하고 사진 찍기'}
            </Text>
          </View>
          <Text style={styles.bannerArrow}>›</Text>
        </Pressable>
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
          !account ? (
            <Pressable style={styles.guest} onPress={onAccount}>
              <Text style={styles.guestTitle}>로그인하면 다녀온 암장이 여기 모여요</Text>
              <Text style={styles.guestHint}>암장에서 방문 등록하고 사진을 남겨 도감을 채워 보세요 ›</Text>
            </Pressable>
          ) : mine.length > 0 ? (
            <Text style={styles.listTitle}>내 암장</Text>
          ) : null
        }
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            {row.map((gym) => (
              <GymCard key={gym.id} gym={gym} dex={dex} size={cell} onPress={() => onOpenGym(gym)} />
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
  header: { backgroundColor: RED, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 10, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 2 },
  counter: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  counterBig: { color: '#fff', fontSize: 34, fontWeight: '800' },
  counterSmall: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
  links: { flexDirection: 'row', gap: 8, marginTop: 2 },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)' },
  linkText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  linkArrow: { color: 'rgba(255,255,255,0.8)', fontSize: 20 },
  guest: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#f6f6f8', gap: 4 },
  guestTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  guestHint: { fontSize: 13, color: '#666' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 8, height: 32, borderRadius: 16, backgroundColor: '#fff', maxWidth: 180 },
  chipAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  chipInitial: { color: '#fff', fontSize: 12, fontWeight: '800' },
  chipName: { color: '#111', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  loginText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  chipArrow: { color: '#999', fontSize: 18, marginTop: -2 },
  banner: { marginTop: 4, padding: 12, borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: RED },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { color: '#111', fontSize: 15, fontWeight: '700' },
  bannerHint: { color: '#666', fontSize: 12 },
  bannerArrow: { color: '#111', fontSize: 24 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  suggestTitle: { fontSize: 20, fontWeight: '800', color: '#111', paddingTop: 28 },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#666', paddingTop: 16, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
});
