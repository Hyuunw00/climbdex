import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ClimbVideo } from './modules/climb-video';
import { cleanupPickerCopies, deleteFile } from './src/videoFiles';
import { DetectQueue, type DetectProgress, keepAwake, notifyDone, prepareNotifications } from './src/detectProgress';
import { type Candidate, type Gym, nearbyGyms } from './src/data/gyms';
import { allowedMeters, formatDistance } from './src/components/dex';
import * as Location from 'expo-location';
import Celebration from './src/components/Celebration';
import AllGymsScreen from './src/screens/AllGymsScreen';
import DexScreen from './src/screens/DexScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import GymScreen, { choosePhoto } from './src/screens/GymScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TrimScreen from './src/screens/TrimScreen';
import { loadSettings, saveSettings, type Settings } from './src/settings';
import VideoListScreen from './src/screens/VideoListScreen';
import type { Session } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { ensureSession, retryMerge, signOut } from './src/auth/auth';
import { supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import { EMPTY_DEX, clearLegacy, loadCache, loadLegacy, removeVisit, replacePhoto, saveCache, storePhoto, type DexState, type Visit, dayKey, visitedToday } from './src/store/dex';
import { deleteAccount, deleteGymPhotoRemote, deleteVisitRemote, fetchDex, pushGymPhoto, pushVisit } from './src/store/remote';
import type { PickedVideo } from './src/types';
import { resolveGyms } from './src/store/sends';
import { deliverSummary, flushOutbox } from './src/store/outbox';
import { dismissToday, dismissedToday } from './src/todayVideos';

const store = new File(Paths.document, 'videos.json');

function load(): PickedVideo[] {
  try {
    if (!store.exists) return [];
    const saved: PickedVideo[] = JSON.parse(store.textSync());
    return saved.filter((v) => !v.uri.startsWith('file:') || new File(v.uri).exists);
  } catch {
    return [];
  }
}

type Tab = 'videos' | 'dex';

let lastBackgroundAt = 0;
AppState.addEventListener('change', (state) => {
  if (state !== 'active') lastBackgroundAt = Date.now();
});

function waitForActive() {
  return new Promise<void>((resolve) => {
    if (AppState.currentState === 'active') return resolve();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
}
type DexView = 'home' | 'all' | 'history';

export default function App() {
  const [tab, setTab] = useState<Tab>('videos');
  const [videos, setVideos] = useState<PickedVideo[]>(load);
  const [editing, setEditing] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(false);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  const [session, setSession] = useState<Session | null>(null);
  const [dex, setDex] = useState<DexState>(EMPTY_DEX);
  const [dexReady, setDexReady] = useState(false);
  const [gym, setGym] = useState<Gym | null>(null);
  const [gymDay, setGymDay] = useState<string | null>(null);
  const [dexView, setDexView] = useState<DexView>('home');
  const [historyMonth, setHistoryMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [historyDay, setHistoryDay] = useState(() => dayKey(new Date()));
  const [region, setRegion] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ gym: Gym; photo?: string; count: number; rank: number; date?: Date; replay?: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const queue = useRef(new DetectQueue()).current;
  const removed = useRef(new Set<string>()).current;
  const detecting = useRef<string | null>(null);
  const [progress, setProgress] = useState<DetectProgress | null>(null);
  const [activeAt, setActiveAt] = useState(Date.now());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setActiveAt(Date.now());
    });
    return () => sub.remove();
  }, []);


  const [here, setHere] = useState<Candidate[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) return setHere([]);
        const position =
          (await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 100 })) ??
          (await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))]));
        if (cancelled) return;
        setHere(position ? nearbyGyms(position.coords.latitude, position.coords.longitude, allowedMeters(position.coords.accuracy)).slice(0, 5) : []);
      } catch (e) {
        console.log('here location error', String(e));
        if (!cancelled) setHere([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAt]);

  const hereBanner = here.length > 0 && !here.some((c) => visitedToday(dex, c.gym.id)) && !here.some((c) => dismissedToday(`checkin:${c.gym.id}`)) ? here : null;

  const awake = progress !== null && !progress.background;
  useEffect(() => {
    keepAwake(awake);
  }, [awake]);

  const syncProgress = () => {
    const p = queue.progress;
    setProgress(p ? { ...p, background: !!ClimbVideo.backgroundRunActive?.() } : null);
  };

  useEffect(() => {
    store.write(JSON.stringify(videos));
  }, [videos]);

  useEffect(() => {
    if (!__DEV__) return;
    const timer = setInterval(() => {
      for (const line of ClimbVideo.drainLogs?.() ?? []) console.log('[native]', line);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    cleanupPickerCopies(videos.map((v) => v.uri));
    ClimbVideo.cleanupOriginals?.(videos.map((v) => v.uri).filter((u) => u.startsWith('ph://')));
  }, []);

  const ownerId = session?.user.id ?? null;
  const userId = session && !session.user.is_anonymous ? session.user.id : null;
  const latest = useRef({ ownerId, dex });
  latest.current = { ownerId, dex };

  const refreshDex = async () => {
    if (!userId) return;
    try {
      setDex(await fetchDex(userId, dex));
    } catch (e) {
      console.log('refreshDex error', String(e));
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) ensureSession();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') ensureSession();
    });
    const active = AppState.addEventListener('change', (state) => {
      if (state === 'active') ensureSession().then(() => flushOutbox());
    });
    return () => {
      sub.subscription.unsubscribe();
      active.remove();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setDex(EMPTY_DEX);
      setDexReady(false);
      return;
    }
    let cancelled = false;
    const cached = loadCache(userId);
    setDex(cached);
    setDexReady(true);
    (async () => {
      try {
        const remote = await fetchDex(userId, cached);
        if (cancelled) return;
        setDex(remote);
        for (const id of remote.pending) {
          const visit = remote.visits.find((v) => v.id === id);
          if (visit) await syncVisit(userId, visit);
        }
        const legacy = loadLegacy();
        if (legacy && remote.visits.length === 0) {
          Alert.alert('이전 기록을 올릴까요?', `로그인 전에 남긴 방문 ${legacy.visits.length}개가 이 폰에 있어요`, [
            { text: '버리기', style: 'destructive', onPress: clearLegacy },
            {
              text: '올리기',
              onPress: async () => {
                setDex((prev) => ({ ...prev, visits: [...prev.visits, ...legacy.visits], photos: { ...legacy.photos, ...prev.photos } }));
                for (const visit of legacy.visits) await syncVisit(userId, visit);
                for (const [gymId, uri] of Object.entries(legacy.photos)) {
                  try {
                    const path = await pushGymPhoto(userId, gymId, uri);
                    setDex((prev) => replacePhoto(prev, gymId, uri, path));
                  } catch (e) {
                    console.log('legacy photo error', String(e));
                  }
                }
                clearLegacy();
              },
            },
          ]);
        }
      } catch (e) {
        console.log('fetchDex error', String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (userId) retryMerge();
  }, [userId]);

  useEffect(() => {
    if (ownerId) flushOutbox();
  }, [ownerId]);

  useEffect(() => {
    if (userId && dexReady) saveCache(userId, dex);
  }, [dex, userId, dexReady]);

  const syncVisit = async (uid: string, visit: Visit) => {
    try {
      const saved = await pushVisit(uid, visit);
      setDex((prev) => ({
        ...prev,
        visits: prev.visits.map((v) => (v.id === saved.id ? saved : v)),
        pending: prev.pending.filter((id) => id !== saved.id),
        photoPaths: saved.photoPath && prev.photos[saved.gymId] === saved.photo ? { ...prev.photoPaths, [saved.gymId]: saved.photoPath } : prev.photoPaths,
      }));
      if (saved.photoPath && saved.photo) {
        try {
          await pushGymPhoto(uid, saved.gymId, saved.photo, saved.photoPath);
        } catch (e) {
          console.log('gym photo sync error', String(e));
        }
      }
    } catch (e) {
      console.log('pushVisit error', String(e));
      setDex((prev) => (prev.pending.includes(visit.id) ? prev : { ...prev, pending: [...prev.pending, visit.id] }));
    }
  };

  const patch = (uri: string, changes: Partial<PickedVideo>) => {
    setVideos((prev) => prev.map((v) => (v.uri === uri ? { ...v, ...changes } : v)));
  };

  const detect = async (targets: PickedVideo[], userStarted = false) => {
    if (targets.length === 0) return;
    queue.start(targets.map((v) => v.duration));
    syncProgress();
    if (userStarted) {
      try {
        ClimbVideo.startBackgroundRun?.('시도 구간 찾는 중', `0/${queue.total}`, queue.totalSec);
      } catch (e) {
        console.log('background run error', String(e));
      }
    }
    syncProgress();
    for (const video of targets) {
      if (removed.has(video.uri)) {
        queue.drop(video.duration);
        syncProgress();
        continue;
      }
      detecting.current = video.uri;
      if (!video.thumbnail) {
        try {
          const [thumbnail] = await ClimbVideo.thumbnails(video.uri, [Math.min(1, video.duration / 2)], 240);
          patch(video.uri, { thumbnail });
        } catch (e) {
          console.log('thumbnail error', video.fileName, String(e));
        }
      }
      let meta: Partial<PickedVideo> = {};
      if (video.assetId && (!video.createdAt || video.location === undefined)) {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(video.assetId);
          meta = { createdAt: video.createdAt ?? info.creationTime, location: info.location ? { lat: info.location.latitude, lng: info.location.longitude } : null };
          patch(video.uri, meta);
        } catch {}
      }
      let segments: PickedVideo['segments'] = [];
      let candidates: PickedVideo['candidates'] = [];
      let handheld = false;
      let tracks: PickedVideo['tracks'];
      let startedAt = Date.now();
      let workMs = 0;
      for (let attempt = 1; attempt <= 20; attempt++) {
        if (attempt > 1 || !ClimbVideo.backgroundRunActive?.()) await waitForActive();
        startedAt = Date.now();
        let interrupted = false;
        try {
          const result = await ClimbVideo.detect(video.uri);
          segments = result.segments;
          candidates = result.candidates ?? [];
          handheld = result.handheld;
          tracks = result.tracks;
        } catch (e) {
          const message = String(e);
          interrupted = !removed.has(video.uri) && !message.includes('Cancelled') && (message.includes('Interrupted') || lastBackgroundAt > startedAt);
          if (!interrupted) console.log('detect error', video.fileName, message);
        }
        workMs += Date.now() - startedAt;
        if (!interrupted) break;
        console.log('detect paused by background, resuming', video.fileName, attempt);
      }
      detecting.current = null;
      if (removed.has(video.uri)) {
        console.log('detect cancelled', video.fileName);
        queue.drop(video.duration);
        syncProgress();
        continue;
      }
      startedAt = Date.now() - workMs;
      console.log('detect', video.fileName, video.duration.toFixed(1) + 's', Date.now() - startedAt + 'ms', handheld ? 'handheld' : 'fixed', JSON.stringify(segments));
      if (candidates.length > 0) console.log('detect low', video.fileName, JSON.stringify(candidates));
      patch(video.uri, { segments, handheld, candidates, tracks });
      if (!latest.current.ownerId) await ensureSession();
      const uid = latest.current.ownerId ?? (await supabase.auth.getSession()).data.session?.user.id;
      if (uid) {
        const done: PickedVideo = { ...video, ...meta, segments, candidates, handheld };
        const gyms = resolveGyms(done, latest.current.dex);
        deliverSummary(uid, done, gyms.length === 1 ? gyms[0] : null, Date.now() - startedAt);
      }
      if (segments.length > 0) {
        try {
          const [thumbnail] = await ClimbVideo.thumbnails(video.uri, [(segments[0].start + segments[0].end) / 2], 240);
          if (thumbnail) patch(video.uri, { thumbnail });
        } catch (e) {
          console.log('thumbnail error', video.fileName, String(e));
        }
      }
      queue.finishOne(video.duration, Date.now() - startedAt, segments.length + candidates.length);
      syncProgress();
      ClimbVideo.updateBackgroundRun?.(queue.totalSec - queue.pendingSec, `${queue.done}/${queue.total}`);
    }
    if (queue.progress === null) {
      if (queue.done > 0) {
        ClimbVideo.finishBackgroundRun?.(true);
        notifyDone(queue.done, queue.clips);
      } else {
        ClimbVideo.finishBackgroundRun?.(false);
      }
      queue.reset();
      syncProgress();
    }
  };

  useEffect(() => {
    detect(videos.filter((v) => v.segments === undefined));
  }, []);

  const forget = (uri: string) => {
    removed.add(uri);
    if (detecting.current === uri) ClimbVideo.cancelDetect?.(uri);
    deleteFile(uri);
  };

  const add = (picked: PickedVideo[]) => {
    const known = new Set(videos.map((v) => v.assetId).filter(Boolean));
    const added = picked.filter((v) => !v.assetId || !known.has(v.assetId));
    const skipped = picked.length - added.length;
    if (skipped > 0) Alert.alert(`이미 있는 영상 ${skipped}개는 건너뛰었어요`);
    if (added.length === 0) return;
    for (const v of added) removed.delete(v.uri);
    const pickedAt = Date.now();
    setVideos((prev) => [...prev, ...added.map((v) => ({ ...v, pickedAt }))]);
    prepareNotifications();
    detect(added, true);
  };

  const recordVisit = async (target: Gym, photoUri: string | null) => {
    if (!userId) return;
    const at = new Date().toISOString();
    let photo: string | undefined;
    if (photoUri) {
      try {
        photo = await storePhoto(photoUri, target.id);
      } catch (e) {
        Alert.alert('사진 저장 실패', String(e));
      }
    }
    const visit: Visit = { id: randomUUID(), gymId: target.id, at, photo };
    setDex((prev) => {
      const next = { ...prev, visits: [...prev.visits, visit], pending: [...prev.pending, visit.id] };
      return photo ? replacePhoto(next, target.id, photo) : next;
    });
    const visitedGyms = new Set(dex.visits.map((v) => v.gymId));
    const rank = visitedGyms.has(target.id) ? visitedGyms.size : visitedGyms.size + 1;
    setCelebration({ gym: target, photo, count: dex.visits.filter((v) => v.gymId === target.id).length + 1, rank });
    syncVisit(userId, visit);
  };

  const setGymPhoto = async (target: Gym, photoUri: string) => {
    if (!userId) return;
    try {
      const photo = await storePhoto(photoUri, target.id);
      setDex((prev) => replacePhoto(prev, target.id, photo));
      const path = await pushGymPhoto(userId, target.id, photo);
      setDex((prev) => replacePhoto(prev, target.id, photo, path));
    } catch (e) {
      Alert.alert('사진 저장 실패', String(e));
    }
  };

  const removeVisitEverywhere = async (id: string) => {
    if (!userId) return;
    const visit = dex.visits.find((v) => v.id === id);
    if (!visit) return;
    const others = dex.visits.filter((v) => v.gymId === visit.gymId && v.id !== id);
    setDex((prev) => removeVisit(prev, id));
    try {
      const keepPhoto = Boolean(visit.photoPath && dex.photoPaths[visit.gymId] === visit.photoPath && others.length > 0);
      await deleteVisitRemote(id, visit.photoPath, keepPhoto);
      if (others.length === 0) await deleteGymPhotoRemote(userId, visit.gymId);
    } catch (e) {
      console.log('deleteVisit error', String(e));
    }
  };

  const accountMenu = () => {
    Alert.alert(String(session?.user.user_metadata?.full_name ?? session?.user.email ?? '계정'), session?.user.email ?? undefined, [
      { text: '로그아웃', onPress: () => signOut() },
      {
        text: '회원 탈퇴',
        style: 'destructive',
        onPress: () =>
          Alert.alert('정말 탈퇴할까요?', '도감 기록, 사진, 등반 기록이 모두 지워져요', [
            { text: '취소', style: 'cancel' },
            {
              text: '계속',
              style: 'destructive',
              onPress: () =>
                Alert.alert('마지막으로 확인할게요', '탈퇴하면 되돌릴 수 없어요. 정말 탈퇴할까요?', [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '탈퇴하기',
                    style: 'destructive',
                    onPress: async () => {
                      if (!userId) return;
                      try {
                        await deleteAccount(userId);
                      } catch (e) {
                        Alert.alert('탈퇴 실패', String(e));
                      }
                    },
                  },
                ]),
            },
          ]),
      },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const pickGym = (candidates: Candidate[]) =>
    new Promise<Gym | null>((resolve) => {
      if (candidates.length <= 1) return resolve(candidates[0]?.gym ?? null);
      Alert.alert(
        '어느 암장에 있어요?',
        `근처에 암장이 ${candidates.length}곳 있어요`,
        [
          ...candidates.map(({ gym, distance }) => ({ text: `${gym.name} · ${formatDistance(distance)}`, onPress: () => resolve(gym) })),
          { text: '취소', style: 'cancel' as const, onPress: () => resolve(null) },
        ],
        { cancelable: true, onDismiss: () => resolve(null) },
      );
    });

  const checkIn = async (candidates: Candidate[], open = true) => {
    const target = await pickGym(candidates);
    if (!target) return;
    if (visitedToday(dex, target.id)) {
      if (open) setGym(target);
      return;
    }
    const choice = await choosePhoto();
    if (!choice) return;
    recordVisit(target, choice.uri);
    if (open) setGym(target);
  };

  const showCard = (target: Gym) => {
    const visits = dex.visits.filter((v) => v.gymId === target.id).sort((a, b) => a.at.localeCompare(b.at));
    if (visits.length === 0) return;
    const earlier = new Set(dex.visits.filter((v) => v.at < visits[0].at).map((v) => v.gymId));
    setCelebration({ gym: target, photo: dex.photos[target.id], count: visits.length, rank: earlier.size + 1, date: new Date(visits[0].at), replay: true });
  };

  let screen;
  if (tab === 'videos') {
    screen =
      editing !== null && videos[editing] ? (
        <TrimScreen
          key={videos[editing].uri}
          video={videos[editing]}
          settings={settings}
          index={editing}
          total={videos.length}
          onBack={() => setEditing(null)}
          onNavigate={(delta) => setEditing(Math.max(0, Math.min(videos.length - 1, editing + delta)))}
          onUpdate={(changes) => patch(videos[editing].uri, changes)}
          userId={ownerId}
          member={!!userId}
          dex={dex}
        />
      ) : (
        <VideoListScreen
          videos={videos}
          progress={progress}
          settings={settings}
          onOpenSettings={() => setShowSettings(true)}
          onAdd={add}
          onRemove={(index) => {
            const target = videos[index];
            if (target) forget(target.uri);
            setVideos((prev) => prev.filter((_, i) => i !== index));
          }}
          onClear={() => {
            for (const v of videos) forget(v.uri);
            setVideos([]);
          }}
          onOpen={setEditing}
          here={hereBanner ? { gymName: hereBanner[0].gym.name, count: hereBanner.length } : null}
          onHere={() => (userId ? hereBanner && checkIn(hereBanner, false) : setAuthPrompt(true))}
          onHereDismiss={() => {
            if (hereBanner) dismissToday(...hereBanner.map((c) => `checkin:${c.gym.id}`));
            setHere([]);
          }}
        />
      );
  } else {
    const guest = !userId;
    const needLogin = () => setAuthPrompt(true);
    screen = gym ? (
      <GymScreen
        key={`${gym.id}-${gymDay ?? ''}`}
        gym={gym}
        day={gymDay}
        dex={dex}
        videos={videos}
        onBack={() => {
          setGym(null);
          setGymDay(null);
        }}
        onCheckIn={guest ? needLogin : checkIn}
        onRemoveVisit={removeVisitEverywhere}
        onPhoto={guest ? needLogin : setGymPhoto}
        onShowCard={guest ? needLogin : showCard}
        ownerId={ownerId}
        onNeedAuth={needLogin}
        userId={userId}
        onRefresh={refreshDex}
        guest={guest}
      />
    ) : dexView === 'all' ? (
      <AllGymsScreen dex={dex} region={region} onRegion={setRegion} query={query} onQuery={setQuery} onOpenGym={setGym} onBack={() => setDexView('home')} onRefresh={refreshDex} />
    ) : dexView === 'history' ? (
      <HistoryScreen dex={dex} onOpenGym={(g, day) => {
        setGymDay(day ?? null);
        setGym(g);
      }} onBack={() => setDexView('home')} onRefresh={refreshDex} userId={userId} month={historyMonth} onMonth={setHistoryMonth} selected={historyDay} onSelect={setHistoryDay} />
    ) : (
      <DexScreen
        dex={dex}
        onOpenGym={setGym}
        onCheckIn={guest ? needLogin : checkIn}
        onOpenAll={() => setDexView('all')}
        onOpenHistory={guest ? needLogin : () => setDexView('history')}
        onRefresh={refreshDex}
        onAccount={guest ? needLogin : accountMenu}
        account={userId && session ? { name: String(session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? ''), email: session.user.email ?? '' } : null}
      />
    );
  }

  const showTabs = editing === null && gym === null;

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.container}>
      <StatusBar style={celebration ? 'light' : 'dark'} />
      <View style={styles.screen}>{screen}</View>
      {showTabs && (
        <View style={styles.tabs}>
          <Pressable style={styles.tab} onPress={() => setTab('videos')}>
            <Text style={[styles.tabIcon, tab === 'videos' && styles.tabIconActive]}>▶</Text>
            <Text style={[styles.tabText, tab === 'videos' && styles.tabTextActive]}>영상</Text>
          </Pressable>
          <Pressable
            style={styles.tab}
            onPress={() => {
              if (tab === 'dex') setDexView('home');
              setTab('dex');
            }}
          >
            <Text style={[styles.tabIcon, tab === 'dex' && styles.tabIconActive]}>◈</Text>
            <Text style={[styles.tabText, tab === 'dex' && styles.tabTextActive]}>도감</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
    {authPrompt && !userId && (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAuthPrompt(false)}>
        <AuthScreen onClose={() => setAuthPrompt(false)} />
      </Modal>
    )}
    {showSettings && <SettingsScreen settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}
    {celebration && <Celebration gym={celebration.gym} photo={celebration.photo} count={celebration.count} rank={celebration.rank} date={celebration.date} replay={celebration.replay} onDone={() => setCelebration(null)} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  screen: { flex: 1 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd', backgroundColor: '#fff' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  tabIcon: { fontSize: 18, color: '#bbb' },
  tabIconActive: { color: '#d7263d' },
  tabText: { fontSize: 12, color: '#999' },
  tabTextActive: { color: '#111', fontWeight: '700' },
});
