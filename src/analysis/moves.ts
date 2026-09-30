import type { JointsResult } from '../../modules/climb-video';

export type Limb = 'lWrist' | 'rWrist' | 'lAnkle' | 'rAnkle';
export type Move = { limb: Limb; t0: number; t1: number; dist: number; dy: number };
export type Descent = { t: number; still: number; kind: 'send' | 'fall'; lastMove?: Move };
export type Analysis = {
  start: number;
  end: number;
  frames: number;
  torso: number;
  detection: Record<Limb, number>;
  moves: Move[];
  descent: Descent | null;
  elbowBent: { l: number; r: number };
  notes: string[];
};

export const LIMBS: Limb[] = ['lWrist', 'rWrist', 'lAnkle', 'rAnkle'];
export const LIMB_KO: Record<Limb, string> = { lWrist: '왼손', rWrist: '오른손', lAnkle: '왼발', rAnkle: '오른발' };

const MIN_CONF = 0.3;
const MAX_GAP = 0.6;
const MOVE_SPEED = 0.6;
const MIN_MOVE = 0.25;
const FALL_DROP = 1.5;
const FALL_WINDOW = 0.6;
const STILL = 1.5;
const PLATEAU_BAND = 0.5;
const PLATEAU_MIN = 4;
const BENT_ANGLE = 120;
const BENT_RATIO = 0.35;
const LOW_DETECTION = 0.5;

type Series = { x: number[]; y: number[] };

function interp(t: number[], v: number[]): number[] {
  const out = v.slice();
  const idx: number[] = [];
  for (let i = 0; i < v.length; i++) if (!Number.isNaN(v[i])) idx.push(i);
  if (idx.length < 2) return out;
  for (let k = 0; k + 1 < idx.length; k++) {
    const a = idx[k];
    const b = idx[k + 1];
    if (t[b] - t[a] > MAX_GAP) continue;
    for (let i = a + 1; i < b; i++) out[i] = v[a] + ((v[b] - v[a]) * (t[i] - t[a])) / (t[b] - t[a]);
  }
  return out;
}

function smooth(v: number[], k = 5): number[] {
  const h = Math.floor(k / 2);
  return v.map((_, i) => {
    const w = v.slice(Math.max(0, i - h), i + h + 1).filter((x) => !Number.isNaN(x));
    if (w.length === 0) return NaN;
    w.sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

function median(values: number[]): number {
  const w = values.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  return w.length ? w[Math.floor(w.length / 2)] : NaN;
}

function gradient(v: number[], t: number[]): number[] {
  const n = v.length;
  return v.map((_, i) => {
    if (n < 2) return NaN;
    if (i === 0) return (v[1] - v[0]) / (t[1] - t[0]);
    if (i === n - 1) return (v[n - 1] - v[n - 2]) / (t[n - 1] - t[n - 2]);
    return (v[i + 1] - v[i - 1]) / (t[i + 1] - t[i - 1]);
  });
}

function angleAt(s: Series, e: Series, w: Series, i: number): number {
  const v1x = s.x[i] - e.x[i];
  const v1y = s.y[i] - e.y[i];
  const v2x = w.x[i] - e.x[i];
  const v2y = w.y[i] - e.y[i];
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!n || Number.isNaN(n)) return NaN;
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n))) * 180) / Math.PI;
}

function arrow(dy: number) {
  return dy > 0.1 ? '위' : dy < -0.1 ? '아래' : '옆';
}

