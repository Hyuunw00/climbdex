import Slider from '@react-native-community/slider';
import * as MediaLibrary from 'expo-media-library';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ClimbVideo } from '../../modules/climb-video';
import type { PickedVideo } from '../types';

type Props = {
  video: PickedVideo;
  onBack: () => void;
};

function formatSeconds(seconds: number) {
  return seconds.toFixed(1) + 's';
}

export default function TrimScreen({ video, onBack }: Props) {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(video.duration);
  const [saving, setSaving] = useState(false);

  const player = useVideoPlayer(video.uri, (p) => {
    p.timeUpdateEventInterval = 0.1;
  });

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime >= end) player.pause();
    });
    return () => sub.remove();
  }, [player, end]);

  const seek = (time: number) => {
    player.pause();
    player.currentTime = time;
  };

  const playRange = () => {
    player.currentTime = start;
    player.play();
  };

  const save = async () => {
    if (end - start < 0.5) {
      Alert.alert('구간이 너무 짧아요');
      return;
    }
    setSaving(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert('사진 앱 저장 권한이 필요해요');
        return;
      }
      const outUri = await ClimbVideo.trim(video.uri, start, end);
      await MediaLibrary.saveToLibraryAsync(outUri);
      Alert.alert('저장했어요', `${formatSeconds(start)} – ${formatSeconds(end)}`);
    } catch (e) {
      Alert.alert('저장 실패', String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← 목록</Text>
      </Pressable>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
      <View style={styles.controls}>
        <Text style={styles.label}>시작 {formatSeconds(start)}</Text>
        <Slider
          minimumValue={0}
          maximumValue={video.duration}
          value={start}
          onValueChange={(v) => {
            const next = Math.min(v, end - 0.5);
            setStart(next);
            seek(next);
          }}
        />
        <Text style={styles.label}>끝 {formatSeconds(end)}</Text>
        <Slider
          minimumValue={0}
          maximumValue={video.duration}
          value={end}
          onValueChange={(v) => {
            const next = Math.max(v, start + 0.5);
            setEnd(next);
            seek(next);
          }}
        />
        <View style={styles.buttons}>
          <Pressable style={styles.secondary} onPress={playRange}>
            <Text style={styles.secondaryText}>구간 재생</Text>
          </Pressable>
          <Pressable style={[styles.primary, saving && styles.disabled]} onPress={save} disabled={saving}>
            <Text style={styles.primaryText}>{saving ? '저장 중' : '클립 저장'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  back: { fontSize: 16, paddingVertical: 8 },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 420, backgroundColor: '#000', borderRadius: 8 },
  controls: { gap: 4 },
  label: { fontSize: 14, color: '#333' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  secondary: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#111', alignItems: 'center' },
  secondaryText: { fontSize: 16 },
  primary: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#111', alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
