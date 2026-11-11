"""Draws the artwork used in the promo scenes (album covers, a video frame) and copies fonts."""
import math
import random
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
ASSETS = HERE / 'assets'
ASSETS.mkdir(exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, top, bottom, angle=False):
    w, h = size
    img = Image.new('RGB', size)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / w * 0.5 + y / h * 0.5) if angle else y / h
            px[x, y] = lerp(top, bottom, t)
    return img


def glow(img, xy, r, color, alpha=170):
    # blur only the mask: blurring a transparent-black layer would darken the edges
    mask = Image.new('L', img.size, 0)
    x, y = xy
    ImageDraw.Draw(mask).ellipse((x - r, y - r, x + r, y + r), fill=alpha)
    mask = mask.filter(ImageFilter.GaussianBlur(r * 0.45))
    img.paste(Image.new('RGB', img.size, color), (0, 0), mask)


def album_cover():
    """Warm sunset cover with concentric rings: reads well at 20px and at 120px."""
    s = 600
    img = gradient((s, s), (255, 94, 98), (88, 28, 135), angle=True)
    glow(img, (420, 170), 220, (255, 196, 92), 220)
    glow(img, (120, 470), 200, (64, 120, 255), 160)
    d = ImageDraw.Draw(img, 'RGBA')
    for i, r in enumerate(range(60, 420, 34)):
        d.ellipse((300 - r, 330 - r, 300 + r, 330 + r), outline=(255, 255, 255, max(14, 70 - i * 6)), width=3)
    d.ellipse((262, 292, 338, 368), fill=(255, 255, 255, 235))
    d.ellipse((290, 320, 310, 340), fill=(120, 40, 120, 255))
    img.save(ASSETS / 'cover.png')
    img.resize((160, 160), Image.LANCZOS).save(ASSETS / 'cover-thumb.png')


def video_frame():
    """Mountain lake at golden hour for the browser and mini player."""
    w, h = 1600, 900
    img = gradient((w, h), (255, 170, 120), (90, 70, 150))
    glow(img, (1080, 360), 260, (255, 226, 160), 255)
    d = ImageDraw.Draw(img, 'RGBA')
    rnd = random.Random(7)

    def ridge(base, amp, color, seed):
        r = random.Random(seed)
        pts = [(0, h)]
        x = 0
        y = base
        while x <= w:
            y = base + math.sin(x / 210 + seed) * amp + r.uniform(-amp * .35, amp * .35)
            pts.append((x, y))
            x += 40
        pts.append((w, h))
        d.polygon(pts, fill=color)

    ridge(470, 70, (120, 82, 150, 255), 1)
    ridge(540, 60, (84, 58, 120, 255), 2)
    ridge(610, 45, (52, 38, 86, 255), 3)
    # lake with the sun's reflection
    d.rectangle((0, 650, w, h), fill=(40, 34, 78, 255))
    for i in range(60):
        y = 660 + i * 4
        half = 160 - i * 2 + rnd.randint(-20, 20)
        d.line((1080 - half, y, 1080 + half, y), fill=(255, 214, 150, max(0, 150 - i * 3)), width=2)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(ASSETS / 'video.jpg', quality=92)


def fonts():
    src = Path('M:/IDM Nova/node_modules/@fontsource/ibm-plex-sans-arabic/files')
    for wgt in (400, 500, 600, 700):
        name = f'ibm-plex-sans-arabic-arabic-{wgt}-normal.woff2'
        if (src / name).exists():
            shutil.copy(src / name, ASSETS / f'plex-arabic-{wgt}.woff2')


if __name__ == '__main__':
    album_cover()
    video_frame()
    fonts()
    print('assets:', sorted(p.name for p in ASSETS.iterdir()))
