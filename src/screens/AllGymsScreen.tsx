import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useMemo, useState } from 'react';
import Button from '../components/Button';
import GymReportSheet from '../components/GymReportSheet';
import DexHeader from '../components/DexHeader';
import { FlatList, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
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
  userId: string | null;
  onNeedAuth: () => void;
  account: { name: string; email: string } | null;
  onAccount: () => void;
  onOpenSettings: () => void;
};

const COLUMNS = 3;

export default function AllGymsScreen({ dex, region, onRegion, query, onQuery, onOpenGym, onBack, onRefresh, userId, onNeedAuth, account, onAccount, onOpenSettings }: Props) {
  const refreshControl = useRefreshControl(onRefresh);
  const [reporting, setReporting] = useState(false);
  const { width } = useWindowDimensions();
  const visitedIds = useMemo(() => new Set(dex.visits.map((v) => v.gymId)), [dex.visits]);

  const trimmed = query.trim().toLowerCase().replace(/\s+/g, '');
  const results = useMemo(() => {
    if (!trimmed) return [];
    return gyms
      .filter((g) => !region || g.region1 === region)
      .filter((g) => `${g.name}${g.region1}${g.region2}${g.address}`.toLowerCase().replace(/\s+/g, '').includes(trimmed))
      .slice(0, 50);
  }, [trimmed, region]);

  const regionStats = useMemo(
    () =>
      regions.map((r) => {
        const list = gyms.filter((g) => g.region1 === r);
        return { name: r, total: list.length, visited: list.filter((g) => visitedIds.has(g.id)).length };
      }),
    [visitedIds],
  );

  const sections = useMemo(() => {
    const inRegion = region ? gyms.filter((g) => g.region1 === region) : gyms;
    const groups = new Map<string, Gym[]>();
    for (const g of inRegion) {
      const key = region ? g.region2 : g.region1;
      groups.set(key, [...(groups.get(key) ?? []), g]);
    }
    const order = (name: string) => (region ? 0 : regions.indexOf(name));
    return [...groups.entries()]
      .sort((a, b) => (region ? a[0].localeCompare(b[0], 'ko') : order(a[0]) - order(b[0])))
      .map(([title, list]) => {
        const rows: Gym[][] = [];
        for (let i = 0; i < list.length; i += COLUMNS) rows.push(list.slice(i, i + COLUMNS));
        return { title, total: list.length, visited: list.filter((g) => visitedIds.has(g.id)).length, data: rows };
      });
  }, [region, visitedIds]);

  const cell = (width - 32 - 10 * (COLUMNS - 1)) / COLUMNS;
  const current = region ? regionStats.find((r) => r.name === region) : null;


  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
      <Pressable style={[styles.chip, !region && styles.chipOn]} onPress={() => onRegion(null)}>
        <Text style={[styles.chipText, !region && styles.chipTextOn]}>전체</Text>
      </Pressable>
      {regionStats.map((r) => {
        const on = region === r.name;
        const complete = r.total > 0 && r.visited === r.total;
        return (
          <Pressable key={r.name} style={[styles.chip, on && styles.chipOn, complete && styles.chipComplete]} onPress={() => onRegion(on ? null : r.name)}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const header = (
    <DexHeader
      title="전체 도감"
      onBack={onBack}
      account={account}
      onAccount={onAccount}
      onOpenSettings={onOpenSettings}
      counter={{ value: current ? current.visited : visitedIds.size, total: current ? current.total : gyms.length }}
      progress={{ value: current ? current.visited : visitedIds.size, total: current ? current.total : gyms.length }}
    >
      {chips}
    </DexHeader>
  );

  const searchBox = (
    <View style={styles.searchBox}>
      <Ionicons name="search" size={18} color="#666" />
      <TextInput
        style={styles.searchInput}
        placeholder={region ? `${region} 안에서 찾기` : '암장 이름이나 동네로 찾기'}
        placeholderTextColor="#999"
        value={query}
        onChangeText={onQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {query.length > 0 && (
        <Pressable onPress={() => onQuery('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color="#999" />
        </Pressable>
      )}
    </View>
  );

  const resultList = (
    <FlatList
      key="results"
      data={results}
      refreshControl={refreshControl}
      keyExtractor={(g) => g.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>{region ? `${region}에서 찾는 암장이 없어요` : '찾는 암장이 없어요'}</Text>
          <Button variant="text" small label="없는 암장 알려주기" icon="add-circle-outline" onPress={() => (userId ? setReporting(true) : onNeedAuth())} />
        </View>
      }
      renderItem={({ item: gym }) => (
        <GymRow gym={gym} dex={dex} meta={`${formatNo(gym.no)} · ${gym.region1} ${gym.region2}`} onPress={() => onOpenGym(gym)} />
      )}
    />
  );

  const reportSheet = reporting && userId ? <GymReportSheet gym={null} initialName={query.trim()} userId={userId} onClose={() => setReporting(false)} /> : null;

  return (
    <View style={styles.container}>
      {header}
      {searchBox}
      {reportSheet}
      {trimmed ? (
        resultList
      ) : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 16, marginBottom: 4, paddingHorizontal: 12, height: 44, borderRadius: 12, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontSize: 15, color: '#111', paddingVertical: 0 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  chipsScroll: { flexGrow: 0, marginHorizontal: -20, marginTop: 4 },
  chips: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)' },
  chipOn: { backgroundColor: '#fff' },
  chipComplete: { borderWidth: 1.5, borderColor: '#fff' },
  chipText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  chipTextOn: { color: RED },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16, paddingBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  sectionBar: { flex: 1 },
  sectionCount: { fontSize: 12, color: '#999', minWidth: 36, textAlign: 'right' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  emptyBox: { alignItems: 'center', paddingTop: 24, gap: 4 },
});
