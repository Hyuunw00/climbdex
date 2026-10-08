import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Kind = 'success' | 'info';
type Listener = (message: string, kind: Kind) => void;
const listeners = new Set<Listener>();

export function showToast(message: string) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  for (const l of listeners) l(message, 'success');
}

export function showInfo(message: string) {
  Haptics.selectionAsync().catch(() => {});
  for (const l of listeners) l(message, 'info');
}

export function ToastHost({ above = 12 }: { above?: number }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('success');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show: Listener = (m, k) => {
      setMessage(m);
      setKind(k);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMessage(null));
      }, k === 'info' ? 4500 : 2200);
    };
    listeners.add(show);
    return () => {
      listeners.delete(show);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [opacity]);

  if (!message) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + above, opacity }]}>
      <Ionicons name={kind === 'info' ? 'information-circle' : 'checkmark-circle'} size={18} color="#fff" />
      <Text style={styles.text} numberOfLines={3}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(17,17,17,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 19 },
});
