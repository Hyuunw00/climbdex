import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Progress, RED } from './dex';
import { BackButton } from './ScreenHeader';

type Stat = { value: string | number; label: string };

type Props = {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  stats?: Stat[];
  counter?: { value: number; total: number };
  progress?: { value: number; total: number };
  subtitle?: string;
  children?: ReactNode;
  account?: { name: string; email: string } | null;
  onAccount?: () => void;
  onOpenSettings?: () => void;
};

export default function DexHeader({ title, onBack, right, stats, counter, progress, subtitle, children, account, onAccount, onOpenSettings }: Props) {
  const tools =
    onAccount || onOpenSettings ? (
      <View style={styles.tools}>
        {onAccount &&
          (account ? (
            <Pressable style={styles.chip} onPress={onAccount} hitSlop={6}>
              <View style={styles.avatar}>
                <Text style={styles.initial}>{(account.name || account.email || '?').slice(0, 1).toUpperCase()}</Text>
              </View>
              <Text style={styles.chipName} numberOfLines={1}>
                {account.name || account.email.split('@')[0]}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#999" />
            </Pressable>
          ) : (
            <Pressable onPress={onAccount} hitSlop={10}>
              <Text style={styles.login}>로그인</Text>
            </Pressable>
          ))}
        {onOpenSettings && (
          <Pressable onPress={onOpenSettings} hitSlop={8}>
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </Pressable>
        )}
      </View>
    ) : null;
  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>CLIMBDEX · 대한민국</Text>
        {right ?? tools}
      </View>
      <View style={styles.titleRow}>
        <View style={[styles.titleWrap, onBack && styles.titleWrapBack]}>
          {onBack && <BackButton onPress={onBack} color="#fff" />}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {counter && (
          <View style={styles.counter}>
            <Text style={styles.counterBig}>{counter.value}</Text>
            <Text style={styles.counterSmall}>/ {counter.total}</Text>
          </View>
        )}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {stats && (
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      {progress && <Progress value={progress.value} total={progress.total} color="#fff" track="rgba(255,255,255,0.25)" />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: RED, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 10, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  eyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  titleWrapBack: { marginLeft: -14 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', flexShrink: 1 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', marginTop: -6 },
  counter: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  counterBig: { color: '#fff', fontSize: 28, fontWeight: '800' },
  counterSmall: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 2 },
  stat: { flex: 1, gap: 2 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 8, height: 32, borderRadius: 16, backgroundColor: '#fff', maxWidth: 170 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontSize: 12, fontWeight: '800' },
  chipName: { color: '#111', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  login: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
