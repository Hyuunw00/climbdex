import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RED } from './dex';
import {
  PALETTE, type Tape, type TapeData, type TapeSummary, V_MAX, V_MIN,
  castVote, fetchTapes, formatRange, formatV, removeVote, saveTapeSet, sendReport, summarize,
} from '../store/tapes';

type Props = {
  gymId: string;
  userId: string | null;
  checkedIn: boolean;
  onNeedAuth: () => void;
  refreshKey?: number;
};

const V_OPTIONS = Array.from({ length: V_MAX - V_MIN + 1 }, (_, i) => V_MIN + i);

export function Swatch({ color, size = 28 }: { color: string | null; size?: number }) {
  return <View style={{ width: size * 1.6, height: size * 0.6, borderRadius: 3, backgroundColor: color ?? '#ddd', borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' }} />;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, Platform.OS === 'android' && { paddingTop: insets.top + 20 }, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color="#111" />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

export default function TapeSection({ gymId, userId, checkedIn, onNeedAuth, refreshKey }: Props) {
  const [data, setData] = useState<TapeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [voting, setVoting] = useState<TapeSummary | null>(null);
  const [reporting, setReporting] = useState(false);
  const [ordering, setOrdering] = useState(false);

  const load = async () => {
    try {
      setData(await fetchTapes(gymId));
      setFailed(false);
    } catch (e) {
      console.log('tapes load error', String(e));
      setFailed(true);
    }
  };

  useEffect(() => {
    setData(null);
    load();
  }, [gymId, refreshKey]);

  const requireMember = (action: () => void) => {
    if (!userId) return onNeedAuth();
    if (!checkedIn) return Alert.alert('이 암장에 간 기록이 필요해요', '도감에 등록하거나 이 암장에서 찍은 영상으로 클립을 저장하면 참여할 수 있어요');
    action();
  };

  const summary = data ? summarize(data, userId) : [];
  const voteTotal = data ? data.votes.length : 0;

  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>난이도 표</Text>
        {data?.set && (
          <Text style={styles.source}>
            {[data.set.source === 'user' ? '제보 1명' : '추정', voteTotal > 0 ? `투표 ${voteTotal}` : null].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
      {failed ? (
        <Pressable onPress={load}>
          <Text style={styles.empty}>불러오지 못했어요. 눌러서 다시 시도</Text>
        </Pressable>
      ) : !data ? (
        <Text style={styles.empty}>불러오는 중…</Text>
      ) : !data.set ? (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>아직 난이도 순서가 없어요</Text>
          <Pressable style={styles.secondary} onPress={() => requireMember(() => setOrdering(true))}>
            <Text style={styles.secondaryText}>난이도 순서 알려 주세요</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.boardWrap}>
            <View style={styles.rail}>
              <Text style={styles.railArrow}>▲</Text>
              {summary.map((t, i) => (
                <View key={t.label} style={[styles.railStep, { opacity: 1 - (i / Math.max(1, summary.length - 1)) * 0.85 }]} />
              ))}
            </View>
          <View style={styles.board}>
            {[...summary].reverse().map((t) => (
              <Pressable key={t.label} style={[styles.row, t.voted && styles.rowVoted]} onPress={() => requireMember(() => setVoting(t))}>
                <View style={[styles.bar, { backgroundColor: t.color ?? '#ddd' }]}>
                  <Text style={[styles.barLabel, isDark(t.color) && styles.barLabelLight]}>{t.label}</Text>
                </View>
                <Text style={styles.rowV}>{formatRange(t.vMin, t.vMax)}</Text>
                <Text style={styles.rowVotes}>{t.votes > 0 ? `투표 ${t.votes}` : ''}</Text>
              </Pressable>
            ))}
          </View>
          </View>
          <Text style={styles.hint}>누르면 투표할 수 있어요</Text>
          <Pressable onPress={() => (userId ? setReporting(true) : onNeedAuth())}>
            <Text style={styles.report}>표가 틀렸나요? 신고하기</Text>
          </Pressable>
        </>
      )}

      {voting && userId && (
        <VoteSheet
          tape={voting}
          mine={data?.votes.find((v) => v.userId === userId && v.label === voting.label) ?? null}
          onClose={() => setVoting(null)}
          onSubmit={async (min, max) => {
            try {
              await castVote(userId, gymId, voting.label, min, max);
              setVoting(null);
              load();
            } catch (e) {
              Alert.alert('투표하지 못했어요', String(e));
            }
          }}
          onRemove={async () => {
            try {
              await removeVote(userId, gymId, voting.label);
              setVoting(null);
              load();
            } catch (e) {
              Alert.alert('취소하지 못했어요', String(e));
            }
          }}
        />
      )}

      {reporting && userId && (
        <ReportSheet
          tapes={data?.set?.tapes ?? []}
          onClose={() => setReporting(false)}
          onSubmit={async (kind, label, note) => {
            try {
              await sendReport(userId, gymId, kind, label, note, checkedIn);
              setReporting(false);
              Alert.alert('신고 완료', '확인한 뒤 표를 고칠게요');
            } catch (e) {
              Alert.alert('보내지 못했어요', String(e));
            }
          }}
        />
      )}

      {ordering && userId && (
        <OrderSheet
          onClose={() => setOrdering(false)}
          onSubmit={async (tapes) => {
            try {
              await saveTapeSet(userId, gymId, tapes);
              setOrdering(false);
              load();
            } catch (e) {
              Alert.alert('저장하지 못했어요', String(e));
            }
          }}
        />
      )}
    </View>
  );
}

export function VoteSheet({ tape, mine, onClose, onSubmit, onRemove, skipLabel, onSkip, confirmLabel }: {
  tape: TapeSummary;
  mine: { vMin: number; vMax: number } | null;
  onClose: () => void;
  onSubmit: (min: number, max: number) => void;
  onRemove: () => void;
  skipLabel?: string;
  onSkip?: () => void;
  confirmLabel?: string;
}) {
  const [picked, setPicked] = useState<{ min: number; max: number } | null>(mine ? { min: mine.vMin, max: mine.vMax } : null);
  const pick = (v: number) => {
    if (!picked || picked.min !== picked.max || v < picked.min || v > picked.min + 1) setPicked({ min: v, max: v });
    else setPicked({ min: picked.min, max: v });
  };
  return (
    <Sheet title={`${tape.label} 난이도는 몇 V?`} onClose={onClose}>
      <View style={styles.voteHead}>
        <Swatch color={tape.color} size={36} />
        <Text style={styles.voteCurrent}>지금 표시: {formatRange(tape.vMin, tape.vMax)} · 투표 {tape.votes}</Text>
      </View>
      <View style={styles.grid}>
        {V_OPTIONS.map((v) => {
          const on = picked !== null && v >= picked.min && v <= picked.max;
          return (
            <Pressable key={v} style={[styles.cell, on && styles.cellOn]} onPress={() => pick(v)}>
              <Text style={[styles.cellText, on && styles.cellTextOn]}>{formatV(v)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>바로 위 등급을 한 번 더 누르면 두 단계 범위로 돼요</Text>
      <Pressable style={[styles.primary, picked === null && styles.disabled]} disabled={picked === null} onPress={() => picked !== null && onSubmit(picked.min, picked.max)}>
        <Text style={styles.primaryText}>{picked === null ? '등급을 골라 주세요' : `${formatRange(picked.min, picked.max)} · ${confirmLabel ?? '투표하기'}`}</Text>
      </Pressable>
      {mine && (
        <Pressable onPress={onRemove} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>내 투표 취소</Text>
        </Pressable>
      )}
      {skipLabel && (
        <Pressable onPress={onSkip ?? onClose} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>{skipLabel}</Text>
        </Pressable>
      )}
    </Sheet>
  );
}

function ReportSheet({ tapes, onClose, onSubmit }: { tapes: Tape[]; onClose: () => void; onSubmit: (kind: 'order' | 'v', label: string | null, note: string) => void }) {
  const [kind, setKind] = useState<'order' | 'v'>('order');
  const [label, setLabel] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return (
    <Sheet title="표가 틀렸나요?" onClose={onClose}>
      <View style={styles.segment}>
        {([['order', '난이도 순서가 달라요'], ['v', 'V등급이 달라요']] as const).map(([k, text]) => (
          <Pressable key={k} style={[styles.segmentItem, kind === k && styles.segmentOn]} onPress={() => setKind(k)}>
            <Text style={[styles.segmentText, kind === k && styles.segmentTextOn]}>{text}</Text>
          </Pressable>
        ))}
      </View>
      {tapes.length > 0 && (
        <>
          <Text style={styles.label}>어느 난이도인가요? (선택)</Text>
          <View style={styles.palette}>
            {tapes.map((t) => (
              <Pressable key={t.label} style={[styles.paletteItem, label === t.label && styles.paletteOn]} onPress={() => setLabel(label === t.label ? null : t.label)}>
                <Swatch color={t.color} size={20} />
                <Text style={styles.paletteText}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <Text style={styles.label}>어떻게 다른가요?</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="예: 파랑이 초록보다 쉬워요 / 빨강은 V4~5예요"
        multiline
      />
      <Pressable style={[styles.primary, !note.trim() && styles.disabled]} disabled={!note.trim()} onPress={() => onSubmit(kind, label, note.trim())}>
        <Text style={styles.primaryText}>신고 보내기</Text>
      </Pressable>
    </Sheet>
  );
}

function Layer({ color, label, step, onPress }: { color: string; label: string; step: number; onPress: () => void }) {
  const drop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(drop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, []);
  const light = isDark(color);
  return (
    <Animated.View
      style={[
        styles.layerWrap,
        { opacity: drop, transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }] },
      ]}
    >
      <Pressable onPress={onPress} style={[styles.layer, { backgroundColor: color }]}>
        <Text style={[styles.layerStep, light && styles.barLabelLight]}>{step}</Text>
        <Text style={[styles.layerLabel, light && styles.barLabelLight]}>{label}</Text>
        <Ionicons name="close" size={16} color={light ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.35)'} />
      </Pressable>
    </Animated.View>
  );
}

export function OrderSheet({ onClose, onSubmit, skipLabel, onSkip }: { onClose: () => void; onSubmit: (tapes: Tape[]) => void; skipLabel?: string; onSkip?: () => void }) {
  const [picked, setPicked] = useState<{ label: string; color: string }[]>([]);
  const add = (p: { label: string; color: string }) => {
    setPicked((cur) => (cur.some((x) => x.label === p.label) ? cur : [...cur, p]));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const remove = (label: string) => setPicked((cur) => cur.filter((x) => x.label !== label));
  const left = PALETTE.filter((p) => !picked.some((x) => x.label === p.label));
  return (
    <Sheet title="난이도 순서 알려 주세요" onClose={onClose}>
      <Text style={styles.hint}>이 암장에 있는 난이도만 쌓아 주세요</Text>
      <View style={styles.towerBox}>
        <Text style={styles.towerTop}>▲ 어려움</Text>
        <ScrollView style={styles.tower} contentContainerStyle={styles.towerContent}>
          {picked.length === 0 ? (
            <View style={styles.slot}>
              <Text style={styles.slotText}>가장 쉬운 난이도부터 눌러서 쌓아 주세요</Text>
            </View>
          ) : (
            [...picked].reverse().map((p, k) => <Layer key={p.label} color={p.color} label={p.label} step={picked.length - k} onPress={() => remove(p.label)} />)
          )}
        </ScrollView>
        <View style={styles.ground}>
          <Text style={styles.groundText}>쉬움</Text>
        </View>
      </View>
      <View style={styles.paletteGrid}>
        {left.map((p) => (
          <Pressable key={p.label} style={styles.paletteCell} onPress={() => add(p)}>
            <View style={[styles.paletteDot, { backgroundColor: p.color }]} />
            <Text style={styles.paletteText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        style={[styles.primary, picked.length < 2 && styles.disabled]}
        disabled={picked.length < 2}
        onPress={() => onSubmit(picked.map((p) => ({ label: p.label, color: p.color, v: null, vMin: null, vMax: null })))}
      >
        <Text style={styles.primaryText}>{picked.length < 2 ? '2단계 이상 쌓아 주세요' : `${picked.length}단계로 저장`}</Text>
      </Pressable>
      {skipLabel && (
        <Pressable onPress={onSkip ?? onClose} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>{skipLabel}</Text>
        </Pressable>
      )}
    </Sheet>
  );
}

function isDark(color: string | null) {
  if (!color || color.length < 7) return false;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  source: { fontSize: 12, color: '#999' },
  empty: { color: '#999', fontSize: 13 },
  emptyBox: { gap: 8, alignItems: 'flex-start' },
  boardWrap: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  rail: { width: 10, alignItems: 'center', gap: 4 },
  railArrow: { fontSize: 10, color: '#111', lineHeight: 12, marginBottom: -2 },
  railStep: { flex: 1, width: 4, borderRadius: 2, backgroundColor: '#111' },
  board: { flex: 1, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 6, borderWidth: 2, borderColor: 'transparent', paddingRight: 6 },
  rowVoted: { borderColor: RED },
  bar: { width: 120, height: 26, borderRadius: 3, justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  barLabel: { fontSize: 12, fontWeight: '600', color: '#111' },
  barLabelLight: { color: '#fff' },
  rowV: { fontSize: 14, fontWeight: '700', minWidth: 56 },
  rowVotes: { fontSize: 12, color: '#999' },
  hint: { fontSize: 12, color: '#999' },
  report: { fontSize: 13, color: '#0a58ca', paddingVertical: 6 },
  secondary: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#111' },
  secondaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sheet: { flex: 1, padding: 20, gap: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  voteHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  voteCurrent: { fontSize: 14, color: '#333' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: 64, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f4f4f6', alignItems: 'center' },
  cellOn: { backgroundColor: RED },
  cellText: { fontSize: 15, fontWeight: '600', color: '#111' },
  cellTextOn: { color: '#fff' },
  primary: { paddingVertical: 14, borderRadius: 12, backgroundColor: RED, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  textButton: { alignItems: 'center', paddingVertical: 10 },
  textButtonLabel: { color: '#666', fontSize: 14 },
  segment: { flexDirection: 'row', gap: 8 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f4f4f6', alignItems: 'center' },
  segmentOn: { backgroundColor: '#111' },
  segmentText: { fontSize: 14, color: '#111' },
  segmentTextOn: { color: '#fff', fontWeight: '600' },
  label: { fontSize: 13, color: '#666', marginTop: 4 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  towerBox: { flex: 1, backgroundColor: '#f6f6f8', borderRadius: 16, paddingTop: 10, overflow: 'hidden' },
  towerTop: { fontSize: 12, fontWeight: '700', color: '#999', textAlign: 'center' },
  tower: { flex: 1 },
  towerContent: { flexGrow: 1, justifyContent: 'flex-end', gap: 4, paddingHorizontal: 16, paddingVertical: 8 },
  layerWrap: { alignSelf: 'stretch' },
  layer: { height: 40, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  layerStep: { fontSize: 13, fontWeight: '800', color: '#111', width: 18 },
  layerLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111' },
  slot: { width: '100%', height: 40, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  slotText: { fontSize: 13, color: '#999' },
  ground: { height: 26, backgroundColor: '#e3e4e8', alignItems: 'center', justifyContent: 'center' },
  groundText: { fontSize: 12, fontWeight: '700', color: '#888' },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, paddingVertical: 4 },
  paletteCell: { width: '20%', alignItems: 'center', gap: 4 },
  paletteDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  paletteItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#f4f4f6', borderWidth: 2, borderColor: 'transparent' },
  paletteOn: { borderColor: RED },
  paletteText: { fontSize: 13 },
  input: { minHeight: 80, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, fontSize: 15, textAlignVertical: 'top' },
});
