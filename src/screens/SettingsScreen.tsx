import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DEFAULT_SETTINGS, type Settings } from '../settings';

type Props = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
};

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepButton} onPress={() => onChange(Math.max(0, value - 1))} hitSlop={6}>
        <Ionicons name="remove" size={20} color="#111" />
      </Pressable>
      <Text style={styles.stepValue}>{value}초</Text>
      <Pressable style={styles.stepButton} onPress={() => onChange(Math.min(10, value + 1))} hitSlop={6}>
        <Ionicons name="add" size={20} color="#111" />
      </Pressable>
    </View>
  );
}

export default function SettingsScreen({ settings, onChange, onClose }: Props) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>자르기 설정</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color="#111" />
          </Pressable>
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>시작 여유</Text>
            <Text style={styles.hint}>시도 앞에 더 담을 시간</Text>
          </View>
          <Stepper value={settings.padBefore} onChange={(v) => onChange({ ...settings, padBefore: v })} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>끝 여유</Text>
            <Text style={styles.hint}>시도 뒤에 더 담을 시간</Text>
          </View>
          <Stepper value={settings.padAfter} onChange={(v) => onChange({ ...settings, padAfter: v })} />
        </View>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>점선 구간 포함</Text>
            <Text style={styles.hint}>확실하지 않은 구간도 함께 보기</Text>
          </View>
          <Switch value={settings.includeLow} onValueChange={(v) => onChange({ ...settings, includeLow: v })} trackColor={{ true: '#111' }} />
        </View>
        <Text style={styles.note}>아직 손대지 않은 영상엔 바로 적용돼요. 편집한 영상은 트림 화면의 "처음으로"를 누르면 새 값으로 바뀌어요</Text>
        <Pressable onPress={() => onChange(DEFAULT_SETTINGS)} hitSlop={8} style={styles.resetButton}>
          <Text style={styles.resetText}>기본값으로</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 18, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, color: '#888' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 16, fontWeight: '600', minWidth: 40, textAlign: 'center' },
  note: { fontSize: 12, color: '#888', lineHeight: 18 },
  resetButton: { alignSelf: 'center', marginTop: 8 },
  resetText: { fontSize: 14, color: '#0a58ca' },
});
