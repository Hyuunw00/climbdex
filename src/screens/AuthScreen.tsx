import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signInWithGoogle } from '../auth/auth';
import { RED } from '../components/dex';
import { configured } from '../lib/supabase';

export default function AuthScreen({ onClose }: { onClose?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      const message = String((e as Error)?.message ?? e);
      if (!/cancel/i.test(message)) Alert.alert('로그인 실패', message);
    } finally {
      setBusy(null);
    }
  };

  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, Platform.OS === 'android' && { paddingTop: insets.top + 24 }, { paddingBottom: insets.bottom + 24 }]}>
      {onClose && (
        <Pressable style={[styles.close, Platform.OS === 'android' && { top: insets.top + 16 }]} onPress={onClose} hitSlop={12}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      )}
      <Text style={styles.eyebrow}>CLIMBDEX</Text>
      <Text style={styles.title}>로그인하고{'\n'}도감을 모아 보세요</Text>
      <Text style={styles.body}>방문 등록과 사진, 내 기록은 계정에 저장돼서 폰을 바꾸거나 앱을 지워도 그대로 남아요. 암장 둘러보기와 영상 자르기는 로그인 없이 쓸 수 있어요.</Text>
      {!configured && <Text style={styles.warn}>서버 설정(EXPO_PUBLIC_SUPABASE_URL / ANON_KEY)이 비어 있어요</Text>}
      <View style={styles.buttons}>
        <Pressable style={[styles.google, busy && styles.disabled]} disabled={busy !== null} onPress={() => run('google', signInWithGoogle)}>
          {busy === 'google' ? <ActivityIndicator color="#111" /> : <Text style={styles.googleText}>Google로 계속하기</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center', gap: 14 },
  eyebrow: { color: RED, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { fontSize: 28, fontWeight: '800', lineHeight: 36 },
  body: { fontSize: 15, lineHeight: 22, color: '#555' },
  warn: { fontSize: 13, color: RED },
  buttons: { gap: 10, marginTop: 20 },
  google: { height: 50, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  googleText: { fontSize: 16, fontWeight: '600', color: '#111' },
  disabled: { opacity: 0.5 },
  close: { position: 'absolute', top: 16, right: 20 },
  closeText: { fontSize: 32, color: '#999' },
});
