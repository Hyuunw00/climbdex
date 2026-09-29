import { File, Paths } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Platform, SafeAreaView, StatusBar as NativeStatusBar, StyleSheet } from 'react-native';
import { ClimbVideo } from './modules/climb-video';
import TrimScreen from './src/screens/TrimScreen';
import VideoListScreen from './src/screens/VideoListScreen';
import type { PickedVideo } from './src/types';

const store = new File(Paths.document, 'videos.json');

function load(): PickedVideo[] {
  try {
    if (!store.exists) return [];
    const saved: PickedVideo[] = JSON.parse(store.textSync());
    return saved.filter((v) => new File(v.uri).exists);
  } catch {
    return [];
  }
}

export default function App() {
  const [videos, setVideos] = useState<PickedVideo[]>(load);
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    store.write(JSON.stringify(videos));
  }, [videos]);

  const patch = (uri: string, changes: Partial<PickedVideo>) => {
    setVideos((prev) => prev.map((v) => (v.uri === uri ? { ...v, ...changes } : v)));
  };

  const detect = async (targets: PickedVideo[]) => {
    for (const video of targets) {
      if (!video.thumbnail) {
        try {
          const [thumbnail] = await ClimbVideo.thumbnails(video.uri, [Math.min(1, video.duration / 2)], 240);
          patch(video.uri, { thumbnail });
        } catch (e) {
          console.log('thumbnail error', video.fileName, String(e));
        }
      }
      const startedAt = Date.now();
      let segments: PickedVideo['segments'] = [];
      let handheld = false;
      try {
        const result = await ClimbVideo.detect(video.uri);
        segments = result.segments;
        handheld = result.handheld;
      } catch (e) {
        console.log('detect error', video.fileName, String(e));
      }
      console.log('detect', video.fileName, video.duration.toFixed(1) + 's', Date.now() - startedAt + 'ms', handheld ? 'handheld' : 'fixed', JSON.stringify(segments));
      patch(video.uri, { segments, handheld });
    }
  };

  useEffect(() => {
    detect(videos.filter((v) => v.segments === undefined));
  }, []);

  const add = (picked: PickedVideo[]) => {
    const known = new Set(videos.map((v) => v.assetId).filter(Boolean));
    const added = picked.filter((v) => !v.assetId || !known.has(v.assetId));
    const skipped = picked.length - added.length;
    if (skipped > 0) Alert.alert(`이미 있는 영상 ${skipped}개는 건너뛰었어요`);
    if (added.length === 0) return;
    setVideos((prev) => [...prev, ...added]);
    detect(added);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {editing === null ? (
        <VideoListScreen
          videos={videos}
          onAdd={add}
          onRemove={(index) => setVideos((prev) => prev.filter((_, i) => i !== index))}
          onClear={() => setVideos([])}
          onOpen={setEditing}
        />
      ) : (
        <TrimScreen
          video={videos[editing]}
          onBack={() => setEditing(null)}
          onUpdate={(changes) => patch(videos[editing].uri, changes)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
});
