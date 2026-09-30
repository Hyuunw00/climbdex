import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClimbVideo } from '../../modules/climb-video';
import { type Analysis, LIMB_KO, type Move, analyze, clipKey } from '../analysis/moves';
import type { Clip, PickedVideo } from '../types';

type Props = {
  video: PickedVideo;
  clip: Clip;
  onBack: () => void;
  onUpdate: (patch: Partial<PickedVideo>) => void;
};

const JOINT_FPS = 10;
const HAND = '#d7263d';
const FOOT = '#2b7fd3';

function limbColor(limb: Move['limb']) {
  return limb === 'lWrist' || limb === 'rWrist' ? HAND : FOOT;
}

function dir(dy: number) {
  return dy > 0.1 ? '↑' : dy < -0.1 ? '↓' : '→';
}

export default function AnalysisScreen({ video, clip, onBack, onUpdate }: Props) {
  const key = clipKey(clip.start, clip.end);
  const analysis: Analysis | undefined = video.analyses?.[key];
  const [running, setRunning] = useState(false);
  const [position, setPosition] = useState(clip.start);
  const [stripWidth, setStripWidth] = useState(0);
  const started = useRef(false);

  const player = useVideoPlayer(video.uri, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.currentTime = clip.start;
  });

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      setPosition(currentTime);
      if (currentTime >= clip.end) player.pause();
    });
    return () => sub.remove();
  }, [player, clip.end]);

  const run = async () => {
    setRunning(true);
    const startedAt = Date.now();
    try {
      const joints = await ClimbVideo.joints(video.uri, clip.start, clip.end, JOINT_FPS);
      const result = analyze(joints, clip.start, clip.end);
      console.log('analysis', video.fileName, key, Date.now() - startedAt + 'ms', JSON.stringify({ ...result, moves: result.moves.length }));
      onUpdate({ analyses: { ...(video.analyses ?? {}), [key]: result } });
    } catch (e) {
      Alert.alert('분석 실패', String(e));
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!analysis && !started.current) {
      started.current = true;
      run();
    }
  }, []);

  const seek = (time: number) => {
    player.pause();
    player.currentTime = time;
    setPosition(time);
  };

  const play = () => {
    const from = position > clip.start && position < clip.end - 0.2 ? position : clip.start;
    player.currentTime = from;
    player.play();
  };

  const length = clip.end - clip.start;
  const toX = (t: number) => ((t - clip.start) / length) * stripWidth;
  const moves = analysis ? analysis.moves.filter((m) => !analysis.descent || m.t0 <= analysis.descent.t) : [];
  const title = !analysis ? '' : !analysis.descent ? '판정 못 함' : analysis.descent.kind === 'fall' ? `낙하 · ${analysis.descent.t.toFixed(1)}초` : '완등';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>← 구간 편집</Text>
      </Pressable>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
      <View
        style={styles.strip}
        onLayout={(e) => setStripWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => seek(clip.start + (e.nativeEvent.locationX / Math.max(1, stripWidth)) * length)}
        onResponderMove={(e) => seek(clip.start + (e.nativeEvent.locationX / Math.max(1, stripWidth)) * length)}
      >
        {stripWidth > 0 &&
          moves.map((m, i) => (
            <View
              key={i}
              style={[
                styles.marker,
                { left: toX(m.t0), width: Math.max(3, toX(m.t1) - toX(m.t0)), backgroundColor: limbColor(m.limb), top: m.limb.endsWith('Wrist') ? 6 : 22 },
              ]}
            />
          ))}
        {stripWidth > 0 && analysis?.descent && <View style={[styles.fallLine, { left: toX(analysis.descent.t) }]} />}
        {stripWidth > 0 && <View style={[styles.playhead, { left: toX(Math.min(clip.end, Math.max(clip.start, position))) }]} />}
      </View>
      <View style={styles.legend}>
        <Text style={styles.label}>
          {(position - clip.start).toFixed(1)}s / {length.toFixed(1)}s
        </Text>
        <View style={styles.legendItems}>
          <View style={[styles.dot, { backgroundColor: HAND }]} />
          <Text style={styles.legendText}>손</Text>
          <View style={[styles.dot, { backgroundColor: FOOT }]} />
          <Text style={styles.legendText}>발</Text>
        </View>
        <Pressable onPress={play} hitSlop={8}>
          <Text style={styles.play}>구간 재생</Text>
        </Pressable>
      </View>

      {running && (
        <View style={styles.running}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.hint}>관절을 뽑고 있어요… 구간 길이만큼 걸려요</Text>
        </View>
      )}

      {analysis && !running && (
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {analysis.notes.map((note, i) => (
            <Text key={i} style={styles.note}>
              · {note}
            </Text>
          ))}
          <Text style={styles.meta}>
            {analysis.frames}프레임 · 보인 비율 {(['lWrist', 'rWrist', 'lAnkle', 'rAnkle'] as const).map((l) => `${LIMB_KO[l]} ${Math.round(analysis.detection[l] * 100)}%`).join(' · ')}
          </Text>
        </View>
      )}

      {moves.length > 0 && !running && (
        <View style={styles.moves}>
          <Text style={styles.movesTitle}>무브 순서 · 누르면 그 시점으로</Text>
          {moves.map((m, i) => (
            <Pressable key={i} onPress={() => seek(m.t0)} style={styles.move}>
              <Text style={styles.moveTime}>{(m.t0 - clip.start).toFixed(1)}s</Text>
              <View style={[styles.dot, { backgroundColor: limbColor(m.limb) }]} />
              <Text style={styles.moveText}>
                {LIMB_KO[m.limb]} {dir(m.dy)} 몸통 {m.dist.toFixed(1)}배
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable style={[styles.wide, running && styles.disabled]} onPress={run} disabled={running}>
        <Text style={styles.wideText}>{analysis ? '다시 분석' : '분석'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, gap: 10 },
  back: { fontSize: 16, paddingVertical: 8 },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 340, backgroundColor: '#000', borderRadius: 8 },
  strip: { height: 40, borderRadius: 8, backgroundColor: '#eceef2', overflow: 'hidden' },
  marker: { position: 'absolute', height: 12, borderRadius: 3, opacity: 0.85 },
  fallLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#d7263d' },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#111' },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendItems: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12, color: '#666', marginRight: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 13, color: '#333', fontVariant: ['tabular-nums'] },
  play: { fontSize: 14, color: '#0a58ca' },
  running: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 20 },
  hint: { fontSize: 13, color: '#888' },
  card: { backgroundColor: '#f6f6f8', borderRadius: 12, padding: 14, gap: 8 },
  title: { fontSize: 20, fontWeight: '800' },
  note: { fontSize: 15, lineHeight: 22, color: '#222' },
  meta: { fontSize: 11, color: '#999', marginTop: 4 },
  moves: { gap: 2 },
  movesTitle: { fontSize: 12, color: '#888', marginBottom: 4 },
  move: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  moveTime: { fontSize: 13, color: '#0a58ca', width: 44, fontVariant: ['tabular-nums'] },
  moveText: { fontSize: 14, color: '#333' },
  wide: { paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#111', alignItems: 'center', marginTop: 6 },
  wideText: { fontSize: 16 },
  disabled: { opacity: 0.5 },
});
