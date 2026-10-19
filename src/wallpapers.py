"""Builds the native logo wallpapers from the Create template: python src/wallpapers.py

Each file is the template with its config written in, so it stays a single page that reacts to the sound,
the light and speed knobs like a wallpaper made in Create. Output: wallpapers/bramble-logo.html, bramble-dusk.html
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, 'app', 'templates', 'custom.html')
LOGO = 'https://app.example/brand/logo/berry-color.png'

SOUND = {'on': True, 'pulse': True, 'ripples': True, 'ring': True, 'vibe': True, 'vibeAmount': 15, 'particles': True, 'color': ''}

WALLPAPERS = {
    'bramble-logo': {
        'title': 'Bramble logo',
        'config': {
            'v': 2,
            'background': {'type': 'gradient', 'color': '#0a0230', 'color2': '#3d0f86', 'angle': 183, 'fit': 'cover', 'dim': 0, 'vignette': 100, 'drift': 0, 'image': None},
            'logo': {'size': 25, 'x': 50, 'y': 48, 'shadow': 60, 'float': True, 'image': LOGO},
            'title': {'text': '', 'size': 6, 'weight': 600, 'color': '#ece7f4', 'x': 50, 'y': 72, 'font': 'sans'},
            'particles': {'type': 'embers', 'color': '#b9a2ff', 'amount': 70, 'size': 150, 'speed': 130},
            'glow': {'on': True, 'color': '#8324ff', 'strength': 90},
            'sound': SOUND,
        },
    },
    'bramble-dusk': {
        'title': 'Bramble dusk',
        'config': {
            'v': 2,
            'background': {'type': 'gradient', 'color': '#12062b', 'color2': '#6b2a7a', 'angle': 200, 'fit': 'cover', 'dim': 0, 'vignette': 100, 'drift': 0, 'image': None},
            'logo': {'size': 25, 'x': 50, 'y': 48, 'shadow': 60, 'float': True, 'image': LOGO},
            'title': {'text': '', 'size': 6, 'weight': 600, 'color': '#f4e7f0', 'x': 50, 'y': 72, 'font': 'sans'},
            'particles': {'type': 'fireflies', 'color': '#ffb3e0', 'amount': 55, 'size': 120, 'speed': 100},
            'glow': {'on': True, 'color': '#ff6ec4', 'strength': 70},
            'sound': SOUND,
        },
    },
}

def main():
    template = open(TEMPLATE, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    start = "if (!params.has('preview')) fetch('config.json').then(r => r.json()).then(c => { config = c; apply(); });"
    assert start in template
    for name, item in WALLPAPERS.items():
        page = template.replace(start, "Promise.resolve().then(() => { config = %s; apply(); });" % json.dumps(item['config'], separators=(',', ':')))
        page = re.sub(r'<title>.*?</title>', '<title>' + item['title'] + '</title>', page, count=1)
        with open(os.path.join(ROOT, 'wallpapers', name + '.html'), 'w', encoding='utf-8', newline='') as f:
            f.write(page)
        print(name, len(page), 'bytes')

if __name__ == '__main__':
    main()
