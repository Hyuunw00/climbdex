import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Gym } from '../data/gyms';
import { type GymReportKind, sendGymReport } from '../store/reports';
import { colors } from '../theme';
import Button from './Button';
import Sheet from './Sheet';
import { showToast } from './Toast';

type Props = { gym: Gym | null; initialName?: string; userId: string; onClose: () => void };

const KINDS: { kind: GymReportKind; label: string }[] = [
  { kind: 'closed', label: '폐업했어요' },
  { kind: 'moved', label: '이전했어요' },
  { kind: 'wrong', label: '정보가 달라요' },
];

export default function GymReportSheet({ gym, initialName = '', userId, onClose }: Props) {
  const [kind, setKind] = useState<GymReportKind>(gym ? 'wrong' : 'missing');
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = gym ? note.trim().length > 0 || kind !== 'wrong' : name.trim().length > 0;

  const submit = async () => {
    setBusy(true);
    try {
      await sendGymReport(userId, kind, gym?.id ?? null, gym ? gym.name : name.trim(), note.trim());
      onClose();
      showToast('알려줘서 고마워요 · 확인한 뒤 반영할게요');
    } catch (e) {
      Alert.alert('보내지 못했어요', String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={gym ? '뭔가 다른가요?' : '없는 암장 알려주기'} onClose={onClose}>
      {gym ? (
        <>
          <Text style={styles.gymName}>{gym.name}</Text>
          <View style={styles.segment}>
            {KINDS.map((k) => (
              <Pressable key={k.kind} style={[styles.segmentItem, kind === k.kind && styles.segmentOn]} onPress={() => setKind(k.kind)}>
                <Text style={[styles.segmentText, kind === k.kind && styles.segmentTextOn]}>{k.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>암장 이름</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="예: 더클라임 양재" autoFocus />
        </>
      )}
      <Text style={styles.label}>{gym ? '어떻게 다른가요? (선택)' : '위치나 참고할 것 (선택)'}</Text>
      <TextInput
        style={[styles.input, styles.note]}
        value={note}
        onChangeText={setNote}
        placeholder={gym ? '예: 올해 3월에 문 닫았어요 / 주소가 바뀌었어요' : '예: 양재역 근처, 지난달 오픈'}
        multiline
      />
      <Button label="보내기" onPress={submit} disabled={!ready} loading={busy} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  gymName: { fontSize: 16, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, color: colors.textSub, marginTop: 4 },
  input: { borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  note: { minHeight: 90, textAlignVertical: 'top' },
  segment: { flexDirection: 'row', gap: 8 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center' },
  segmentOn: { backgroundColor: colors.accent },
  segmentText: { fontSize: 14, color: colors.text },
  segmentTextOn: { color: '#fff', fontWeight: '600' },
});
