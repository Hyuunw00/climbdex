import { Alert, Linking } from 'react-native';

export function askSettings(title: string, message: string) {
  Alert.alert(title, message, [
    { text: '닫기', style: 'cancel' },
    { text: '설정 열기', onPress: () => Linking.openSettings() },
  ]);
}

export const SAVE_DENIED: [string, string] = ['사진 저장 권한이 필요해요', '자른 클립을 사진 앱에 넣으려면 설정에서 사진 접근을 허용해 주세요'];
