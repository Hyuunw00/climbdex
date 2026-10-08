import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PickedVideo } from '../types';
import { type DetectProgress, formatRemaining } from '../detectProgress';
import { ClimbVideo } from '../../modules/climb-video';
import type { Settings } from '../settings';
import { askSettings } from '../permissions';

type Props = {
  videos: PickedVideo[];
  progress: DetectProgress | null;
  settings: Settings;
  onOpenSettings: () => void;
  onAdd: (videos: PickedVideo[]) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onOpen: (index: number) => void;
  here: { gymName: string; count: number } | null;
  onHere: () => void;
  onHereDismiss: () => void;
};

let savedOffset = 0;

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

export default function VideoListScreen({ videos, progress, settings, onOpenSettings, onAdd, onRemove, onClear, onOpen, here, onHere, onHereDismiss }: Props) {
  const listRef = useRef<FlatList<PickedVideo>>(null);
  const restored = useRef(false);
  const [loading, setLoading] = useState(false);

  const pick = async () => {
    if (Platform.OS === 'ios') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        askSettings('사진 접근이 필요해요', '영상을 고르려면 설정에서 사진 접근을 허용해 주세요. 영상은 폰 밖으로 나가지 않아요');
        return false;
      }
      if (permission.accessPrivileges === 'limited') {
        askSettings('모든 사진 접근이 필요해요', '지금은 선택한 사진만 허용돼 있어서 고른 영상을 읽을 수 없어요. 설정에서 사진 접근을 "모든 사진"으로 바꿔 주세요. 영상은 폰 밖으로 나가지 않아요');
        return false;
      }
    }
    if (ClimbVideo.pickVideos) {
      try {
        const assets = await ClimbVideo.pickVideos();
        if (assets.length === 0) return false;
        onAdd(assets.map((a) => ({ ...a, fileName: a.fileName ?? null })));
        return true;
      } catch (e) {
        Alert.alert('영상을 고르지 못했어요', String((e as Error)?.message ?? e));
        return false;
      }
    }
    setLoading(true);
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: true,
        selectionLimit: 0,
      });
    } catch (e) {
      Alert.alert('영상을 불러오지 못했어요', `iPhone 저장 공간이 충분한지 확인해 주세요.\n${String((e as Error)?.message ?? e)}`);
      return false;
    } finally {
      setLoading(false);
    }
    if (result.canceled) return false;
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
    return true;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>내 영상</Text>
          {progress && (
            <Text style={styles.progress}>
              {progress.done}/{progress.total} 찾는 중 · {formatRemaining(progress.remainingSec)} · {progress.background ? '앱을 나가도 계속돼요' : '화면을 켜 두세요'}
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
      {here && (
        <Pressable style={styles.today} onPress={onHere}>
          <View style={styles.todayBody}>
            <Text style={styles.todayTitle} numberOfLines={1}>
              {here.count > 1 ? `${here.gymName} 외 ${here.count - 1}곳 근처예요` : `${here.gymName}에 있네요`}
            </Text>
            <Text style={styles.todayAction}>도감에 등록하고 사진 찍기 →</Text>
          </View>
          <Pressable hitSlop={10} onPress={onHereDismiss}>
            <Ionicons name="close" size={18} color="#888" />
          </Pressable>
        </Pressable>
      )}
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={videos}
        onScroll={(e) => { savedOffset = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (restored.current || savedOffset <= 0) return;
          restored.current = true;
          listRef.current?.scrollToOffset({ offset: savedOffset, animated: false });
        }}
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
      <Pressable style={[styles.addButton, loading && styles.addButtonBusy]} onPress={pick} disabled={loading}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.addButtonText}>영상 불러오는 중…</Text>
          </View>
        ) : (
          <Text style={styles.addButtonText}>영상 고르기</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8, paddingBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontSize: 20, fontWeight: '700' },
  progress: { fontSize: 12, color: '#666', marginTop: 2 },
  list: { flex: 1 },
  today: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 4, padding: 14, borderRadius: 12, backgroundColor: '#f2f2f2' },
  todayBody: { flex: 1, gap: 4 },
  todayTitle: { fontSize: 15, fontWeight: '600' },
  todayAction: { fontSize: 13, color: '#d7263d', fontWeight: '600' },
  listContent: { paddingHorizontal: 16 },
  addButton: {
    backgroundColor: '#111',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginHorizontal: 16,
  },
  addButtonBusy: { opacity: 0.7 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
