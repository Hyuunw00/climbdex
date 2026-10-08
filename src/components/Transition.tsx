import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

type Props = { children: ReactNode; slide?: boolean };

export default function Transition({ children, slide = true }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(slide ? 28 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(shift, { toValue: 0, friction: 9, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [opacity, shift]);

  return <Animated.View style={[styles.fill, { opacity, transform: [{ translateX: shift }] }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
