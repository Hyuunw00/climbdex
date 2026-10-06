import { useMemo } from 'react';
import { FlatList, Pressable, SectionList, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useRefreshControl } from '../components/refresh';
import { type Gym, formatNo, gyms, regions } from '../data/gyms';
import type { DexState } from '../store/dex';
import { GymCard, GymRow, Progress, RED } from '../components/dex';

type Props = {
  dex: DexState;
  region: string | null;
  onRegion: (region: string | null) => void;
  query: string;
  onQuery: (query: string) => void;
  onOpenGym: (gym: Gym) => void;
  onBack: () => void;
  onRefresh?: () => Promise<void>;
};

const COLUMNS = 3;

export default function AllGymsScreen({ dex, region, onRegion, query, onQuery, onOpenGym, onBack, onRefresh }: Props) {
  const refreshControl = useRefreshControl(onRefresh);
  const { width } = useWindowDimensions();
  const visitedIds = useMemo(() => new Set(dex.visits.map((v) => v.gymId)), [dex.visits]);

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
          <Pressable onPress={() => (region ? onRegion(null) : onBack())} hitSlop={8} style={styles.backRow}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.title}>{region ?? '전체 도감'}</Text>
          </Pressable>
        </View>
        <View style={styles.counter}>
          <Text style={styles.counterBig}>{current ? current.visited : visitedIds.size}</Text>
          <Text style={styles.counterSmall}>/ {current ? current.total : gyms.length}</Text>
        </View>
      </View>
      <Progress value={current ? current.visited : visitedIds.size} total={current ? current.total : gyms.length} color="#fff" track="rgba(255,255,255,0.25)" />
    </View>
  );

  if (region) {
    return (
      <View style={styles.container}>
        {header}
        <SectionList
          sections={sections}
          refreshControl={refreshControl}
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
          renderItem={({ item: row }) => (
            <View style={styles.row}>
              {row.map((gym) => (
                <GymCard key={gym.id} gym={gym} dex={dex} size={cell} onPress={() => onOpenGym(gym)} />
              ))}
            </View>
          )}
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
          refreshControl={refreshControl}
          keyExtractor={(g) => g.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>찾는 암장이 없어요</Text>}
          renderItem={({ item: gym }) => (
            <GymRow gym={gym} dex={dex} meta={`${formatNo(gym.no)} · ${gym.region1} ${gym.region2}`} onPress={() => onOpenGym(gym)} />
          )}
        />
      ) : (
        <FlatList
          key="regions"
          data={regionStats}
          refreshControl={refreshControl}
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
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});
