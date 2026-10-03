import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PickedVideo } from '../types';
import { type DetectProgress, formatRemaining } from '../detectProgress';
import type { Settings } from '../settings';

type Props = {
  videos: PickedVideo[];
  progress: DetectProgress | null;
  settings: Settings;
  onOpenSettings: () => void;
  onAdd: (videos: PickedVideo[]) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onOpen: (index: number) => void;
};

function formatSeconds(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function statusOf(video: PickedVideo, settings: Settings) {
  if (video.segments === undefined) return '시도 구간 찾는 중';
  const count = video.clips?.length ?? video.segments.length + (settings.includeLow ? (video.candidates?.length ?? 0) : 0);
  const parts = [count === 0 ? '구간 못 찾음' : `구간 ${count}개`];
  if (video.handheld) parts.push('들고 찍음');
  if (video.saved) parts.push(`저장 ${video.saved}개`);
  return parts.join(' · ');
}

export default function VideoListScreen({ videos, progress, settings, onOpenSettings, onAdd, onRemove, onClear, onOpen }: Props) {
  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: true,
      selectionLimit: 0,
    });
    if (result.canceled) return;
    onAdd(
      result.assets.map((a) => ({
        uri: a.uri,
        assetId: a.assetId ?? null,
        duration: (a.duration ?? 0) / 1000,
        width: a.width,
        height: a.height,
        fileName: a.fileName ?? null,
      })),
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>내 영상</Text>
          {progress && (
            <Text style={styles.progress}>
              {progress.done}/{progress.total} 찾는 중 · {formatRemaining(progress.remainingSec)} · 화면을 켜 두세요
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {videos.length > 0 && (
            <Pressable onPress={onClear} hitSlop={8}>
              <Text style={styles.clear}>전체 비우기</Text>
            </Pressable>
          )}
          <Pressable onPress={onOpenSettings} hitSlop={8}>
            <Ionicons name="settings-outline" size={22} color="#333" />
          </Pressable>
        </View>
      </View>
      <FlatList
        style={styles.list}
        data={videos}
        keyExtractor={(item, index) => `${item.uri}-${index}`}
        ListEmptyComponent={<Text style={styles.empty}>고른 영상이 없어요</Text>}
        renderItem={({ item, index }) => (
          <Pressable style={styles.row} onPress={() => onOpen(index)}>
            <View style={styles.thumb}>
              {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={styles.thumbImage} /> : null}
            </View>
            <View style={styles.body}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.fileName ?? `영상 ${index + 1}`}
              </Text>
              <View style={styles.statusRow}>
                {item.segments === undefined && <ActivityIndicator size="small" color="#666" />}
                <Text style={styles.rowMeta}>{statusOf(item, settings)}</Text>
              </View>
              <Text style={styles.rowMeta}>{formatSeconds(item.duration)}</Text>
            </View>
            <Pressable hitSlop={8} onPress={() => onRemove(index)}>
              <Text style={styles.remove}>삭제</Text>
            </Pressable>
          </Pressable>
        )}
      />
      <Pressable style={styles.addButton} onPress={pick}>
        <Text style={styles.addButtonText}>영상 고르기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontSize: 20, fontWeight: '700' },
  progress: { fontSize: 12, color: '#666', marginTop: 2 },
  list: { flex: 1 },
  addButton: {
    backgroundColor: '#111',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  thumb: { width: 54, height: 72, borderRadius: 6, backgroundColor: '#ddd', overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  body: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMeta: { color: '#666', fontSize: 13 },
  remove: { color: '#c00', fontSize: 14 },
  clear: { color: '#c00', fontSize: 14 },
});
