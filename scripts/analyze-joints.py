import argparse
import csv
import math
import sys

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

LIMBS = ["lWrist", "rWrist", "lAnkle", "rAnkle"]
KO = {"lWrist": "왼손", "rWrist": "오른손", "lAnkle": "왼발", "rAnkle": "오른발"}
MIN_CONF = 0.3


def load(path):
    with open(path) as f:
        rows = list(csv.DictReader(f))
    t = np.array([float(r["t"]) for r in rows])
    names = sorted({k[:-2] for k in rows[0] if k.endswith("_x")})
    pts = {}
    for n in names:
        x = np.array([float(r[f"{n}_x"] or "nan") for r in rows])
        y = np.array([float(r[f"{n}_y"] or "nan") for r in rows])
        c = np.array([float(r[f"{n}_c"] or "0") for r in rows])
        bad = c < MIN_CONF
        x[bad] = np.nan
        y[bad] = np.nan
        pts[n] = (x, y, c)
    return t, pts


def interp(t, v, max_gap):
    v = v.copy()
    ok = ~np.isnan(v)
    if ok.sum() < 2:
        return v
    filled = np.interp(t, t[ok], v[ok])
    idx = np.where(ok)[0]
    for a, b in zip(idx[:-1], idx[1:]):
        if t[b] - t[a] > max_gap:
            filled[a + 1 : b] = np.nan
    filled[: idx[0]] = np.nan
    filled[idx[-1] + 1 :] = np.nan
    return filled


def smooth(v, k=5):
    out = v.copy()
    h = k // 2
    for i in range(len(v)):
        w = v[max(0, i - h) : i + h + 1]
        w = w[~np.isnan(w)]
        out[i] = np.median(w) if len(w) else np.nan
    return out


