import math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops

OUT = sys.argv[1]
S = 1024  # supersample
F = 512   # final

def catmull(points, n=24):
    pts = []
    k = len(points)
    for i in range(k):
        p0, p1, p2, p3 = points[(i - 1) % k], points[i], points[(i + 1) % k], points[(i + 2) % k]
        for t in [j / n for j in range(n)]:
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            pts.append((x * S, y * S))
    return pts

def polygon(points):
    return [(x * S, y * S) for x, y in points]

# shapes in unit coords (0..1), y down. body polygon + optional holes (circles: cx, cy, r) + flat faces
HOLDS = {
    'jug': dict(body=catmull([(0.12, 0.42), (0.3, 0.26), (0.55, 0.24), (0.8, 0.3), (0.9, 0.5), (0.8, 0.72), (0.55, 0.8), (0.3, 0.76), (0.14, 0.62)]), holes=[(0.5, 0.56, 0.045)]),
    'sloper': dict(body=catmull([(0.1, 0.6), (0.22, 0.4), (0.5, 0.3), (0.78, 0.4), (0.9, 0.6), (0.8, 0.72), (0.5, 0.76), (0.2, 0.72)]), holes=[(0.5, 0.6, 0.04)]),
    'crimp': dict(body=catmull([(0.1, 0.5), (0.2, 0.42), (0.5, 0.4), (0.8, 0.42), (0.9, 0.5), (0.85, 0.6), (0.5, 0.64), (0.15, 0.6)]), holes=[(0.5, 0.53, 0.035)]),
    'pinch': dict(body=catmull([(0.4, 0.18), (0.56, 0.16), (0.64, 0.3), (0.62, 0.55), (0.6, 0.8), (0.48, 0.86), (0.38, 0.78), (0.36, 0.5)]), holes=[(0.5, 0.5, 0.04)]),
    'pocket': dict(body=catmull([(0.18, 0.4), (0.4, 0.26), (0.65, 0.28), (0.84, 0.44), (0.82, 0.68), (0.6, 0.78), (0.34, 0.76), (0.16, 0.6)]), holes=[(0.38, 0.48, 0.07), (0.6, 0.5, 0.07)]),
    'volume': dict(body=polygon([(0.12, 0.78), (0.5, 0.2), (0.88, 0.78)]), holes=[(0.5, 0.62, 0.04)], faces=[polygon([(0.5, 0.2), (0.88, 0.78), (0.5, 0.78)])]),
    'foot': dict(body=catmull([(0.3, 0.48), (0.44, 0.4), (0.62, 0.42), (0.7, 0.52), (0.64, 0.62), (0.46, 0.64), (0.32, 0.58)]), holes=[(0.5, 0.52, 0.03)]),
    'edge': dict(body=polygon([(0.14, 0.62), (0.2, 0.4), (0.86, 0.3), (0.9, 0.5), (0.84, 0.66), (0.2, 0.7)]), holes=[(0.52, 0.5, 0.04)], faces=[polygon([(0.2, 0.4), (0.86, 0.3), (0.84, 0.44), (0.18, 0.52)])]),
    'macro': dict(body=catmull([(0.1, 0.5), (0.18, 0.3), (0.36, 0.22), (0.5, 0.3), (0.66, 0.2), (0.86, 0.3), (0.9, 0.55), (0.78, 0.76), (0.5, 0.82), (0.22, 0.74)]), holes=[(0.36, 0.52, 0.04), (0.66, 0.5, 0.04)]),
    'dual': dict(body=catmull([(0.1, 0.5), (0.2, 0.36), (0.4, 0.34), (0.5, 0.44), (0.6, 0.34), (0.82, 0.36), (0.9, 0.52), (0.8, 0.66), (0.6, 0.68), (0.5, 0.6), (0.4, 0.68), (0.2, 0.66)]), holes=[(0.3, 0.52, 0.04), (0.7, 0.52, 0.04)]),
    'screwon': dict(body=catmull([(0.3, 0.36), (0.5, 0.32), (0.7, 0.36), (0.74, 0.5), (0.7, 0.64), (0.5, 0.68), (0.3, 0.64), (0.26, 0.5)]), holes=[(0.42, 0.5, 0.03), (0.58, 0.5, 0.03)]),
    'cube': dict(body=polygon([(0.5, 0.16), (0.86, 0.36), (0.86, 0.72), (0.5, 0.88), (0.14, 0.72), (0.14, 0.36)]), holes=[(0.5, 0.58, 0.04)], faces=[polygon([(0.5, 0.16), (0.86, 0.36), (0.5, 0.52), (0.14, 0.36)]), polygon([(0.5, 0.52), (0.86, 0.36), (0.86, 0.72), (0.5, 0.88)])]),
}

