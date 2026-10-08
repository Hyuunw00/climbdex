import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme';

type Variant = 'primary' | 'secondary' | 'text';
type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
};

export default function Button({ label, onPress, variant = 'primary', disabled, loading, icon, small, style, hitSlop }: Props) {
  const off = disabled || loading;
  const textColor = variant === 'primary' ? '#fff' : variant === 'secondary' ? colors.text : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      hitSlop={hitSlop ?? (variant === 'text' ? 6 : undefined)}
      style={({ pressed }) => [styles.base, styles[variant], small && (variant === 'text' ? styles.textSmall : styles.small), off && styles.off, pressed && styles.pressed, style]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 16 : 20} color={textColor} />}
          <Text style={[styles.label, { color: textColor }, variant === 'text' && styles.textLabel, small && styles.labelSmall]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16, paddingHorizontal: 16 },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface },
  text: { height: 44, backgroundColor: 'transparent', paddingHorizontal: 8 },
  small: { height: 40, borderRadius: 12, paddingHorizontal: 12 },
  textSmall: { height: 32, paddingHorizontal: 4 },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  label: { fontSize: 16, fontWeight: '600' },
  textLabel: { fontSize: 15 },
  labelSmall: { fontSize: 14 },
});
