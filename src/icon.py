"""Rebuilds src/icon.ico from an icon whose frames are all PNG: python src/icon.py <source.ico>

Sizes up to 128 px become 32-bit BMPs (read by csc and every Windows version), 256 px stays a PNG.
"""
import io, os, struct, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def frames(path):
    with open(path, 'rb') as f:
        data = f.read()
    for i in range(struct.unpack('<H', data[4:6])[0]):
        size, offset = struct.unpack('<II', data[6 + 16 * i + 8:6 + 16 * i + 16])
        yield Image.open(io.BytesIO(data[offset:offset + size])).convert('RGBA')


def bmp(img):
    s = img.width
    bgra = img.tobytes('raw', 'BGRA')
    rows = b''.join(bgra[y * s * 4:(y + 1) * s * 4] for y in range(s - 1, -1, -1))
    mask = b'\x00' * (((s + 31) // 32 * 4) * s)
    header = struct.pack('<IiiHHIIiiII', 40, s, s * 2, 1, 32, 0, len(rows) + len(mask), 0, 0, 0, 0)
    return header + rows + mask


def ico(source, path):
    images = []
    for f in frames(source):
        if f.width >= 256:
            b = io.BytesIO(); f.save(b, 'PNG'); images.append((f.width, b.getvalue()))
        else:
            images.append((f.width, bmp(f)))
    out = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    for s, d in images:
        out += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(d), offset)
        offset += len(d)
    with open(path, 'wb') as f:
        f.write(out + b''.join(d for _, d in images))


if __name__ == '__main__':
    ico(sys.argv[1], os.path.join(ROOT, 'src', 'icon.ico'))
    print('OK')