export function analyze(result: JointsResult, start: number, end: number): Analysis {
  const { aspect, names, frames } = result;
  const t = frames.map((f) => f.t);
  const n = t.length;
  const conf: Record<string, number[]> = {};
  const pos: Record<string, Series> = {};
  names.forEach((name, j) => {
    const xs: number[] = [];
    const ys: number[] = [];
    const cs: number[] = [];
    for (const f of frames) {
      const c = f.p[j * 3 + 2];
      cs.push(c);
      xs.push(c >= MIN_CONF ? f.p[j * 3] * aspect : NaN);
      ys.push(c >= MIN_CONF ? f.p[j * 3 + 1] : NaN);
    }
    conf[name] = cs;
    pos[name] = { x: smooth(interp(t, xs)), y: smooth(interp(t, ys)) };
  });

  const empty: Analysis = {
    start,
    end,
    frames: n,
    torso: 0,
    detection: { lWrist: 0, rWrist: 0, lAnkle: 0, rAnkle: 0 },
    moves: [],
    descent: null,
    elbowBent: { l: 0, r: 0 },
    notes: ['이 구간에서 사람을 거의 못 찾았어요. 구간을 다시 잡거나 다른 영상으로 해 보세요.'],
  };
  if (n < 10 || !pos.neck || !pos.root) return empty;

  const torso = median(t.map((_, i) => Math.hypot(pos.neck.x[i] - pos.root.x[i], pos.neck.y[i] - pos.root.y[i])));
  if (!torso || Number.isNaN(torso)) return empty;

  const detection = { lWrist: 0, rWrist: 0, lAnkle: 0, rAnkle: 0 } as Record<Limb, number>;
  for (const l of LIMBS) detection[l] = conf[l].filter((c) => c >= MIN_CONF).length / n;

  const moves: Move[] = [];
  for (const l of LIMBS) {
    const { x, y } = pos[l];
    const gx = gradient(x, t);
    const gy = gradient(y, t);
    const moving = t.map((_, i) => Math.hypot(gx[i], gy[i]) / torso > MOVE_SPEED);
    let i = 0;
    while (i < n) {
      if (!moving[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < n && moving[j + 1]) j++;
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, j + 1);
      const dist = Math.hypot(x[b] - x[a], y[b] - y[a]) / torso;
      if (dist >= MIN_MOVE && !Number.isNaN(x[a]) && !Number.isNaN(x[b])) {
        moves.push({ limb: l, t0: t[a], t1: t[b], dist, dy: (y[b] - y[a]) / torso });
      }
      i = j + 1;
    }
  }
  moves.sort((a, b) => a.t0 - b.t0);

  const ry = pos.root.y;
  let descent: Descent | null = null;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(ry[i])) continue;
    let j = i;
    while (j + 1 < n && t[j + 1] - t[i] <= FALL_WINDOW) j++;
    let low = Infinity;
    for (let k = i + 1; k <= j; k++) if (!Number.isNaN(ry[k]) && ry[k] < low) low = ry[k];
    if (low <= ry[i] - FALL_DROP * torso) {
      const fallT = t[i];
      let peak = -Infinity;
      for (let k = 0; k < n; k++) if (t[k] >= fallT - 3 && t[k] <= fallT && !Number.isNaN(ry[k]) && ry[k] > peak) peak = ry[k];
      let still = 0;
      let k = i;
      while (k > 0 && !Number.isNaN(ry[k - 1]) && Math.abs(ry[k - 1] - peak) < 0.3 * torso) {
        k--;
        still = fallT - t[k];
      }
      let lastMove: Move | undefined;
      for (const m of moves) {
        if (m.t1 <= fallT + 0.1 && m.t1 >= fallT - 2 && m.dy > -0.5 && (!lastMove || m.t1 > lastMove.t1)) lastMove = m;
      }
      descent = { t: fallT, still, kind: still >= STILL ? 'send' : 'fall', lastMove };
      break;
    }
  }

  const elbow = { l: NaN, r: NaN };
  for (const side of ['l', 'r'] as const) {
    const angles = t.map((_, i) => angleAt(pos[`${side}Shoulder`], pos[`${side}Elbow`], pos[`${side}Wrist`], i)).filter((a) => !Number.isNaN(a));
    elbow[side] = angles.length ? angles.filter((a) => a < BENT_ANGLE).length / angles.length : NaN;
  }
  const elbowBent = { l: Number.isNaN(elbow.l) ? 0 : elbow.l, r: Number.isNaN(elbow.r) ? 0 : elbow.r };

  const notes: string[] = [];
  const sec = (v: number) => `${v.toFixed(1)}초`;
  if (descent) {
    if (descent.kind === 'fall') {
      const lm = descent.lastMove;
      notes.push(
        `${sec(descent.t)}에 떨어졌어요.` + (lm ? ` 직전에 ${LIMB_KO[lm.limb]}을 ${arrow(lm.dy)}로 옮기고 있었어요 (${sec(lm.t0)}~${sec(lm.t1)}).` : ''),
      );
      const at = lm ? lm.t0 : descent.t;
      const ai = t.findIndex((v) => v >= at);
      if (ai > 0 && !Number.isNaN(ry[ai])) {
        let k = ai;
        while (k > 0 && !Number.isNaN(ry[k - 1]) && Math.abs(ry[k - 1] - ry[ai]) < PLATEAU_BAND * torso) k--;
        const plateau = t[ai] - t[k];
        if (plateau >= PLATEAU_MIN) {
          notes.push(`떨어지기 전 ${Math.round(plateau)}초 동안 골반이 거의 안 올라갔어요. 손을 뻗기 전에 발을 올릴 자리가 있었나요?`);
        }
      }
      if (lm && (lm.limb === 'lWrist' || lm.limb === 'rWrist') && lm.dy > 0.1) {
        const footUp = moves.some((m) => (m.limb === 'lAnkle' || m.limb === 'rAnkle') && m.dy > 0.1 && m.t1 >= lm.t0 - 2 && m.t1 <= lm.t0 + 0.1);
        if (!footUp) notes.push('뻗기 전 2초 안에 발을 위로 옮기지 않았어요.');
      }
    } else {
      notes.push(`최고점에서 ${sec(descent.still)} 머문 뒤 내려왔어요. 완등으로 볼게요.`);
    }
  } else {
    notes.push('구간 안에서 내려오는 순간을 못 찾았어요. 구간 끝을 조금 늘려 보세요.');
  }
  for (const side of ['l', 'r'] as const) {
    const wrist: Limb = side === 'l' ? 'lWrist' : 'rWrist';
    if (elbowBent[side] >= BENT_RATIO && detection[wrist] >= LOW_DETECTION) {
      notes.push(`${side === 'l' ? '왼' : '오른'}팔을 굽힌 채 버틴 시간이 ${Math.round(elbowBent[side] * 100)}%예요. 팔을 펴고 쉬는 자세가 있었는지 봐 주세요.`);
    }
  }
  const hidden = LIMBS.filter((l) => detection[l] < LOW_DETECTION).map((l) => LIMB_KO[l]);
  if (hidden.length) notes.push(`${hidden.join('·')}은 절반 넘게 안 보였어요. 그쪽 관찰은 믿기 어려워요.`);

  return { start, end, frames: n, torso, detection, moves, descent, elbowBent, notes };
}

export function clipKey(start: number, end: number) {
  return `${start.toFixed(1)}-${end.toFixed(1)}`;
}
