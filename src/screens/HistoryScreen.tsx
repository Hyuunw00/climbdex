import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import DexHeader from '../components/DexHeader';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRefreshControl } from '../components/refresh';
import { type Gym, gymById } from '../data/gyms';
import { type DexState, dayKey, lastVisits } from '../store/dex';
import { GymRow, RED, regionColor } from '../components/dex';
import { type MySend, fetchMySends } from '../store/sends';

type Props = {
  dex: DexState;
  onOpenGym: (gym: Gym, day?: string) => void;
  onBack: () => void;
  onRefresh?: () => Promise<void>;
  userId: string | null;
  month: { year: number; month: number };
  onMonth: (month: { year: number; month: number }) => void;
  selected: string;
  onSelect: (day: string) => void;
  account: { name: string; email: string } | null;
  onAccount: () => void;
  onOpenSettings: () => void;
};

type DayEntry = { gym: Gym; at: string; visited: boolean; clips: number; sent: number };

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_DOTS = 3;

export default function HistoryScreen({ dex, onOpenGym, onBack, onRefresh, userId, month, onMonth: setMonth, selected, onSelect: setSelected, account, onAccount, onOpenSettings }: Props) {
  const [sends, setSends] = useState<MySend[]>([]);
  const loadSends = async () => {
    if (!userId) return setSends([]);
    try {
      const rows = await fetchMySends(userId);
      setSends(rows);
    } catch (e) {
      console.log('fetch sends error', String(e));
    }
  };
  useEffect(() => {
    if (!userId) return setSends([]);
    let cancelled = false;
    fetchMySends(userId)
      .then((rows) => {
        if (!cancelled) setSends(rows);
      })
      .catch((e) => console.log('fetch sends error', String(e)));
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const refreshControl = useRefreshControl(async () => {
    await Promise.all([onRefresh?.(), loadSends()]);
  });
  const today = new Date();

  const byDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const v of dex.visits) {
      const gym = gymById.get(v.gymId);
      if (!gym) continue;
      const key = dayKey(v.at);
      map.set(key, [...(map.get(key) ?? []), { gym, at: v.at, visited: true, clips: 0, sent: 0 }]);
    }
    for (const s of sends) {
      const gym = gymById.get(s.gymId);
      if (!gym) continue;
      const key = dayKey(s.at);
      const day = map.get(key) ?? [];
      let entry = day.find((e) => e.gym.id === gym.id);
      if (!entry) {
        entry = { gym, at: s.at, visited: false, clips: 0, sent: 0 };
        day.push(entry);
        map.set(key, day);
      }
      entry.clips += 1;
      if (s.sent) entry.sent += 1;
    }
    return map;
  }, [dex.visits, sends]);

  const gymCount = useMemo(() => lastVisits(dex).size, [dex.visits]);

  const cells = useMemo(() => {
    const first = new Date(month.year, month.month, 1);
    const days = new Date(month.year, month.month + 1, 0).getDate();
    const out: (string | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= days; d++) out.push(dayKey(new Date(month.year, month.month, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  const weeks = useMemo(() => {
    const out: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  const shift = (delta: number) => {
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const todayKey = dayKey(today);
  const isCurrentMonth = month.year === today.getFullYear() && month.month === today.getMonth();
  const selectedVisits = byDay.get(selected) ?? [];

  return (
    <View style={styles.container}>
      <DexHeader title="내 기록" onBack={onBack} subtitle={`방문 ${dex.visits.length}회 · 암장 ${gymCount}곳`} account={account} onAccount={onAccount} onOpenSettings={onOpenSettings} />
      <ScrollView contentContainerStyle={styles.list} refreshControl={refreshControl}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => shift(-1)} hitSlop={12} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={22} color="#111" />
          </Pressable>
          <Text style={styles.monthTitle}>
            {month.year}년 {month.month + 1}월
          </Text>
          <Pressable onPress={() => shift(1)} hitSlop={12} disabled={isCurrentMonth} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={22} color={isCurrentMonth ? '#ccc' : '#111'} />
          </Pressable>
        </View>
        <View style={styles.week}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={styles.weekday}>
              {w}
            </Text>
          ))}
        </View>
        <View style={styles.legend}>
          <View style={[styles.dot, { backgroundColor: RED }]} />
          <Text style={styles.legendText}>방문 등록</Text>
          <View style={[styles.dot, styles.dotHollow, { borderColor: RED }]} />
          <Text style={styles.legendText}>클립만 저장</Text>
        </View>
        {weeks.map((week, i) => (
          <View key={i} style={styles.week}>
            {week.map((key, j) => {
              if (!key) return <View key={j} style={styles.day} />;
              const visits = byDay.get(key) ?? [];
              const isSelected = key === selected;
              return (
                <Pressable key={key} style={styles.day} onPress={() => setSelected(key)}>
                  <View style={[styles.dayCircle, isSelected && styles.daySelected]}>
                    <Text style={[styles.dayText, key === todayKey && styles.dayToday, isSelected && styles.dayTextSelected]}>{Number(key.slice(-2))}</Text>
                  </View>
                  <View style={styles.dots}>
                    {visits.slice(0, MAX_DOTS).map((v, k) => (
                      <View key={k} style={[styles.dot, v.visited ? { backgroundColor: regionColor(v.gym.region1) } : [styles.dotHollow, { borderColor: regionColor(v.gym.region1) }]]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        {selectedVisits.length === 0 ? (
          <Text style={styles.noDay}>이날은 기록이 없어요</Text>
        ) : (
          <View>
            <Text style={styles.listTitle}>{selected.replace(/-/g, '.')}</Text>
            {selectedVisits.map((v) => (
              <GymRow
                key={`${v.gym.id}-${v.at}`}
                gym={v.gym}
                dex={dex}
                meta={[`${v.gym.region1} ${v.gym.region2}`, ...(v.clips > 0 ? [`클립 ${v.clips}개 · 완등 ${v.sent}`] : [])].join(' · ')}
                onPress={() => onOpenGym(v.gym, selected)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  noDay: { textAlign: 'center', color: '#999', fontSize: 13, paddingTop: 20 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 8 },
  monthTitle: { fontSize: 16, fontWeight: '800' },
  monthArrow: { paddingHorizontal: 8, paddingVertical: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, justifyContent: 'flex-end' },
  legendText: { fontSize: 11, color: '#999', marginRight: 6 },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, color: '#999', paddingVertical: 4 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: RED },
  dayText: { fontSize: 14, color: '#111' },
  dayToday: { color: RED, fontWeight: '800' },
  dayTextSelected: { color: '#fff', fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  dotHollow: { borderWidth: 1, backgroundColor: 'transparent' },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#666', paddingTop: 16, paddingBottom: 8 },
});
