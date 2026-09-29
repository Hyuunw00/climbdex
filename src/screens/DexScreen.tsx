import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, SectionList, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { type Candidate, type Gym, formatNo, gyms, nearbyGyms, regions } from '../data/gyms';
import { type DexState, visitedToday } from '../store/dex';
import { RED, Silhouette, allowedMeters } from '../components/dex';

type Props = {
  dex: DexState;
  onOpenGym: (gym: Gym) => void;
  onCheckIn: (candidates: Candidate[]) => void;
  region: string | null;
  onRegion: (region: string | null) => void;
  query: string;
  onQuery: (query: string) => void;
};

const COLUMNS = 3;
function Progress({ value, total, color = RED, track = '#eee' }: { value: number; total: number; color?: string; track?: string }) {
  const ratio = total > 0 ? value / total : 0;
  return (
    <View style={[styles.track, { backgroundColor: track }]}>
      <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function DexScreen({ dex, region, onRegion, query, onQuery, onOpenGym, onCheckIn }: Props) {
  const { width } = useWindowDimensions();
  const [nearby, setNearby] = useState<Candidate[]>([]);

  const visitedIds = useMemo(() => new Set(dex.visits.map((v) => v.gymId)), [dex.visits]);
  const visitCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of dex.visits) counts.set(v.gymId, (counts.get(v.gymId) ?? 0) + 1);
    return counts;
  }, [dex.visits]);

  useEffect(() => {
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setNearby(nearbyGyms(position.coords.latitude, position.coords.longitude, allowedMeters(position.coords.accuracy)).slice(0, 5));
      } catch {}
    })();
  }, []);

  const trimmed = query.trim().toLowerCase().replace(/\s+/g, '');
  const results = useMemo(() => {
    if (!trimmed) return [];
    return gyms
      .filter((g) => `${g.name}${g.region1}${g.region2}${g.address}`.toLowerCase().replace(/\s+/g, '').includes(trimmed))
      .slice(0, 50);
  }, [trimmed]);

  const regionStats = useMemo(
    () =>
      regions.map((r) => {
        const list = gyms.filter((g) => g.region1 === r);
        return { name: r, total: list.length, visited: list.filter((g) => visitedIds.has(g.id)).length };
      }),
    [visitedIds],
  );

  const sections = useMemo(() => {
    if (!region) return [];
    const inRegion = gyms.filter((g) => g.region1 === region);
    const groups = new Map<string, Gym[]>();
    for (const g of inRegion) groups.set(g.region2, [...(groups.get(g.region2) ?? []), g]);
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
      .map(([title, list]) => {
        const rows: Gym[][] = [];
        for (let i = 0; i < list.length; i += COLUMNS) rows.push(list.slice(i, i + COLUMNS));
        return { title, total: list.length, visited: list.filter((g) => visitedIds.has(g.id)).length, data: rows };
      });
  }, [region, visitedIds]);

  const cell = (width - 32 - 10 * (COLUMNS - 1)) / COLUMNS;
  const regionCard = (width - 32 - 10) / 2;
  const current = region ? regionStats.find((r) => r.name === region) : null;

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>CLIMBDEX · 대한민국</Text>
          {region ? (
            <Pressable onPress={() => onRegion(null)} hitSlop={8} style={styles.backRow}>
              <Text style={styles.backArrow}>‹</Text>
              <Text style={styles.title}>{region}</Text>
            </Pressable>
          ) : (
            <Text style={styles.title}>암장 도감</Text>
          )}
        </View>
        <View style={styles.counter}>
          <Text style={styles.counterBig}>{current ? current.visited : visitedIds.size}</Text>
          <Text style={styles.counterSmall}>/ {current ? current.total : gyms.length}</Text>
        </View>
      </View>
      <Progress value={current ? current.visited : visitedIds.size} total={current ? current.total : gyms.length} color="#fff" track="rgba(255,255,255,0.25)" />
      {nearby.length > 0 && !region && (
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

  const renderGymCard = (gym: Gym) => {
    const visited = visitedIds.has(gym.id);
    const photo = visited ? dex.photos[gym.id] : undefined;
    const count = visitCount.get(gym.id) ?? 0;
    return (
      <Pressable key={gym.id} style={[styles.cell, { width: cell }]} onPress={() => onOpenGym(gym)}>
        <View style={[styles.card, { height: cell * 1.1 }, visited && styles.cardVisited]}>
          {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <Silhouette size={cell * 0.8} visited={visited} seed={gym.id} region={gym.region1} />}
          <Text style={[styles.no, visited && styles.noVisited]}>{formatNo(gym.no)}</Text>
          {visited && (
            <View style={styles.stamp}>
              <Text style={styles.stampText}>{count > 1 ? `×${count}` : '✓'}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.name, !visited && styles.nameDim]} numberOfLines={2}>
          {gym.name}
        </Text>
      </Pressable>
    );
  };

  if (region) {
    return (
      <View style={styles.container}>
        {header}
        <SectionList
          sections={sections}
          keyExtractor={(row) => row.map((g) => g.id).join('-')}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionBar}>
                <Progress value={section.visited} total={section.total} />
              </View>
              <Text style={styles.sectionCount}>
                {section.visited}/{section.total}
              </Text>
            </View>
          )}
          renderItem={({ item: row }) => <View style={styles.row}>{row.map(renderGymCard)}</View>}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="암장 이름이나 동네로 찾기"
          placeholderTextColor="#999"
          value={query}
          onChangeText={onQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <Pressable onPress={() => onQuery('')} hitSlop={8}>
            <Text style={styles.searchClear}>×</Text>
          </Pressable>
        )}
      </View>
      {trimmed ? (
        <FlatList
          key="results"
          data={results}
          keyExtractor={(g) => g.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>찾는 암장이 없어요</Text>}
          renderItem={({ item: gym }) => {
            const visited = visitedIds.has(gym.id);
            const photo = visited ? dex.photos[gym.id] : undefined;
            return (
              <Pressable style={styles.result} onPress={() => onOpenGym(gym)}>
                <View style={[styles.resultThumb, visited && styles.resultThumbVisited]}>
                  {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <Silhouette size={40} visited={visited} seed={gym.id} region={gym.region1} />}
                </View>
                <View style={styles.resultBody}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {gym.name}
                  </Text>
                  <Text style={styles.resultMeta} numberOfLines={1}>
                    {formatNo(gym.no)} · {gym.region1} {gym.region2}
                  </Text>
                </View>
                {visited && (
                  <View style={styles.stampInline}>
                    <Text style={styles.stampText}>✓</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          key="regions"
          data={regionStats}
          keyExtractor={(r) => r.name}
          numColumns={2}
          columnWrapperStyle={styles.regionRow}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.listTitle}>지역</Text>}
          renderItem={({ item: r }) => {
            const complete = r.total > 0 && r.visited === r.total;
            return (
              <Pressable style={[styles.regionCard, { width: regionCard }, complete && styles.regionCardComplete]} onPress={() => onRegion(r.name)}>
                <View style={styles.regionCardRow}>
                  <Text style={styles.regionName}>{r.name}</Text>
                  <Text style={styles.regionCount}>
                    <Text style={styles.regionVisited}>{r.visited}</Text> / {r.total}
                  </Text>
                </View>
                <Progress value={r.visited} total={r.total} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: RED, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 10, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backArrow: { color: '#fff', fontSize: 30, fontWeight: '300', marginTop: -2 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 2 },
  counter: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  counterBig: { color: '#fff', fontSize: 34, fontWeight: '800' },
  counterSmall: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  banner: { marginTop: 4, padding: 12, borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: RED },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { color: '#111', fontSize: 15, fontWeight: '700' },
  bannerHint: { color: '#666', fontSize: 12 },
  bannerArrow: { color: '#111', fontSize: 24 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 12, height: 44, borderRadius: 12, backgroundColor: '#f1f1f4' },
  searchIcon: { fontSize: 18, color: '#666' },
  searchInput: { flex: 1, fontSize: 15, color: '#111', paddingVertical: 0 },
  searchClear: { fontSize: 20, color: '#999' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#666', paddingTop: 16, paddingBottom: 8 },
  regionRow: { gap: 10, marginBottom: 10 },
  regionCard: { padding: 14, borderRadius: 14, backgroundColor: '#f7f7f9', gap: 10, borderWidth: 2, borderColor: 'transparent' },
  regionCardComplete: { borderColor: RED, backgroundColor: '#fff3d6' },
  regionCardRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  regionName: { fontSize: 16, fontWeight: '800' },
  regionCount: { fontSize: 12, color: '#999' },
  regionVisited: { fontSize: 14, fontWeight: '800', color: RED },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16, paddingBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  sectionBar: { flex: 1 },
  sectionCount: { fontSize: 12, color: '#999', minWidth: 36, textAlign: 'right' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  cell: { gap: 5 },
  card: { borderRadius: 14, backgroundColor: '#eceef2', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  cardVisited: { borderColor: RED, backgroundColor: '#fff3d6' },
  photo: { width: '100%', height: '100%' },
  no: { position: 'absolute', left: 8, top: 6, fontSize: 11, fontWeight: '700', color: '#8a8a94' },
  noVisited: { color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  stamp: { position: 'absolute', right: 6, top: 6, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  stampInline: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  stampText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  name: { fontSize: 12, fontWeight: '600', color: '#111', lineHeight: 16 },
  nameDim: { color: '#999', fontWeight: '400' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e5' },
  resultThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#eceef2', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  resultThumbVisited: { borderColor: RED, backgroundColor: '#fff3d6' },
  resultBody: { flex: 1, gap: 2 },
  resultName: { fontSize: 15, fontWeight: '600' },
  resultMeta: { fontSize: 12, color: '#888' },
});
