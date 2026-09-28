import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import TrimScreen from './src/screens/TrimScreen';
import VideoListScreen from './src/screens/VideoListScreen';
import type { PickedVideo } from './src/types';

export default function App() {
  const [videos, setVideos] = useState<PickedVideo[]>([]);
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {editing === null ? (
        <VideoListScreen
          videos={videos}
          onAdd={(added) => setVideos((prev) => [...prev, ...added])}
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
