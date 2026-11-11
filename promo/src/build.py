"""Renders the promo images in promo/ from the scenes in promo/src/scenes.

Every island in a scene is the real island UI (index.html + renderer + views) running in a
640x320 frame, the size of its window, driven into a state by drive.js. Its frosted glass is
made the same way as in the app: a capture of what is behind it (cropped from a background-only
render of the scene) is handed to it as the backdrop.

    python promo/src/build.py            # all scenes
    python promo/src/build.py 03         # scenes whose name starts with 03
    python promo/src/build.py en         # the English set, written to promo/en/
"""
import functools
import http.server
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parent
ROOT = SRC.parent.parent          # the Dynamic Nova folder (served as the web root)
OUT = SRC.parent                  # promo/
WORK = SRC / 'out'                # backdrops and intermediate renders
PORT = 8740
# headless browser for the shots: Chrome when installed (Edge's headless mode started exiting
# without rendering on this machine), else Edge
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
EDGE = CHROME if Path(CHROME).exists() else r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
W, H = 1920, 1080
WIN_W, WIN_H = 640, 320           # the island window

# x, y: top-left of the island frame on the 1920x1080 canvas; s: scale; q: drive.js parameters.
# card: optional callout card drawn behind the frame (x, y, w, h, label html).
SCENES = {
    '01-hero': {'islands': [dict(x=960 - 320 * 2.1, y=0, s=2.1, q='state=music')]},
    '02-browser': {'islands': [dict(x=960 - 320 * 2.3, y=0, s=2.3, q='state=compact')]},
    '03-downloads': {'islands': [
        dict(x=960 - 320 * 1.7, y=0, s=1.7, q='state=downloads'),
        dict(x=1030, y=861, s=1.5, q='state=dlpill',
             card=(1190, 845, 640, 150, 'وهي مصغّرة: <b>حلقة تقدّم ونسبة وسرعة</b>')),
    ]},
    '04-faith': {'islands': [
        dict(x=960 - 320 * 2.0, y=0, s=2.0, q='state=reminder&rm=' + 'البقرة ١٨٦'),
        dict(x=82, y=465, s=1.15, q='state=prayer',
             card=(90, 430, 720, 420, 'مواقيت الصلاة: <b>عدّ تنازلي وتنبيه قبل الأذان</b>')),
    ]},
    # Instagram portrait (1080x1350): the Quran Radio plugin
    'ar-radio': {
        'size': (1080, 1350),
        'islands': [
            dict(x=540 - 320 * 1.62, y=440, s=1.62, q='state=radio'),
            dict(x=540 - 320 * 1.9, y=905, s=1.9, q='state=radio-pill',
                 card=(70, 880, 940, 190, 'وهي مصغّرة: <b>الإذاعة شغّالة بجانب موعد الصلاة</b>')),
        ],
    },
    '05-control': {
        'islands': [dict(x=W - WIN_W * 2.0, y=220, s=2.0, q='state=idle&v=1&side=right&ay=160')],
        'prefs': dict(x=560, y=150, w=760, h=560, s=1.25, q='sec=faith'),
        'copy_left': True,
    },
}

# English set (promo/en/): the scenes in scenes/en-*.html. budget: virtual time for scenes whose
# states are short-lived toasts (they must still be on screen when the shot is taken).
EN = {
    'en-01-hero': {'islands': [dict(x=960 - 320 * 2.1, y=0, s=2.1, q='state=music')]},
    'en-02-nova': {
        'islands': [
            dict(x=960 - 320 * 1.9, y=0, s=1.9, q='state=scene-focus-end'),
            dict(x=1420 - 320 * 1.6, y=446, s=1.6, q='state=eyes',
                 card=(1010, 430, 820, 170, 'Looks your way <b>when your cursor comes close</b>')),
            dict(x=1420 - 320 * 1.4, y=636, s=1.4, q='state=welcome',
                 card=(1010, 630, 820, 370, 'Welcome back: <b>what you missed while away</b>')),
        ],
        'budget': 5000,
    },
    'en-03-browser': {'islands': [dict(x=960 - 320 * 2.3, y=0, s=2.3, q='state=compact')]},
    'en-04-downloads': {'islands': [
        dict(x=960 - 320 * 1.7, y=0, s=1.7, q='state=downloads'),
        dict(x=410 - 320 * 1.5, y=861, s=1.5, q='state=dlpill',
             card=(90, 845, 640, 150, 'Collapsed: <b>progress ring, percent and speed</b>')),
    ]},
    'en-05-smart': {
        'islands': [dict(x=960 - 320 * 2.2, y=0, s=2.2, q='state=clip-url')] + [
            dict(x=1420 - 320 * 1.5, y=y + 10, s=1.5, q=f'state={st}', card=(1010, y, 820, 132, label))
            for y, st, label in [
                (330, 'clip-math', 'Copy a sum, <b>get the answer</b>'),
                (482, 'clip-color', 'Copy a color, <b>see it</b>'),
                (634, 'privacy-toast', 'Knows when an app <b>uses your mic or camera</b>'),
                (786, 'shot', 'Take a screenshot, <b>keep it on the Shelf</b>'),
            ]
        ],
        'budget': 2000,
    },
    'en-06-faith': {'islands': [
        dict(x=960 - 320 * 2.0, y=0, s=2.0, q='state=reminder&rm=' + 'البقرة ١٨٦'),
        dict(x=1102, y=465, s=1.15, q='state=prayer',
             card=(1110, 430, 720, 420, 'Prayer times: <b>countdown and a heads-up before the adhan</b>')),
    ]},
    'en-07-settings': {
        'islands': [dict(x=W - WIN_W * 2.0, y=220, s=2.0, q='state=idle&v=1&side=right&ay=160')],
        'prefs': dict(x=740, y=150, w=760, h=560, s=1.25, q='sec=companion'),
        'copy_left': True,
    },
}


