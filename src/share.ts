import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Alert, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { askSettings } from './permissions';
import { showToast } from './components/Toast';

async function capture(ref: RefObject<View | null>, size: [number, number] = [1080, 1920]) {
  return captureRef(ref, { format: 'png', quality: 1, width: size[0], height: size[1], result: 'tmpfile' });
}

export async function saveCard(ref: RefObject<View | null>, size?: [number, number]) {
  if (!ref.current) return;
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      askSettings('사진 저장 권한이 필요해요', '카드를 사진 앱에 넣으려면 설정에서 사진 접근을 허용해 주세요');
      return;
    }
    const uri = await capture(ref, size);
    await MediaLibrary.saveToLibraryAsync(uri);
    showToast('도감 카드를 사진 앱에 넣었어요');
  } catch (e) {
    Alert.alert('저장 실패', String(e));
  }
}

export async function shareCard(ref: RefObject<View | null>, size?: [number, number]) {
  if (!ref.current) return;
  try {
    const uri = await capture(ref, size);
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('이 기기에서는 공유를 쓸 수 없어요');
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '도감 카드 공유' });
  } catch (e) {
    Alert.alert('공유 실패', String(e));
  }
}