def angle(ax, ay, bx, by, cx, cy):
    v1 = np.stack([ax - bx, ay - by], -1)
    v2 = np.stack([cx - bx, cy - by], -1)
    dot = (v1 * v2).sum(-1)
    n = np.linalg.norm(v1, axis=-1) * np.linalg.norm(v2, axis=-1)
    return np.degrees(np.arccos(np.clip(dot / n, -1, 1)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("png")
    ap.add_argument("--aspect", type=float, default=0.75, help="width/height of the rotated frame")
    ap.add_argument("--move-speed", type=float, default=0.6, help="torso lengths per second")
    ap.add_argument("--min-move", type=float, default=0.25, help="torso lengths")
    ap.add_argument("--fall-drop", type=float, default=1.5, help="torso lengths the root drops within the window")
    ap.add_argument("--fall-window", type=float, default=0.6, help="seconds")
    ap.add_argument("--still", type=float, default=1.5, help="seconds still at the peak before descending = send")
    ap.add_argument("--from", dest="t0", type=float, default=None)
    ap.add_argument("--to", dest="t1", type=float, default=None)
    args = ap.parse_args()

    t, raw = load(args.csv)
    keep = np.ones(len(t), bool)
    if args.t0 is not None:
        keep &= t >= args.t0
    if args.t1 is not None:
        keep &= t <= args.t1
    t = t[keep]
    raw = {n: (x[keep], y[keep], c[keep]) for n, (x, y, c) in raw.items()}
    dt = np.median(np.diff(t))
    pos = {}
    for n, (x, y, c) in raw.items():
        pos[n] = (smooth(interp(t, x * args.aspect, 0.6)), smooth(interp(t, y, 0.6)))

    torso = np.nanmedian(np.hypot(pos["neck"][0] - pos["root"][0], pos["neck"][1] - pos["root"][1]))
    print(f"frames {len(t)}  {t[0]:.1f}~{t[-1]:.1f}s  dt {dt:.2f}s  torso {torso:.3f}")
    print("검출률:", "  ".join(f"{KO[l]} {np.mean(raw[l][2] >= MIN_CONF) * 100:.0f}%" for l in LIMBS))

    moves = []
    for l in LIMBS:
        x, y = pos[l]
        sp = np.hypot(np.gradient(x, t), np.gradient(y, t)) / torso
        moving = sp > args.move_speed
        i = 0
        while i < len(t):
            if moving[i]:
                j = i
                while j + 1 < len(t) and moving[j + 1]:
                    j += 1
                a, b = max(0, i - 1), min(len(t) - 1, j + 1)
                d = math.hypot(x[b] - x[a], y[b] - y[a]) / torso
                if d >= args.min_move and not (np.isnan(x[a]) or np.isnan(x[b])):
                    moves.append(dict(limb=l, t0=t[a], t1=t[b], dist=d, dy=(y[b] - y[a]) / torso, x1=x[b], y1=y[b]))
                i = j + 1
            else:
                i += 1
    moves.sort(key=lambda m: m["t0"])

    rx, ry = pos["root"]
    fall_t = None
    for i in range(len(t)):
        if np.isnan(ry[i]):
            continue
        j = i
        while j + 1 < len(t) and t[j + 1] - t[i] <= args.fall_window:
            j += 1
        later = ry[i + 1 : j + 1]
        if len(later) and np.nanmin(later) <= ry[i] - args.fall_drop * torso:
            fall_t = t[i]
            break
    if fall_t is not None:
        before = (t >= fall_t - 3) & (t <= fall_t)
        peak = np.nanmax(ry[before]) if before.any() else np.nan
        still = 0.0
        k = np.searchsorted(t, fall_t)
        while k > 0 and not np.isnan(ry[k - 1]) and abs(ry[k - 1] - peak) < 0.3 * torso:
            k -= 1
            still = fall_t - t[k]
        kind = "완등 후 하강" if still >= args.still else "낙하"
        last = None
        for m in moves:
            if m["t1"] <= fall_t + 0.1 and m["t1"] >= fall_t - 2.0 and m["dy"] > -0.5:
                if last is None or m["t1"] > last["t1"]:
                    last = m
        print(f"하강 {fall_t:.1f}s  최고점 정지 {still:.1f}s → {kind}" + (f"  직전 무브: {KO[last['limb']]} {last['t0']:.1f}~{last['t1']:.1f}s {'↑' if last['dy'] > 0.1 else '↓' if last['dy'] < -0.1 else '→'}" if last else ""))
    else:
        print("하강 없음")

    print("\n| 시각 | 사지 | 이동(몸통 배) | 위아래 |")
    print("|---|---|---|---|")
    for m in moves:
        if fall_t is not None and m["t0"] > fall_t:
            break
        print(f"| {m['t0']:.1f}~{m['t1']:.1f} | {KO[m['limb']]} | {m['dist']:.2f} | {'↑' if m['dy'] > 0.1 else '↓' if m['dy'] < -0.1 else '→'} |")

    el = {}
    for side in "lr":
        s, e, w = pos[f"{side}Shoulder"], pos[f"{side}Elbow"], pos[f"{side}Wrist"]
        el[side] = angle(s[0], s[1], e[0], e[1], w[0], w[1])
    bent = {side: np.nanmean(el[side] < 120) * 100 for side in "lr"}
    print(f"\n팔꿈치 굽힘(120° 미만) 비율: 왼 {bent['l']:.0f}%  오른 {bent['r']:.0f}%")

    for l in ["lWrist", "rWrist"]:
        x, y = pos[l]
        hip = pos["root"]
        sh = pos[l[0] + "Shoulder"]
        under = np.nanmean(y < hip[1]) * 100
        side = np.nanmean((np.abs(x - sh[0]) > 0.8 * torso) & (np.abs(y - sh[1]) < 0.4 * torso)) * 100
        print(f"{KO[l]}: 골반 아래(언더 후보) {under:.0f}%  옆으로 뻗음(사이드풀 후보) {side:.0f}%")

    fig, axes = plt.subplots(3, 1, figsize=(12, 12), gridspec_kw={"height_ratios": [2, 2, 1]})
    ax = axes[0]
    ax.plot(t, ry, "k", lw=2, label="root")
    for l, c in zip(LIMBS, ["tab:red", "tab:orange", "tab:blue", "tab:cyan"]):
        ax.plot(t, pos[l][1], c, lw=1, label=l)
    for m in moves:
        ax.axvspan(m["t0"], m["t1"], color="gray", alpha=0.15)
    if fall_t is not None:
        ax.axvline(fall_t, color="red", ls="--", label="fall")
    ax.set_ylabel("y (0=bottom)")
    ax.legend(loc="upper left", fontsize=8)
    ax.grid(alpha=0.3)

    ax = axes[1]
    ax.plot(rx, ry, "k", lw=2, label="root")
    for l, c in zip(LIMBS, ["tab:red", "tab:orange", "tab:blue", "tab:cyan"]):
        ax.plot(pos[l][0], pos[l][1], c, lw=0.8, alpha=0.7, label=l)
    ax.set_aspect("equal")
    ax.set_xlabel("x (aspect-scaled)")
    ax.set_ylabel("y")
    ax.legend(fontsize=8)
    ax.grid(alpha=0.3)

    ax = axes[2]
    ax.plot(t, el["l"], label="left elbow")
    ax.plot(t, el["r"], label="right elbow")
    ax.axhline(120, color="gray", ls=":")
    ax.set_ylabel("elbow angle")
    ax.set_xlabel("t (s)")
    ax.legend(fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(args.png, dpi=110)
    print(f"\n그림 -> {args.png}")


if __name__ == "__main__":
    main()
