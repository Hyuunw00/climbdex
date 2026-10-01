import argparse
import colorsys
import csv
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

MIN_CONF = 0.3
LIMBS = ["lWrist", "rWrist", "lAnkle", "rAnkle"]


def load(path, t0, t1):
    rows = [r for r in csv.DictReader(open(path)) if t0 <= float(r["t"]) <= t1]
    t = np.array([float(r["t"]) for r in rows])
    pts = {}
    for n in LIMBS + ["neck", "root"]:
        x = np.array([float(r[f"{n}_x"] or "nan") for r in rows])
        y = np.array([float(r[f"{n}_y"] or "nan") for r in rows])
        c = np.array([float(r[f"{n}_c"] or "0") for r in rows])
        x[c < MIN_CONF] = np.nan
        y[c < MIN_CONF] = np.nan
        pts[n] = (x, y)
    return t, pts


def rest_points(t, pts, torso, aspect, min_still=0.8, speed=0.6):
    out = []
    for n in LIMBS:
        x, y = pts[n]
        sp = np.hypot(np.gradient(x * aspect, t), np.gradient(y, t)) / torso
        still = sp < speed
        i = 0
        while i < len(t):
            if still[i] and not np.isnan(x[i]):
                j = i
                while j + 1 < len(t) and still[j + 1] and not np.isnan(x[j + 1]):
                    j += 1
                if t[j] - t[i] >= min_still:
                    out.append((n, float(np.nanmedian(x[i : j + 1])), float(np.nanmedian(y[i : j + 1])), t[i], t[j]))
                i = j + 1
            else:
                i += 1
    return out


def label(mask):
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    boxes = []
    cur = 0
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or labels[sy, sx]:
                continue
            cur += 1
            q = deque([(sy, sx)])
            labels[sy, sx] = cur
            x0 = x1 = sx
            y0 = y1 = sy
            n = 0
            while q:
                cy, cx = q.popleft()
                n += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = cur
                        q.append((ny, nx))
            boxes.append((n, x0, y0, x1, y1))
    return boxes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frame")
    ap.add_argument("csv")
    ap.add_argument("out")
    ap.add_argument("--from", dest="t0", type=float, required=True)
    ap.add_argument("--to", dest="t1", type=float, required=True)
    ap.add_argument("--hue-tol", type=float, default=0.06)
    ap.add_argument("--min-sat", type=float, default=0.3)
    ap.add_argument("--bg-tol", type=float, default=0.05)
    ap.add_argument("--min-val", type=float, default=0.25)
    ap.add_argument("--scale", type=int, default=4)
    args = ap.parse_args()

    img = Image.open(args.frame).convert("RGB")
    W, H = img.size
    aspect = W / H
    t, pts = load(args.csv, args.t0, args.t1)
    torso = np.nanmedian(np.hypot((pts["neck"][0] - pts["root"][0]) * aspect, pts["neck"][1] - pts["root"][1]))
    rests = rest_points(t, pts, torso, aspect)
    print(f"torso {torso:.3f}  rest points {len(rests)}")

    arr = np.asarray(img).astype(np.float32) / 255
    hsv = np.zeros_like(arr)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx = arr.max(-1)
    mn = arr.min(-1)
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    hsv[..., 0], hsv[..., 1], hsv[..., 2] = h, s, v

    bg_hist, bg_edges = np.histogram(h[(s > 0.15) & (v > 0.2)], bins=36, range=(0, 1))
    bg_hist = bg_hist + np.roll(bg_hist, 1) + np.roll(bg_hist, -1)
    bk = int(np.argmax(bg_hist))
    bg_hue = (bg_edges[bk] + bg_edges[bk + 1]) / 2
    not_bg = np.abs(((h - bg_hue + 0.5) % 1) - 0.5) > args.bg_tol
    print(f"background hue {bg_hue:.3f} excluded ±{args.bg_tol}")

    rad = int(0.02 * W)
    samples = []
    draw = ImageDraw.Draw(img)
    for n, x, y, ta, tb in rests:
        px, py = int(x * W), int((1 - y) * H)
        patch = hsv[max(0, py - rad) : py + rad, max(0, px - rad) : px + rad].reshape(-1, 3)
        keep = not_bg[max(0, py - rad) : py + rad, max(0, px - rad) : px + rad].reshape(-1)
        patch = patch[keep & (patch[:, 1] > args.min_sat) & (patch[:, 2] > args.min_val)]
        if len(patch):
            samples.append(patch)
        draw.ellipse([px - 10, py - 10, px + 10, py + 10], outline="white", width=3)
        draw.text((px + 12, py - 8), f"{n[0]}{'W' if 'Wrist' in n else 'A'} {ta:.0f}s", fill="white")
    if not samples:
        print("no colored samples at rest points")
        img.save(args.out)
        return
    allp = np.concatenate(samples)
    hist, edges = np.histogram(allp[:, 0], bins=36, range=(0, 1), weights=allp[:, 1])
    hist = hist + np.roll(hist, 1) + np.roll(hist, -1)
    k = int(np.argmax(hist))
    hue = (edges[k] + edges[k + 1]) / 2
    rgb = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(hue, 1, 1))
    print(f"route hue {hue:.3f} ≈ rgb {rgb}, {hist[k] / hist.sum() * 100:.0f}% of colored samples")

    dh = np.abs(((h - hue + 0.5) % 1) - 0.5)
    mask = (dh < args.hue_tol) & (s > args.min_sat) & (v > args.min_val) & not_bg
    small = mask[:: args.scale, :: args.scale]
    boxes = [bx for bx in label(small) if bx[0] >= 40]
    print(f"blobs {len(boxes)}")
    for n, x0, y0, x1, y1 in boxes:
        draw.rectangle([x0 * args.scale, y0 * args.scale, (x1 + 1) * args.scale, (y1 + 1) * args.scale], outline=rgb, width=4)
    img.save(args.out)
    print(f"-> {args.out}")


if __name__ == "__main__":
    main()
