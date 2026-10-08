import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Gym } from '../data/gyms';
import { colors } from '../theme';
import Button from './Button';
import { Silhouette } from './dex';

type Props = {
  gym: Gym;
  first: boolean;
  onCamera: () => void;
  onAlbum: () => void;
  onNoPhoto: () => void;
  onLater: () => void;
};

export default function DexOfferSheet({ gym, first, onCamera, onAlbum, onNoPhoto, onLater }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onLater}>
      <Pressable style={styles.backdrop} onPress={onLater} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.head}>
          <Silhouette size={44} visited={false} seed={gym.id} region={gym.region1} />
          <View style={styles.headText}>
            <Text style={styles.title}>{first ? '도감에 등록할까요?' : '오늘 방문을 남길까요?'}</Text>
            <Text style={styles.hint}>
              {gym.name}에서 찍은 영상이에요. {first ? '첫 등록이면 도감 카드가 열려요' : '방문 기록이 하루 한 번 쌓여요'}
            </Text>
          </View>
        </View>
        <Button label="카메라로 찍기" icon="camera-outline" onPress={onCamera} />
        <Button variant="secondary" label="앨범에서 고르기" icon="images-outline" onPress={onAlbum} />
        <Button variant="secondary" label="사진 없이 등록" onPress={onNoPhoto} />
        <Button variant="text" label="나중에" onPress={onLater} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  headText: { flex: 1, gap: 3 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  hint: { fontSize: 13, color: colors.textSub, lineHeight: 18 },
});
