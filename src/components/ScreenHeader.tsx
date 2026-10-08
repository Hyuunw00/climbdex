import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type BackProps = { onPress: () => void; color?: string };

export function BackButton({ onPress, color = '#111' }: BackProps) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.back}>
      <Ionicons name="chevron-back" size={28} color={color} />
    </Pressable>
  );
}

type Props = { title?: string; onBack: () => void; right?: ReactNode };

export default function ScreenHeader({ title, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      <BackButton onPress={onBack} />
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 8, backgroundColor: '#fff' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  title: { flex: 1, fontSize: 17, fontWeight: '600', color: '#111' },
  spacer: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 44, justifyContent: 'flex-end' },
});
