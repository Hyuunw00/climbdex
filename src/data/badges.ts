import type { DexState } from '../store/dex';
import { gyms } from './gyms';

export type Badge = { id: string; icon: string; name: string; description: string; earned: boolean; progress: string };

export function computeBadges(dex: DexState): Badge[] {
  const counts = new Map<string, number>();
  for (const v of dex.visits) counts.set(v.gymId, (counts.get(v.gymId) ?? 0) + 1);
  const visited = counts.size;
  const most = Math.max(0, ...counts.values());

  const groups = new Map<string, { name: string; total: number; visited: number }>();
  for (const g of gyms) {
    const key = `${g.region1} ${g.region2}`;
    const group = groups.get(key) ?? { name: key, total: 0, visited: 0 };
    group.total += 1;
    if (counts.has(g.id)) group.visited += 1;
    groups.set(key, group);
  }
  let best: { name: string; total: number; visited: number } | null = null;
  for (const group of groups.values()) {
    if (group.visited > 0 && (!best || group.visited / group.total > best.visited / best.total)) best = group;
  }

  return [
    { id: 'first', icon: '🥇', name: '첫 도장', description: '암장 한 곳에 처음 방문 등록', earned: visited >= 1, progress: `${Math.min(visited, 1)}/1` },
    { id: 'ten', icon: '🔟', name: '열 곳', description: '서로 다른 암장 10곳 방문', earned: visited >= 10, progress: `${Math.min(visited, 10)}/10` },
    {
      id: 'district',
      icon: '🗺️',
      name: '한 구 완성',
      description: '한 구의 암장을 전부 방문',
      earned: best !== null && best.visited === best.total,
      progress: best ? `${best.name} ${best.visited}/${best.total}` : '아직 방문한 구가 없어요',
    },
    { id: 'regular', icon: '🏠', name: '단골', description: '같은 암장 10회 방문', earned: most >= 10, progress: `${Math.min(most, 10)}/10` },
  ];
}