def serve():
    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def log_message(self, *args):
            pass

    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def stage_page(src_html, out_html, before, after, base):
    """Copy a real page, point it at the project files, and add the promo scripts."""
    html = (ROOT / src_html).read_text(encoding='utf-8')
    html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
    html = html.replace('<head>', f'<head><base href="{base}">', 1)
    # transitions off: a still frame must not be caught mid-morph (animations keep running)
    html = html.replace('</head>', '<style>*, *::before, *::after { transition: none !important; }</style></head>', 1)
    first_script = re.search(r'<script src="[^"]+"></script>', html).start()
    html = html[:first_script] + ''.join(f'<script src="{s}"></script>' for s in before) + html[first_script:]
    html = html.replace('</body>', ''.join(f'<script src="{s}"></script>' for s in after) + '</body>', 1)
    (SRC / out_html).write_text(html, encoding='utf-8')


def scene_page(name, cfg, bd=None):
    """Write the scene with its island frames (and backdrops once they exist)."""
    html = (SRC / 'scenes' / f'{name}.html').read_text(encoding='utf-8')
    parts = []
    for i, isl in enumerate(cfg['islands']):
        if 'card' in isl:
            cx, cy, cw, ch, label = isl['card']
            parts.append(f'<div class="callout" style="left:{cx}px;top:{cy}px;width:{cw}px;height:{ch}px"><div class="label">{label}</div></div>')
        q = isl['q'] + (f'&bd=promo/src/out/{bd[i]}' if bd else '')
        parts.append(f'<iframe class="isl" src="../island.html?{q}" style="left:{isl["x"]:.0f}px;top:{isl["y"]:.0f}px;transform:scale({isl["s"]})"></iframe>')
    html = html.replace('<!--ISLANDS-->', '\n'.join(parts))
    if 'prefs' in cfg:
        p = cfg['prefs']
        html = html.replace('<!--PREFS-->', f'<div class="prefs-frame" style="left:{p["x"]}px;top:{p["y"]}px;width:{p["w"]}px;height:{p["h"]}px;transform:scale({p.get("s", 1)});transform-origin:0 0">'
                            f'<iframe class="prefs" src="../prefs.html?{p["q"]}" style="width:{p["w"]}px;height:{p["h"]}px"></iframe></div>')
    if cfg.get('copy_left'):
        html = html.replace('</style>', '.copy { right: auto; left: 90px; width: 620px; }</style>', 1)
    page = f'_{name}.html'
    (SRC / 'scenes' / page).write_text(html, encoding='utf-8')
    return f'http://127.0.0.1:{PORT}/promo/src/scenes/{page}'


def shoot(url, out, scale, profile, budget=12000, size=(W, H)):
    subprocess.run([
        EDGE, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={profile}',
        f'--force-device-scale-factor={scale}', f'--window-size={size[0]},{size[1]}', f'--virtual-time-budget={budget}',
        f'--screenshot={out}', url,
    ], check=True, capture_output=True, timeout=120)


def build(name, cfg, profile):
    # 1) the scene without islands, to crop what each island sits on
    bg = WORK / f'{name}-bg.png'
    budget = cfg.get('budget', 12000)
    size = cfg.get('size', (W, H))
    shoot(scene_page(name, cfg) + '?bg=1', bg, 1, profile, budget, size)
    shot = Image.open(bg).convert('RGB')
    bds = []
    for i, isl in enumerate(cfg['islands']):
        x, y, s = isl['x'], isl['y'], isl['s']
        # a frame wider than the canvas: what's outside it is never behind the island itself
        crop = shot.crop((round(x), round(y), round(x + WIN_W * s), round(y + WIN_H * s))).resize((WIN_W, WIN_H), Image.LANCZOS)
        fn = f'{name}-bd{i}.png'
        crop.save(WORK / fn)
        bds.append(fn)
    # 2) the full scene at 2x
    final = OUT / 'en' / f'{name[3:]}.png' if name.startswith('en-') else OUT / f'{name}.png'
    final.parent.mkdir(exist_ok=True)
    shoot(scene_page(name, cfg, bds), final, 2, profile, budget, size)
    print('wrote', final, Image.open(final).size)
    # a post (Instagram) also gets its exact size
    if 'size' in cfg:
        post = final.with_name(f'{final.stem}-{size[0]}x{size[1]}.png')
        Image.open(final).convert('RGB').resize(size, Image.LANCZOS).save(post)
        print('wrote', post, size)


def main():
    WORK.mkdir(exist_ok=True)
    stage_page('index.html', 'island.html', ['promo/src/mock.js', 'promo/src/pre.js'], ['promo/src/drive.js'], '../../')
    stage_page('prefs/index.html', 'prefs.html', ['../promo/src/pmock.js'], [], '../../prefs/')
    httpd = serve()
    profile = tempfile.mkdtemp(prefix='nova-promo-')
    try:
        only = sys.argv[1:] or ['']
        for name, cfg in {**SCENES, **EN}.items():
            if any(name.startswith(o) for o in only):
                build(name, cfg, profile)
    finally:
        httpd.shutdown()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == '__main__':
    main()
