import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

function Swatch({ color, size = 28 }: { color: string | null; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? '#ddd', borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' }} />;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
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
    if (!checkedIn) return Alert.alert('도감에 등록한 암장만 할 수 있어요', '암장에서 도감에 등록한 뒤 참여해 주세요');
    action();
  };

  const summary = data ? summarize(data, userId) : [];
  const voteTotal = data ? data.votes.length : 0;

  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>띠 난이도</Text>
        {data?.set && (
          <Text style={styles.source}>
            {voteTotal > 0 ? `추정 · 투표 ${voteTotal}` : '추정'}
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
          <Text style={styles.empty}>아직 띠 순서가 없어요</Text>
          <Pressable style={styles.secondary} onPress={() => requireMember(() => setOrdering(true))}>
            <Text style={styles.secondaryText}>띠 순서 알려 주세요</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {summary.map((t) => (
              <Pressable key={t.label} style={[styles.chip, t.voted && styles.chipVoted]} onPress={() => requireMember(() => setVoting(t))}>
                <Swatch color={t.color} />
                <Text style={styles.chipLabel}>{t.label}</Text>
                <Text style={styles.chipV}>{formatRange(t.vMin, t.vMax)}</Text>
                {t.votes > 0 && <Text style={styles.chipVotes}>투표 {t.votes}</Text>}
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.hint}>띠를 누르면 투표할 수 있어요</Text>
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
  const chosen = confirmLabel ? picked : mine ? { min: mine.vMin, max: mine.vMax } : null;
  const pick = (v: number) => {
    if (!picked || picked.min !== picked.max || v < picked.min) setPicked({ min: v, max: v });
    else setPicked({ min: picked.min, max: v });
  };
  return (
    <Sheet title={`${tape.label} 띠는 몇 V?`} onClose={onClose}>
      <View style={styles.voteHead}>
        <Swatch color={tape.color} size={36} />
        <Text style={styles.voteCurrent}>지금 표시: {formatRange(tape.vMin, tape.vMax)} · 투표 {tape.votes}</Text>
      </View>
      <View style={styles.grid}>
        {V_OPTIONS.map((v) => {
          const on = chosen !== null && v >= chosen.min && v <= chosen.max;
          return (
            <Pressable key={v} style={[styles.cell, on && styles.cellOn]} onPress={() => (confirmLabel ? pick(v) : onSubmit(v, v))}>
              <Text style={[styles.cellText, on && styles.cellTextOn]}>{formatV(v)}</Text>
            </Pressable>
          );
        })}
      </View>
      {confirmLabel && <Text style={styles.hint}>더 높은 등급을 한 번 더 누르면 범위로 돼요</Text>}
      {confirmLabel && (
        <Pressable style={[styles.primary, picked === null && styles.disabled]} disabled={picked === null} onPress={() => picked !== null && onSubmit(picked.min, picked.max)}>
          <Text style={styles.primaryText}>{picked === null ? '등급을 골라 주세요' : `${formatRange(picked.min, picked.max)} · ${confirmLabel}`}</Text>
        </Pressable>
      )}
      {mine && !confirmLabel && (
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
        {([['order', '띠 순서·색이 달라요'], ['v', 'V등급이 달라요']] as const).map(([k, text]) => (
          <Pressable key={k} style={[styles.segmentItem, kind === k && styles.segmentOn]} onPress={() => setKind(k)}>
            <Text style={[styles.segmentText, kind === k && styles.segmentTextOn]}>{text}</Text>
          </Pressable>
        ))}
      </View>
      {tapes.length > 0 && (
        <>
          <Text style={styles.label}>어느 띠인가요? (선택)</Text>
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

export function OrderSheet({ onClose, onSubmit, skipLabel, onSkip }: { onClose: () => void; onSubmit: (tapes: Tape[]) => void; skipLabel?: string; onSkip?: () => void }) {
  const [picked, setPicked] = useState<{ label: string; color: string }[]>([]);
  const toggle = (p: { label: string; color: string }) =>
    setPicked(picked.some((x) => x.label === p.label) ? picked.filter((x) => x.label !== p.label) : [...picked, p]);
  return (
    <Sheet title="띠 순서 알려 주세요" onClose={onClose}>
      <Text style={styles.hint}>가장 쉬운 띠부터 차례로 눌러 주세요. 다시 누르면 빠져요</Text>
      <View style={styles.palette}>
        {PALETTE.map((p) => {
          const order = picked.findIndex((x) => x.label === p.label);
          return (
            <Pressable key={p.label} style={[styles.paletteItem, order >= 0 && styles.paletteOn]} onPress={() => toggle(p)}>
              <Swatch color={p.color} size={20} />
              <Text style={styles.paletteText}>{p.label}</Text>
              {order >= 0 && <Text style={styles.paletteOrder}>{order + 1}</Text>}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.label}>쉬운 순서 →</Text>
      <View style={styles.orderRow}>
        {picked.length === 0 ? <Text style={styles.empty}>아직 고른 띠가 없어요</Text> : picked.map((p) => <Swatch key={p.label} color={p.color} size={24} />)}
      </View>
      <Pressable
        style={[styles.primary, picked.length < 2 && styles.disabled]}
        disabled={picked.length < 2}
        onPress={() => onSubmit(picked.map((p) => ({ label: p.label, color: p.color, v: null, vMin: null, vMax: null })))}
      >
        <Text style={styles.primaryText}>{picked.length}개 띠로 저장</Text>
      </Pressable>
      {skipLabel && (
        <Pressable onPress={onSkip ?? onClose} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>{skipLabel}</Text>
        </Pressable>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  source: { fontSize: 12, color: '#999' },
  empty: { color: '#999', fontSize: 13 },
  emptyBox: { gap: 8, alignItems: 'flex-start' },
  chips: { gap: 10, paddingVertical: 8 },
  chip: { alignItems: 'center', gap: 3, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#f4f4f6', minWidth: 64, borderWidth: 2, borderColor: 'transparent' },
  chipVoted: { borderColor: RED },
  chipLabel: { fontSize: 12, color: '#333' },
  chipV: { fontSize: 14, fontWeight: '700' },
  chipVotes: { fontSize: 10, color: '#999' },
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
  paletteItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#f4f4f6', borderWidth: 2, borderColor: 'transparent' },
  paletteOn: { borderColor: RED },
  paletteText: { fontSize: 13 },
  paletteOrder: { fontSize: 12, fontWeight: '700', color: RED },
  input: { minHeight: 80, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 10, fontSize: 15, textAlignVertical: 'top' },
  orderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 36, alignItems: 'center' },
});
