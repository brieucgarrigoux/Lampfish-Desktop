"""Builds the white-line berry (brand/logo/berry-color-whiteline.png) and the five app icons (brand/app-icon).

Usage: python src/app_icon.py
The white-line berry is the official one with its black outline turned white; the icons are 1024 px squircle plates.
"""
import os, time
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, 'brand', 'logo')
OUT = os.path.join(ROOT, 'brand', 'app-icon')
SIZE = 1024
SCALE = .68      # berry height as a share of the plate


def save(img, path):
    for _ in range(10):
        try:
            return img.save(path)
        except OSError:
            time.sleep(1.5)
    img.save(path)


def white_line(src):
    """Replaces the black outline by white, keeping the anti-aliased edges: c = (1 - w) * fill, so new = c + w * 255."""
    a = np.array(src.convert('RGBA')).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    peak = rgb.max(-1)
    fill = (peak > 90) & (alpha > 250)
    near = distance_transform_edt(~fill, return_indices=True)[1]
    w = np.clip(1 - peak / np.maximum(rgb[near[0], near[1]].max(-1), 1), 0, 1)
    w[fill] = 0
    out = np.dstack([np.clip(rgb + w[..., None] * 255, 0, 255), alpha])
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def squircle():
    ss = 2
    s = SIZE * ss
    y, x = np.mgrid[:s, :s]
    c, r = (s - 1) / 2, s / 2
    mask = (np.abs((x - c) / r) ** 4 + np.abs((y - c) / r) ** 4) <= 1
    return Image.fromarray((mask * 255).astype(np.uint8)).resize((SIZE, SIZE), Image.LANCZOS)


def plate(top, bottom, sheen=True):
    t, b = np.array(top, float), np.array(bottom, float)
    g = np.linspace(0, 1, SIZE)[:, None, None]
    img = Image.fromarray(((t * (1 - g) + b * g) * np.ones((1, SIZE, 1))).astype(np.uint8), 'RGB').convert('RGBA')
    if sheen:
        glow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse((-300, -700, 1324, 380), fill=(255, 255, 255, 18))
        img.alpha_composite(glow)
    img.putalpha(squircle())
    return img


def place(base, logo):
    logo = logo.crop(logo.getbbox())
    k = SIZE * SCALE / max(logo.size)
    logo = logo.resize((round(logo.width * k), round(logo.height * k)), Image.LANCZOS)
    base.alpha_composite(logo, ((SIZE - logo.width) // 2, (SIZE - logo.height) // 2))
    return base


if __name__ == '__main__':
    official = Image.open(os.path.join(LOGO, 'berry-color.png')).convert('RGBA')
    white_berry = Image.open(os.path.join(LOGO, 'berry-white.png')).convert('RGBA')
    line = white_line(official)
    save(line, os.path.join(LOGO, 'berry-color-whiteline.png'))
    violet = ((120, 64, 210), (74, 22, 150))
    icons = {
        'app-icon-dark': place(plate((26, 27, 36), (10, 11, 15)), line),
        'app-icon-light': place(plate((255, 255, 255), (238, 236, 246), False), official),
        'app-icon-violet': place(plate(*violet), white_berry),
        'app-icon-violet-blackline': place(plate(*violet), official),
    }
    for name, img in icons.items():
        save(img, os.path.join(OUT, name + '.png'))
    print('OK')