def mask_from(draw_fn):
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)
    draw_fn(d)
    return m

def erode(m, px):
    if px <= 0:
        return m
    return m.filter(ImageFilter.GaussianBlur(px * 0.7)).point(lambda v: 255 if v >= 252 else 0)

def shift(m, dx, dy):
    return ImageChops.offset(m, dx, dy)

def render(name, spec):
    body = mask_from(lambda d: d.polygon(spec['body'], fill=255))
    alpha = Image.new('L', (S, S), 0)
    # base
    alpha.paste(215, mask=body)
    # faces (flat volumes): darker/lighter planes
    for i, face in enumerate(spec.get('faces', [])):
        fm = mask_from(lambda d, f=face: d.polygon(f, fill=255))
        fm = ImageChops.multiply(fm, body)
        alpha.paste(150 if i == 0 else 255, mask=fm)
    if not spec.get('faces'):
        # highlight: eroded body shifted up-left
        hi = ImageChops.multiply(erode(body, 45), shift(erode(body, 20), -35, -35))
        hi = hi.filter(ImageFilter.GaussianBlur(14))
        alpha = ImageChops.add(alpha, Image.eval(hi, lambda v: 0))  # no-op keep type
        a = alpha.load(); h = hi.load()
        # blend lighter: alpha = alpha - hi*0.4
        hi_scaled = Image.eval(hi, lambda v: int(v * 0.42))
        alpha = ImageChops.subtract(alpha, hi_scaled)
        # shadow rim bottom-right
        rim = ImageChops.subtract(body, shift(erode(body, 5), -11, -11))
        rim = ImageChops.multiply(rim, body).filter(ImageFilter.GaussianBlur(5))
        alpha = ImageChops.lighter(alpha, ImageChops.multiply(rim, Image.new('L', (S, S), 255)))
    # bolt holes: dark ring + light center
    for (cx, cy, r) in spec.get('holes', []):
        ring = mask_from(lambda d: d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=255))
        inner = mask_from(lambda d: d.ellipse([(cx - r * 0.62) * S, (cy - r * 0.62) * S, (cx + r * 0.62) * S, (cy + r * 0.62) * S], fill=255))
        alpha.paste(255, mask=ring)
        alpha.paste(70, mask=inner)
    # keep only inside body
    alpha = ImageChops.multiply(alpha, body)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.putalpha(alpha)
    out = out.resize((F, F), Image.LANCZOS)
    out.save(os.path.join(OUT, f'{name}.png'))

    # outline (unvisited): dashed stroke + faint fill
    stroke = ImageChops.subtract(body, erode(body, 8))
    # dash by polar angle around centroid
    bbox = body.getbbox(); cx = (bbox[0] + bbox[2]) / 2; cy = (bbox[1] + bbox[3]) / 2
    dash = Image.new('L', (S, S), 0)
    dd = ImageDraw.Draw(dash)
    steps = 28
    for i in range(steps):
        if i % 2 == 0:
            a0 = 360 / steps * i; a1 = a0 + 360 / steps * 0.72
            dd.pieslice([cx - S, cy - S, cx + S, cy + S], a0, a1, fill=255)
    stroke = ImageChops.multiply(stroke, dash)
    oalpha = Image.new('L', (S, S), 0)
    oalpha.paste(60, mask=erode(body, 8))
    oalpha = ImageChops.lighter(oalpha, stroke)
    o = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    o.putalpha(oalpha)
    o = o.resize((F, F), Image.LANCZOS)
    o.save(os.path.join(OUT, 'outline', f'{name}.png'))

os.makedirs(os.path.join(OUT, 'outline'), exist_ok=True)
for name, spec in HOLDS.items():
    render(name, spec)

# contact sheet: tinted preview
colors = ['#e63946', '#f4743b', '#2b7fd3', '#2aa84a', '#8f3fd8', '#12a3a0']
names = list(HOLDS.keys())
cell = 180
sheet = Image.new('RGB', (cell * 6, cell * 4), '#f5f6f7')
for i, name in enumerate(names):
    for row, (folder, color) in enumerate([('', colors[i % len(colors)]), ('outline', '#9ca3af')]):
        img = Image.open(os.path.join(OUT, folder, f'{name}.png')).convert('RGBA').resize((cell - 20, cell - 20), Image.LANCZOS)
        tint = Image.new('RGBA', img.size, color)
        tint.putalpha(img.getchannel('A'))
        x = (i % 6) * cell + 10; y = ((i // 6) * 2 + row) * cell + 10
        sheet.paste(tint, (x, y), tint)
sheet.save(os.path.join(OUT, 'sheet.png'))
print('done', len(names))
