"""Builds app/ui/phosphor-data.js and the tray images from the icons named in app/ui/phosphor.js.

Usage: python src/phosphor.py <folder of the unpacked @phosphor-icons/core package>
Icons are the regular weight, the closest to the stroke of the other icons of the app. Phosphor is MIT: its license ships in app/ui.
"""
import json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = sys.argv[1]
UI = os.path.join(ROOT, 'app', 'ui')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
TRAY = {'open': 'app-window', 'next': 'skip-forward', 'pause': 'pause', 'resume': 'play', 'themes': 'palette', 'sounds': 'waveform', 'quit': 'sign-out'}


def inner(name):
    with open(os.path.join(PKG, 'assets', 'regular', name + '.svg'), encoding='utf-8') as f:
        return re.sub(r'^<svg[^>]*>|</svg>\s*$', '', f.read().strip())


with open(os.path.join(UI, 'phosphor.js'), encoding='utf-8') as f:
    names = sorted(set(re.findall(r":\s*'([a-z][a-z0-9-]*)'", f.read())))
data = {n: inner(n) for n in names}
with open(os.path.join(UI, 'phosphor-data.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write("'use strict';\n\nconst PHOSPHOR = " + json.dumps(data, separators=(',', ':')) + ';\n')
shutil.copyfile(os.path.join(PKG, 'LICENSE'), os.path.join(UI, 'PHOSPHOR-LICENSE.txt'))

out = os.path.join(UI, 'tray')
os.makedirs(out, exist_ok=True)
for key, name in TRAY.items():
    page = os.path.join(out, '_page.html')
    with open(page, 'w', encoding='utf-8') as f:
        f.write(f'<!doctype html><body style="margin:0;background:transparent"><svg width="48" height="48" viewBox="0 0 256 256" fill="#fff">{inner(name)}</svg>')
    png = os.path.join(out, key + '.png')
    subprocess.run([EDGE, '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=00000000', f'--screenshot={png}', '--window-size=48,48', 'file:///' + page.replace('\\', '/')], capture_output=True)
    os.remove(page)
print(len(names), 'icons,', len(TRAY), 'tray images')
