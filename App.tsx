import { File, Paths } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
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

  const detect = async (targets: PickedVideo[]) => {
    for (const video of targets) {
      const startedAt = Date.now();
      let segments: PickedVideo['segments'] = [];
      try {
        segments = await ClimbVideo.detect(video.uri);
      } catch (e) {
        console.log('detect error', video.fileName, String(e));
      }
      console.log('detect', video.fileName, video.duration.toFixed(1) + 's', Date.now() - startedAt + 'ms', JSON.stringify(segments));
      setVideos((prev) => prev.map((v) => (v.uri === video.uri ? { ...v, segments } : v)));
    }
  };

  useEffect(() => {
    detect(videos.filter((v) => v.segments === undefined));
  }, []);

  const add = (picked: PickedVideo[]) => {
    const known = new Set(videos.map((v) => v.assetId).filter(Boolean));
    const added = picked.filter((v) => !v.assetId || !known.has(v.assetId));
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
        <TrimScreen video={videos[editing]} onBack={() => setEditing(null)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
});
