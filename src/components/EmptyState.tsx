import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Silhouette } from './dex';
import { colors } from '../theme';

type Props = {
  title: string;
  lines?: string[];
  small?: boolean;
  seed?: string;
  children?: ReactNode;
};

export default function EmptyState({ title, lines = [], small, seed = 'empty', children }: Props) {
  return (
    <View style={[styles.box, small && styles.boxSmall]}>
      <Silhouette size={small ? 56 : 96} visited={false} seed={seed} region="" />
      <Text style={[styles.title, small && styles.titleSmall]}>{title}</Text>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingTop: 48, paddingBottom: 24, paddingHorizontal: 24, gap: 6 },
  boxSmall: { paddingTop: 20, paddingBottom: 12, gap: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: 10 },
  titleSmall: { fontSize: 15, marginTop: 6 },
  line: { fontSize: 14, color: colors.textSub, textAlign: 'center', lineHeight: 20 },
});
