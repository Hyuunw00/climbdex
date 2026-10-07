import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Gym, distanceMeters, gymById, gyms } from '../data/gyms';
import type { DexState } from '../store/dex';
import { formatDistance } from './dex';

type Row = { gym: Gym; note: string };

export default function GymPickerSheet({ dex, onClose, onPick }: { dex: DexState; onClose: () => void; onPick: (gym: Gym) => void }) {
  const [query, setQuery] = useState('');
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) return;
        const position = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!cancelled && position) setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = query.trim().toLowerCase().replace(/\s+/g, '');
  const rows = useMemo<Row[]>(() => {
    if (trimmed) {
      return gyms
        .filter((g) => `${g.name}${g.region1}${g.region2}${g.address}`.toLowerCase().replace(/\s+/g, '').includes(trimmed))
        .slice(0, 50)
        .map((gym) => ({ gym, note: `${gym.region1} ${gym.region2}` }));
    }
    const seen = new Set<string>();
    const recent: Row[] = [];
    for (const v of [...dex.visits].sort((a, b) => b.at.localeCompare(a.at))) {
      const gym = gymById.get(v.gymId);
      if (!gym || seen.has(gym.id)) continue;
      seen.add(gym.id);
      recent.push({ gym, note: '최근 간 암장' });
    }
    const near: Row[] = here
      ? gyms
          .map((gym) => ({ gym, d: distanceMeters(here.lat, here.lng, gym.lat, gym.lng) }))
          .filter((x) => !seen.has(x.gym.id) && x.d <= 20000)
          .sort((a, b) => a.d - b.d)
          .slice(0, 10)
          .map((x) => ({ gym: x.gym, note: formatDistance(x.d) }))
      : [];
    return [...recent, ...near];
  }, [trimmed, dex.visits, here]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, Platform.OS === 'android' && { paddingTop: insets.top + 20 }, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>어느 암장이에요?</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color="#111" />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#999" />
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="암장 이름 검색" placeholderTextColor="#aaa" autoFocus autoCorrect={false} />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#bbb" />
            </Pressable>
          )}
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.gym.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onPick(item.gym)}>
              <Text style={styles.name}>{item.gym.name}</Text>
              <Text style={styles.note}>{item.note}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{trimmed ? '검색 결과가 없어요' : '암장 이름을 검색해 주세요'}</Text>}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: 20, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f2f2f2', borderRadius: 10, paddingHorizontal: 12, height: 42 },
  input: { flex: 1, fontSize: 15, color: '#111' },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e5e5' },
  name: { fontSize: 15, color: '#111' },
  note: { fontSize: 12, color: '#888', marginTop: 2 },
  empty: { fontSize: 13, color: '#999', textAlign: 'center', marginTop: 24 },
});
