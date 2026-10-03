import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

export type DetectProgress = { done: number; total: number; remainingSec: number };

const TAG = 'detect';
const DEFAULT_RATE = 0.2;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function prepareNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(TAG, { name: '시도 구간 찾기', importance: Notifications.AndroidImportance.DEFAULT });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'undetermined') await Notifications.requestPermissionsAsync();
  } catch (e) {
    console.log('notification permission error', String(e));
  }
}

export function keepAwake(on: boolean) {
  (on ? activateKeepAwakeAsync(TAG) : deactivateKeepAwake(TAG)).catch(() => {});
}

export async function notifyDone(videos: number, clips: number) {
  const body = `영상 ${videos}개 · 구간 ${clips}개`;
  if (AppState.currentState === 'active') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return;
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: '시도 구간을 다 찾았어요', body, sound: true, ...(Platform.OS === 'android' ? { channelId: TAG } : {}) },
      trigger: null,
    });
  } catch (e) {
    console.log('notification error', String(e));
  }
}

export class DetectQueue {
  total = 0;
  done = 0;
  clips = 0;
  pendingSec = 0;
  workMs = 0;
  videoSec = 0;

  start(durations: number[]) {
    this.total += durations.length;
    this.pendingSec += durations.reduce((a, b) => a + b, 0);
  }

  finishOne(duration: number, elapsedMs: number, clips: number) {
    this.done += 1;
    this.clips += clips;
    this.pendingSec = Math.max(0, this.pendingSec - duration);
    this.workMs += elapsedMs;
    this.videoSec += duration;
  }

  get rate() {
    return this.videoSec > 0 ? this.workMs / 1000 / this.videoSec : DEFAULT_RATE;
  }

  get progress(): DetectProgress | null {
    if (this.total === 0 || this.done >= this.total) return null;
    return { done: this.done, total: this.total, remainingSec: this.pendingSec * this.rate };
  }

  reset() {
    this.total = 0;
    this.done = 0;
    this.clips = 0;
    this.pendingSec = 0;
  }
}

export function formatRemaining(sec: number) {
  if (sec < 60) return '1분 안에 끝나요';
  return `약 ${Math.ceil(sec / 60)}분 남음`;
}
