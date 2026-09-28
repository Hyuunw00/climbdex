import * as ImagePicker from 'expo-image-picker';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PickedVideo } from '../types';

type Props = {
  videos: PickedVideo[];
  onAdd: (videos: PickedVideo[]) => void;
  onOpen: (index: number) => void;
};

function formatSeconds(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoListScreen({ videos, onAdd, onOpen }: Props) {
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
        duration: (a.duration ?? 0) / 1000,
        width: a.width,
        height: a.height,
        fileName: a.fileName ?? null,
      })),
    );
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.addButton} onPress={pick}>
        <Text style={styles.addButtonText}>영상 고르기</Text>
      </Pressable>
      <FlatList
        data={videos}
        keyExtractor={(item, index) => `${item.uri}-${index}`}
        ListEmptyComponent={<Text style={styles.empty}>고른 영상이 없어요</Text>}
        renderItem={({ item, index }) => (
          <Pressable style={styles.row} onPress={() => onOpen(index)}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.fileName ?? `영상 ${index + 1}`}
            </Text>
            <Text style={styles.rowMeta}>{formatSeconds(item.duration)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  addButton: {
    backgroundColor: '#111',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  rowTitle: { flex: 1, fontSize: 15 },
  rowMeta: { color: '#666', marginLeft: 12 },
});
