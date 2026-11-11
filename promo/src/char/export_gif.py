"""Exports promo/src/char/prayer-morph.html as a GIF by freezing its animations frame by frame.

    python promo/src/char/export_gif.py      -> promo/prayer-morph.gif
"""
import shutil
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build  # noqa: E402

DURATION_MS = 7000
FPS = 12
W, H = 960, 480


def shoot(i, profile_root, frames_dir):
    t = round(i * 1000 / FPS)
    out = frames_dir / f'f{i:03d}.png'
    profile = Path(profile_root) / f'p{i % 6}'  # a few profiles so shots can run side by side
    build.subprocess.run([
        build.EDGE, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={profile}',
        '--force-device-scale-factor=1', f'--window-size={W},{H}', '--virtual-time-budget=1500',
        f'--screenshot={out}', f'http://127.0.0.1:{build.PORT}/promo/src/char/prayer-morph.html?t={t}',
    ], check=True, capture_output=True, timeout=120)
    return out


def main():
    frames_dir = Path(tempfile.mkdtemp(prefix='nova-frames-'))
    profiles = tempfile.mkdtemp(prefix='nova-prof-')
    httpd = build.serve()
    try:
        n = DURATION_MS * FPS // 1000
        with ThreadPoolExecutor(max_workers=6) as pool:
            paths = list(pool.map(lambda i: shoot(i, profiles, frames_dir), range(n)))
        frames = [Image.open(p).convert('RGB').quantize(colors=200, method=Image.Quantize.MEDIANCUT) for p in paths]
        out = HERE.parent.parent / 'prayer-morph.gif'
        frames[0].save(out, save_all=True, append_images=frames[1:], duration=round(1000 / FPS), loop=0, optimize=True, disposal=1)
        # also keep a few stills for review
        for k, i in enumerate([0, int(n * 0.16), int(n * 0.24), int(n * 0.40), int(n * 0.70)]):
            shutil.copy(paths[i], build.WORK / f'morph-still-{k}.png')
        print('wrote', out, f'{out.stat().st_size / 1e6:.1f} MB', n, 'frames')
    finally:
        httpd.shutdown()
        shutil.rmtree(frames_dir, ignore_errors=True)
        shutil.rmtree(profiles, ignore_errors=True)


if __name__ == '__main__':
    main()
