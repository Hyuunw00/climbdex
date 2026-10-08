import { Alert, Linking, Platform } from 'react-native';

export function askSettings(title: string, message: string) {
  Alert.alert(title, message, [
    { text: '닫기', style: 'cancel' },
    { text: '설정 열기', onPress: () => Linking.openSettings() },
  ]);
}

export const SAVE_DENIED: [string, string] = ['사진 저장 권한이 필요해요', '자른 클립을 사진 앱에 넣으려면 설정에서 사진 접근을 허용해 주세요'];

const CAMERA_PACKAGES = ['com.sec.android.app.camera', 'com.google.android.GoogleCamera', 'com.android.camera2', 'com.android.camera'];

export async function openCameraAppSettings() {
  if (Platform.OS !== 'android') return;
  try {
    const IntentLauncher = await import('expo-intent-launcher');
    for (const pkg of CAMERA_PACKAGES) {
      try {
        await IntentLauncher.getApplicationIconAsync(pkg);
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, { data: `package:${pkg}` });
        return;
      } catch {}
    }
  } catch {}
  try {
    await Linking.sendIntent('android.settings.APPLICATION_SETTINGS');
  } catch {
    Linking.openSettings();
  }
}
