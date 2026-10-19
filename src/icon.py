"""Builds src/icon.ico and the header PNGs from the official logo (brand/logo/berry-color.png).

Usage: python src/icon.py
Sizes up to 128 px are 32-bit BMPs (read by csc and every Windows version), 256 px is a PNG.
"""
import io, os, struct, time
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'brand', 'logo', 'berry-color.png')
LOGO = os.path.join(ROOT, 'brand', 'logo')
SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def save(img, path):
    # A file open in a viewer can refuse writes for a moment.
    for _ in range(10):
        try:
            return img.save(path)
        except OSError:
            time.sleep(1.5)
    img.save(path)


def square(img, size):
    return img.resize((size, size), Image.LANCZOS)


def bmp(img):
    s = img.width
    bgra = img.convert('RGBA').tobytes('raw', 'BGRA')
    rows = b''.join(bgra[y * s * 4:(y + 1) * s * 4] for y in range(s - 1, -1, -1))
    mask = b'\x00' * (((s + 31) // 32 * 4) * s)
    header = struct.pack('<IiiHHIIiiII', 40, s, s * 2, 1, 32, 0, len(rows) + len(mask), 0, 0, 0, 0)
    return header + rows + mask


def ico(img, path):
    images = []
    for s in SIZES:
        c = square(img, s)
        if s >= 256:
            b = io.BytesIO(); c.save(b, 'PNG'); images.append((s, b.getvalue()))
        else:
            images.append((s, bmp(c)))
    out = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    for s, d in images:
        out += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(d), offset)
        offset += len(d)
    with open(path, 'wb') as f:
        f.write(out + b''.join(d for _, d in images))


if __name__ == '__main__':
    logo = Image.open(SOURCE).convert('RGBA')
    save(square(logo, 512), os.path.join(LOGO, 'logo-bramble.png'))
    save(square(logo, 192), os.path.join(LOGO, 'logo-bramble-192.png'))
    ico(logo, os.path.join(ROOT, 'src', 'icon.ico'))
    print('OK')
