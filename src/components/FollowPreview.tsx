import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { FollowPlan } from '../../modules/climb-video';

type Props = {
  player: VideoPlayer;
  plan: FollowPlan;
  width: number;
  height: number;
};

function rectAt(plan: FollowPlan, t: number) {
  const pts = plan.points;
  if (pts.length === 0) return { x: 0, y: 0 };
  if (t <= pts[0].t) return pts[0];
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1];
  let i = 0;
  while (i + 1 < pts.length && pts[i + 1].t < t) i += 1;
  const a = pts[i];
  const b = pts[i + 1];
  const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

export default function FollowPreview({ player, plan, width, height }: Props) {
  const [time, setTime] = useState(player.currentTime);

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => setTime(currentTime));
    return () => sub.remove();
  }, [player]);

  const scale = height / plan.crop.height;
  const rect = rectAt(plan, time);

  return (
    <View style={[styles.window, { width, height }]}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="fill"
        style={{
          position: 'absolute',
          left: -rect.x * scale,
          top: -rect.y * scale,
          width: plan.frame.width * scale,
          height: plan.frame.height * scale,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  window: { overflow: 'hidden', backgroundColor: '#000', borderRadius: 8, alignSelf: 'center' },
});
