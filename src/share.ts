import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Alert, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

async function capture(ref: RefObject<View | null>) {
  return captureRef(ref, { format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' });
}

export async function saveCard(ref: RefObject<View | null>) {
  if (!ref.current) return;
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert('사진 앱 저장 권한이 필요해요');
      return;
    }
    const uri = await capture(ref);
    await MediaLibrary.saveToLibraryAsync(uri);
    Alert.alert('저장했어요', '사진 앱에서 도감 카드를 볼 수 있어요');
  } catch (e) {
    Alert.alert('저장 실패', String(e));
  }
}

export async function shareCard(ref: RefObject<View | null>) {
  if (!ref.current) return;
  try {
    const uri = await capture(ref);
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('이 기기에서는 공유를 쓸 수 없어요');
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '도감 카드 공유' });
  } catch (e) {
    Alert.alert('공유 실패', String(e));
  }
}
