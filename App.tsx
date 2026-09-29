import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, SafeAreaView, StatusBar as NativeStatusBar, StyleSheet, Text, View } from 'react-native';
import { ClimbVideo } from './modules/climb-video';
import type { Gym } from './src/data/gyms';
import DexScreen from './src/screens/DexScreen';
import GymScreen, { choosePhoto } from './src/screens/GymScreen';
import TrimScreen from './src/screens/TrimScreen';
import VideoListScreen from './src/screens/VideoListScreen';
import { type DexState, loadDex, saveDex, storePhoto, visitedToday } from './src/store/dex';
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

type Tab = 'videos' | 'dex';

export default function App() {
  const [tab, setTab] = useState<Tab>('videos');
  const [videos, setVideos] = useState<PickedVideo[]>(load);
  const [editing, setEditing] = useState<number | null>(null);
  const [dex, setDex] = useState<DexState>(loadDex);
  const [gym, setGym] = useState<Gym | null>(null);

  useEffect(() => {
    store.write(JSON.stringify(videos));
  }, [videos]);

  useEffect(() => {
    saveDex(dex);
  }, [dex]);

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
      if (video.assetId && !video.createdAt) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(video.assetId);
          patch(video.uri, { createdAt: info.creationTime });
        } catch {}
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

  const recordVisit = (target: Gym, photoUri: string | null) => {
    const at = new Date().toISOString();
    let photo: string | undefined;
    if (photoUri) {
      try {
        photo = storePhoto(photoUri, target.id);
      } catch (e) {
        Alert.alert('사진 저장 실패', String(e));
      }
    }
    setDex((prev) => ({
      visits: [...prev.visits, { gymId: target.id, at, photo }],
      photos: photo ? { ...prev.photos, [target.id]: photo } : prev.photos,
    }));
  };

  const setGymPhoto = (target: Gym, photoUri: string) => {
    try {
      const photo = storePhoto(photoUri, target.id);
      setDex((prev) => ({ ...prev, photos: { ...prev.photos, [target.id]: photo } }));
    } catch (e) {
      Alert.alert('사진 저장 실패', String(e));
    }
  };

  const checkIn = async (target: Gym) => {
    if (visitedToday(dex, target.id)) {
      setGym(target);
      return;
    }
    const choice = await choosePhoto();
    if (!choice) return;
    recordVisit(target, choice.uri);
    setGym(target);
  };

  const openVideo = (index: number) => {
    setGym(null);
    setTab('videos');
    setEditing(index);
  };

  let screen;
  if (tab === 'videos') {
    screen =
      editing === null ? (
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
      );
  } else {
    screen = gym ? (
      <GymScreen
        gym={gym}
        dex={dex}
        videos={videos}
        onBack={() => setGym(null)}
        onVisit={recordVisit}
        onRemoveVisit={(at) => setDex((prev) => ({ ...prev, visits: prev.visits.filter((v) => v.at !== at) }))}
        onPhoto={setGymPhoto}
        onOpenVideo={openVideo}
      />
    ) : (
      <DexScreen dex={dex} onOpenGym={setGym} onCheckIn={checkIn} />
    );
  }

  const showTabs = editing === null && gym === null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.screen}>{screen}</View>
      {showTabs && (
        <View style={styles.tabs}>
          <Pressable style={styles.tab} onPress={() => setTab('videos')}>
            <Text style={[styles.tabIcon, tab === 'videos' && styles.tabIconActive]}>▶</Text>
            <Text style={[styles.tabText, tab === 'videos' && styles.tabTextActive]}>영상</Text>
          </Pressable>
          <Pressable style={styles.tab} onPress={() => setTab('dex')}>
            <Text style={[styles.tabIcon, tab === 'dex' && styles.tabIconActive]}>◈</Text>
            <Text style={[styles.tabText, tab === 'dex' && styles.tabTextActive]}>도감</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
  screen: { flex: 1 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd', paddingBottom: Platform.OS === 'android' ? 8 : 0, backgroundColor: '#fff' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  tabIcon: { fontSize: 18, color: '#bbb' },
  tabIconActive: { color: '#d7263d' },
  tabText: { fontSize: 12, color: '#999' },
  tabTextActive: { color: '#111', fontWeight: '700' },
});
