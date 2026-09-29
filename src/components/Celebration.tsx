import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { type Gym, formatNo } from '../data/gyms';
import { RED, Silhouette, formatDate } from './dex';

type Props = { gym: Gym; photo?: string; count: number; onDone: () => void };

export default function Celebration({ gym, photo, count, onDone }: Props) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 64, 320);
  const fade = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(400),
      Animated.parallel([
        Animated.spring(flip, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
        Animated.timing(rise, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const front = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const back = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  return (
    <Pressable style={styles.overlay} onPress={onDone}>
      <Animated.View style={[styles.body, { opacity: fade }]}>
        <Text style={styles.no}>{formatNo(gym.no)}</Text>
        <View style={{ width: size, height: size }}>
          <Animated.View style={[styles.face, styles.front, { transform: [{ perspective: 1000 }, { rotateY: front }] }]}>
            <Silhouette size={size * 0.8} visited={false} seed={gym.id} region={gym.region1} />
          </Animated.View>
          <Animated.View style={[styles.face, styles.back, { transform: [{ perspective: 1000 }, { rotateY: back }] }]}>
            {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <Silhouette size={size * 0.8} visited seed={gym.id} region={gym.region1} />}
          </Animated.View>
        </View>
        <Animated.View style={[styles.caption, { transform: [{ translateY: rise }] }]}>
          <Text style={styles.name}>{gym.name}</Text>
          <Text style={styles.meta}>
            {count === 1 ? '도감에 등록!' : `${count}번째 방문`} · {formatDate(new Date())}
          </Text>
          <Text style={styles.hint}>눌러서 닫기</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center' },
  body: { alignItems: 'center', gap: 16 },
  no: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  face: { ...StyleSheet.absoluteFillObject, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden', overflow: 'hidden' },
  front: { backgroundColor: '#eceef2' },
  back: { backgroundColor: '#fff3d6', borderWidth: 4, borderColor: RED },
  photo: { width: '100%', height: '100%' },
  caption: { alignItems: 'center', gap: 4 },
  name: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  meta: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 12 },
});
