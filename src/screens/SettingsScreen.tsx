import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { colors } from '../theme';
import { APP_VERSION, DETECT_VERSION, PRIVACY_URL } from '../version';
import Button from '../components/Button';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
  account: { name: string; email: string } | null;
  onLogin: () => void;
  onAccount: () => void;
};

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepButton} onPress={() => onChange(Math.max(0, value - 1))} hitSlop={6}>
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      <Text style={styles.stepValue}>{value}초</Text>
      <Pressable style={styles.stepButton} onPress={() => onChange(Math.min(10, value + 1))} hitSlop={6}>
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
      {footer}
    </View>
  );
}

type RowProps = { icon?: IconName; label: string; hint?: string; value?: string; onPress?: () => void; right?: ReactNode; last?: boolean; danger?: boolean };

function Row({ icon, label, hint, value, onPress, right, last, danger }: RowProps) {
  const body = (
    <>
      {icon && <Ionicons name={icon} size={20} color={danger ? colors.accent : colors.textSub} style={styles.rowIcon} />}
      <View style={styles.rowText}>
        <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </>
  );
  const style = [styles.row, last && styles.rowLast];
  return onPress ? (
    <Pressable style={({ pressed }) => [style, pressed && styles.pressed]} onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

export default function SettingsScreen({ settings, onChange, onClose, account, onLogin, onAccount }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, Platform.OS === 'android' && { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>설정</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <Section
            title="자르기"
            footer={
              <View style={styles.sectionFooter}>
                <Text style={styles.footerNote}>아직 손대지 않은 영상에 적용돼요</Text>
                <Button variant="text" small label="기본값으로" onPress={() => onChange(DEFAULT_SETTINGS)} />
              </View>
            }
          >
            <Row label="시작 여유" hint="시도 앞에 더 담을 시간" right={<Stepper value={settings.padBefore} onChange={(v) => onChange({ ...settings, padBefore: v })} />} />
            <Row label="끝 여유" hint="시도 뒤에 더 담을 시간" right={<Stepper value={settings.padAfter} onChange={(v) => onChange({ ...settings, padAfter: v })} />} />
            <Row
              label="점선 시도 포함"
              hint="확실하지 않은 시도도 함께 보기"
              right={<Switch value={settings.includeLow} onValueChange={(v) => onChange({ ...settings, includeLow: v })} trackColor={{ true: colors.accent }} />}
              last
            />
          </Section>

          <Section title="계정">
            {account ? (
              <Row icon="person-circle-outline" label={account.name || account.email} hint={account.name ? account.email : undefined} onPress={onAccount} last />
            ) : (
              <Row icon="person-circle-outline" label="로그인" hint="방문 등록과 등반 기록이 계정에 남아요" onPress={onLogin} last />
            )}
          </Section>

          <Section title="앱 정보">
            <Row icon="shield-checkmark-outline" label="영상은 폰 안에서만 처리돼요" hint="서버에는 완등 기록과 영상 요약만 남아요" />
            {PRIVACY_URL ? <Row icon="document-text-outline" label="개인정보 처리방침" onPress={() => Linking.openURL(PRIVACY_URL)} /> : null}
            <Row icon="information-circle-outline" label="버전" hint={`자르기 엔진 ${DETECT_VERSION}`} value={APP_VERSION} last />
          </Section>

        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  close: { position: 'absolute', right: 12, top: 8, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 28, paddingTop: 8 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textSub, paddingHorizontal: 4 },
  sectionFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  footerNote: { fontSize: 12, color: colors.textMuted },
  group: { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { width: 24, textAlign: 'center' },
  pressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  labelDanger: { color: colors.accent },
  value: { fontSize: 14, color: colors.textSub },
  hint: { fontSize: 12, color: colors.textSub, lineHeight: 17 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 15, fontWeight: '600', minWidth: 40, textAlign: 'center', color: colors.text },
});
