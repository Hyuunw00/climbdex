import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { showInfo } from './Toast';

type Props = { text: string; size?: number; color?: string };

export default function InfoTip({ text, size = 16, color = colors.textMuted }: Props) {
  return (
    <Pressable onPress={() => showInfo(text)} hitSlop={10} style={styles.tip}>
      <Ionicons name="help-circle-outline" size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tip: { alignItems: 'center', justifyContent: 'center' },
});
