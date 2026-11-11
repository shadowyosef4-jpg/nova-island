"""Renders single island states (640x320 window, 2x) for a quick visual check.

    python promo/src/check.py privacy kbd caps meet-now meet-slide
Output: promo/src/out/check-<state>.png
"""
import shutil
import sys
import tempfile

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
import build  # noqa: E402

# short-lived toasts must be caught before they end (virtual time runs the whole budget)
BUDGET = {'privacy-toast': 2200, 'kbd': 1500, 'caps': 1500, 'meet-slide': 2500, 'ramadan': 3000, 'shot': 2000, 'focus': 2500, 'focus-tab': 2500, 'ramadan-tab': 3000, 'eyes': 4500, 'addr-idle': 1500, 'addr-media': 2000, 'addr-line': 1500, 'scene-prayer': 2500, 'scene-water': 2500, 'scene-focus': 2500, 'scene-focus-end': 2500, 'prayer-nova-card': 2500, 'prayer-nova-pill': 2500, 'eyes-happy': 1500, 'welcome': 2500, 'care': 2500, 'net-off': 1800, 'clip-url': 1500, 'clip-math': 1500, 'clip-color': 1500, 'celebrate': 600}

if __name__ == '__main__':
    build.WORK.mkdir(exist_ok=True)
    build.stage_page('index.html', 'island.html', ['promo/src/mock.js', 'promo/src/pre.js'], ['promo/src/drive.js'], '../../')
    httpd = build.serve()
    profile = tempfile.mkdtemp(prefix='nova-check-')
    try:
        for st in sys.argv[1:]:
            out = build.WORK / f'check-{st}.png'
            url = f'http://127.0.0.1:{build.PORT}/promo/src/island.html?state={st}&bd=promo/src/out/01-hero-bd0.png'
            build.subprocess.run([
                build.EDGE, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={profile}',
                '--force-device-scale-factor=2', f'--window-size={build.WIN_W},{build.WIN_H}', f'--virtual-time-budget={BUDGET.get(st, 12000)}',
                '--default-background-color=1a1a24ff', f'--screenshot={out}', url,
            ], check=True, capture_output=True, timeout=120)
            print('wrote', out)
    finally:
        httpd.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
