import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { name: string; email: string; onSignOut: () => void; onDelete: () => void; onClose: () => void };

export default function AccountSheet({ name, email, onSignOut, onDelete, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.name} numberOfLines={1}>
          {name || email}
        </Text>
        {name ? <Text style={styles.email}>{email}</Text> : null}
        <Button variant="secondary" label="로그아웃" onPress={onSignOut} style={styles.first} />
        <Button variant="secondary" label="취소" onPress={onClose} />
        <Pressable style={styles.delete} onPress={onDelete} hitSlop={8}>
          <Text style={styles.deleteText}>회원 탈퇴</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  name: { fontSize: 18, fontWeight: '700' },
  email: { fontSize: 13, color: '#888', marginTop: -6 },
  first: { marginTop: 8 },
  delete: { alignSelf: 'flex-end', marginTop: 4 },
  deleteText: { fontSize: 12, color: '#aaa' },
});
