"""Builds app/ui/icons.svg, the one sheet of icons of the app, and the tray images.

Usage: python src/icons.py <folder of the unpacked @phosphor-icons/core package>
Every name used in app/ui becomes a symbol: Phosphor regular from the package, or a drawing of lampfish from src/icons-own.json
(names starting with lf-, drawn on the same 256 grid). Phosphor is MIT: its license ships in app/ui.
"""
import json, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = sys.argv[1]
UI = os.path.join(ROOT, 'app', 'ui')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
TRAY = {'open': 'app-window', 'next': 'skip-forward', 'pause': 'pause', 'resume': 'play', 'themes': 'swatches', 'sounds': 'waveform', 'quit': 'sign-out'}

with open(os.path.join(ROOT, 'src', 'icons-own.json'), encoding='utf-8') as f:
    OWN = json.load(f)
PHOSPHOR = os.path.join(PKG, 'assets', 'regular')
known = lambda name: name in OWN or os.path.exists(os.path.join(PHOSPHOR, name + '.svg'))


def inner(name):
    if name in OWN:
        return OWN[name]
    with open(os.path.join(PHOSPHOR, name + '.svg'), encoding='utf-8') as f:
        return '<g fill="currentColor">' + re.sub(r'^<svg[^>]*>|</svg>\s*$', '', f.read().strip()) + '</g>'


# Named outright: a sprite reference or a call to icon(). Named in a table: any quoted word of a script that is an icon name,
# except the words below, which the scripts use as tags, events, classes or keys of a table that names another icon.
NOT_ICONS = {'angle', 'article', 'cat', 'devices', 'download', 'empty', 'function', 'gradient', 'log', 'mouse', 'option',
             'pill', 'placeholder', 'radio', 'resize', 'scroll', 'table', 'target', 'upload', 'video'}
named, listed = {}, set()
for file in sorted(os.listdir(UI)):
    if not file.endswith(('.html', '.js')):
        continue
    with open(os.path.join(UI, file), encoding='utf-8') as f:
        text = f.read()
    for m in re.finditer(r"icons\.svg#([a-z0-9-]+)|\bicon\('([a-z0-9-]+)'", text):
        named.setdefault(m.group(1) or m.group(2), file)
    if file.endswith('.js'):
        listed.update(n for n in re.findall(r"'([a-z0-9]+(?:-[a-z0-9]+)*)'", text) if n.startswith('lf-') or (n not in named and n not in NOT_ICONS and known(n)))

missing = sorted(f'{name} ({file})' for name, file in named.items() if not known(name)) + sorted(n for n in listed if not known(n))
if missing:
    sys.exit('No drawing for: ' + ', '.join(missing))
names = sorted(set(named) | listed | set(TRAY.values()))

with open(os.path.join(UI, 'icons.svg'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('<svg xmlns="http://www.w3.org/2000/svg">\n')
    for name in names:
        f.write(f'<symbol id="{name}" viewBox="0 0 256 256">{inner(name)}</symbol>\n')
    f.write('</svg>\n')
shutil.copyfile(os.path.join(PKG, 'LICENSE'), os.path.join(UI, 'PHOSPHOR-LICENSE.txt'))

out = os.path.join(UI, 'tray')
os.makedirs(out, exist_ok=True)
for key, name in TRAY.items():
    page = os.path.join(out, '_page.html')
    with open(page, 'w', encoding='utf-8') as f:
        f.write(f'<!doctype html><body style="margin:0;background:transparent"><svg width="48" height="48" viewBox="0 0 256 256" style="color:#fff">{inner(name)}</svg>')
    # A profile of its own, or Edge hands the page to a browser already open and writes nothing.
    profile = tempfile.mkdtemp()
    shot = os.path.join(profile, key + '.png')
    subprocess.run([EDGE, '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=00000000', f'--user-data-dir={profile}', f'--screenshot={shot}', '--window-size=48,48', 'file:///' + page.replace('\\', '/')], capture_output=True)
    os.remove(page)
    if not os.path.exists(shot):
        sys.exit(f'Edge wrote no {key}.png')
    try:
        shutil.copyfile(shot, os.path.join(out, key + '.png'))
    except PermissionError:
        sys.exit(f'tray/{key}.png is held by the tray menu: quit lampfish, then run this again')
    finally:
        shutil.rmtree(profile, ignore_errors=True)
print(len(names), 'icons,', len(TRAY), 'tray images')
