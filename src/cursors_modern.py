"""Builds the smooth (non pixel-art) Bramble cursor theme: python src/cursors_modern.py

Every cursor is drawn as vectors on a 32 unit canvas, rendered at 16x then reduced, so edges are antialiased
and the alpha channel carries a soft shadow. Output: app/cursor-themes/Bramble Glass/<role>.cur|.ani
"""
import math, os, struct
from PIL import Image, ImageDraw, ImageFilter, ImageChops

import cursors

THEME = 'Bramble Glass'
SIZES = [32, 48, 64, 128]
UNITS = 32
K = 16
TOP, BOTTOM = (149, 97, 243), (90, 32, 171)

def layer():
    return Image.new('L', (UNITS * K, UNITS * K), 0)

def pt(p):
    return (p[0] * K, p[1] * K)

def grow(mask, radius):
    blurred = mask.filter(ImageFilter.GaussianBlur(radius * K / 2))
    return blurred.point(lambda v: 255 if v > 6 else 0).filter(ImageFilter.GaussianBlur(.6))

def compose(mask, accent=None):
    outline = grow(mask, 1.5)
    shadow = ImageChops.offset(outline, int(.6 * K), int(1.1 * K)).filter(ImageFilter.GaussianBlur(1.1 * K))
    canvas = Image.new('RGBA', mask.size, (0, 0, 0, 0))
    canvas.paste(Image.new('RGBA', mask.size, (20, 8, 40, 255)), mask=shadow.point(lambda v: int(v * .55)))
    canvas.paste(Image.new('RGBA', mask.size, (255, 255, 255, 255)), mask=outline)
    height = mask.size[1]
    gradient = Image.new('RGBA', mask.size)
    px = gradient.load()
    for y in range(height):
        t = y / (height - 1)
        row = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)) + (255,)
        for x in range(mask.size[0]):
            px[x, y] = row
    canvas.paste(gradient, mask=mask)
    if accent is not None:
        canvas.paste(Image.new('RGBA', mask.size, (255, 255, 255, 255)), mask=accent)
    return canvas

def arrow(offset=(0, 0)):
    ox, oy = offset
    pts = [(4, 3), (4, 22.5), (9, 18.2), (12.2, 25.5), (15.4, 24.1), (12.2, 17), (19, 17)]
    m = layer()
    ImageDraw.Draw(m).polygon([pt((x + ox, y + oy)) for x, y in pts], fill=255)
    return m

def stroke(m, points, width):
    d = ImageDraw.Draw(m)
    d.line([pt(p) for p in points], fill=255, width=int(width * K), joint='curve')
    for p in (points[0], points[-1]):
        r = width * K / 2
        d.ellipse([p[0] * K - r, p[1] * K - r, p[0] * K + r, p[1] * K + r], fill=255)

def circle(m, c, r, fill=255, width=None):
    d = ImageDraw.Draw(m)
    box = [(c[0] - r) * K, (c[1] - r) * K, (c[0] + r) * K, (c[1] + r) * K]
    if width: d.ellipse(box, outline=fill, width=int(width * K))
    else: d.ellipse(box, fill=fill)

def arc(m, c, r, start, end, width):
    box = [(c[0] - r) * K, (c[1] - r) * K, (c[0] + r) * K, (c[1] + r) * K]
    ImageDraw.Draw(m).arc(box, start, end, fill=255, width=int(width * K))

def arrowhead(m, tip, angle, size=4.2):
    a = math.radians(angle)
    left = (tip[0] - size * math.cos(a) + size * .8 * math.sin(a), tip[1] - size * math.sin(a) - size * .8 * math.cos(a))
    right = (tip[0] - size * math.cos(a) - size * .8 * math.sin(a), tip[1] - size * math.sin(a) + size * .8 * math.cos(a))
    ImageDraw.Draw(m).polygon([pt(tip), pt(left), pt(right)], fill=255)

def double_arrow(angle, length=9.5):
    m = layer()
    c = 16
    a = math.radians(angle)
    dx, dy = math.cos(a) * length, math.sin(a) * length
    stroke(m, [(c - dx, c - dy), (c + dx, c + dy)], 2.2)
    arrowhead(m, (c + dx + math.cos(a) * 2, c + dy + math.sin(a) * 2), angle)
    arrowhead(m, (c - dx - math.cos(a) * 2, c - dy - math.sin(a) * 2), angle + 180)
    return m

def glyph(m, rows, origin, cell=1.5):
    """Tiny filled badge drawn from a list of strings, used for the ? of Help."""
    d = ImageDraw.Draw(m)
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == '#':
                d.rectangle([pt((origin[0] + i * cell, origin[1] + j * cell)), pt((origin[0] + (i + 1) * cell, origin[1] + (j + 1) * cell))], fill=255)

def spinner(m, c, r, step, steps=12, width=2.4):
    arc(m, c, r, step * 360 / steps - 90, step * 360 / steps + 120 - 90, width)

def build():
    c = {}
    c['Arrow'] = (arrow(), (4, 3))
    m = arrow()
    circle(m, (23.5, 9.5), 6.4)
    hole = layer()
    arc(hole, (23.5, 7.8), 2.2, 180, 40, 1.5)
    stroke(hole, [(24.3, 9.6), (23.5, 11.4)], 1.5)
    circle(hole, (23.5, 13.4), .85)
    c['Help'] = (ImageChops.subtract(m, hole), (4, 3))
    c['AppStarting'] = ('starting', (4, 3))
    c['Wait'] = ('wait', (16, 16))

    m = layer()
    stroke(m, [(16, 4), (16, 12.5)], 2); stroke(m, [(16, 19.5), (16, 28)], 2)
    stroke(m, [(4, 16), (12.5, 16)], 2); stroke(m, [(19.5, 16), (28, 16)], 2)
    circle(m, (16, 16), 1.6)
    c['Crosshair'] = (m, (16, 16))

    m = layer()
    stroke(m, [(16, 6), (16, 26)], 2)
    stroke(m, [(11.5, 5), (20.5, 5)], 2); stroke(m, [(11.5, 27), (20.5, 27)], 2)
    c['IBeam'] = (m, (16, 16))

    m = layer()
    d = ImageDraw.Draw(m)
    d.polygon([pt(p) for p in [(5, 27), (6, 21), (21, 6), (26, 11), (11, 26)]], fill=255)
    c['NWPen'] = (m, (5, 27))

    m = layer()
    circle(m, (16, 16), 11, width=3.2)
    stroke(m, [(8.5, 8.5), (23.5, 23.5)], 3.2)
    c['No'] = (m, (16, 16))

    c['SizeNS'] = (double_arrow(90), (16, 16))
    c['SizeWE'] = (double_arrow(0), (16, 16))
    c['SizeNWSE'] = (double_arrow(45), (16, 16))
    c['SizeNESW'] = (double_arrow(-45), (16, 16))

    m = layer()
    stroke(m, [(5, 16), (27, 16)], 2.2); stroke(m, [(16, 5), (16, 27)], 2.2)
    for tip, ang in (((16, 2.5), -90), ((16, 29.5), 90), ((2.5, 16), 180), ((29.5, 16), 0)):
        arrowhead(m, tip, ang)
    c['SizeAll'] = (m, (16, 16))

    m = layer()
    stroke(m, [(16, 9), (16, 28)], 2.4)
    arrowhead(m, (16, 2.5), -90, 5.5)
    c['UpArrow'] = (m, (16, 3))

    m = layer()
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([pt((11, 3)), pt((16.2, 18))], radius=2.6 * K, fill=255)
    d.rounded_rectangle([pt((16.2, 11)), pt((19.8, 21))], radius=1.8 * K, fill=255)
    d.rounded_rectangle([pt((19.8, 12.5)), pt((23.4, 21))], radius=1.8 * K, fill=255)
    d.rounded_rectangle([pt((23.4, 14)), pt((27, 22))], radius=1.8 * K, fill=255)
    d.rounded_rectangle([pt((9, 15)), pt((27, 29))], radius=5 * K, fill=255)
    d.polygon([pt(p) for p in [(9.5, 17), (5, 14.5), (4.2, 17), (9.5, 24)]], fill=255)
    c['Hand'] = (m, (13.5, 3))

    m = arrow(); circle(m, (24, 10), 5)
    stroke(m, [(24, 14), (24, 22)], 1.8)
    c['Pin'] = (m, (4, 3))

    m = arrow(); circle(m, (24, 8), 3.4)
    arc(m, (24, 24), 6.5, 180, 360, 3)
    c['Person'] = (m, (4, 3))
    return c

def frames_for(value):
    if value == 'wait':
        frames = []
        for i in range(12):
            m = layer()
            circle(m, (16, 16), 11, width=3)
            arc_m = layer()
            spinner(arc_m, (16, 16), 11, i)
            frames.append(compose(m, arc_m))
        return frames
    if value == 'starting':
        frames = []
        for i in range(12):
            ring = layer()
            circle(ring, (23, 23), 5.5, width=2.2)
            arc_m = layer()
            spinner(arc_m, (23, 23), 5.5, i, width=2.2)
            frames.append(compose(ImageChops.lighter(arrow(), ring), arc_m))
        return frames
    return [compose(value)]

def png_bmp(image):
    n = image.size[0]
    pixels = bytearray()
    px = image.load()
    for y in range(n - 1, -1, -1):
        for x in range(n):
            r, g, b, a = px[x, y]
            pixels += bytes((b, g, r, a))
    stride = ((n + 31) // 32) * 4
    mask = bytearray()
    for y in range(n - 1, -1, -1):
        bits = bytearray(stride)
        for x in range(n):
            if px[x, y][3] == 0: bits[x // 8] |= 0x80 >> (x % 8)
        mask += bits
    header = struct.pack('<IiiHHIIiiII', 40, n, n * 2, 1, 32, 0, len(pixels) + len(mask), 0, 0, 0, 0)
    return header + bytes(pixels) + bytes(mask)

def cur(image, hotspot, sizes):
    images = []
    for n in sizes:
        small = image.resize((n, n), Image.LANCZOS)
        images.append((n, round(hotspot[0] * n / UNITS), round(hotspot[1] * n / UNITS), png_bmp(small)))
    head = struct.pack('<HHH', 0, 2, len(images))
    offset = 6 + 16 * len(images)
    entries, data = b'', b''
    for n, hx, hy, d in images:
        entries += struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, hx, hy, len(d), offset + len(data))
        data += d
    return head + entries + data

def ani(images, hotspot, sizes, jiffies=4):
    anih = struct.pack('<IIIIIIIII', 36, len(images), len(images), 0, 0, 0, 0, jiffies, 1)
    body = b'fram' + b''.join(cursors.chunk(b'icon', cur(i, hotspot, sizes)) for i in images)
    riff = b'ACON' + cursors.chunk(b'anih', anih) + cursors.chunk(b'LIST', body)
    return b'RIFF' + struct.pack('<I', len(riff)) + riff

def main():
    folder = os.path.join(cursors.OUTPUT, THEME)
    os.makedirs(folder, exist_ok=True)
    drawings = build()
    for role, (value, hotspot) in drawings.items():
        images = frames_for(value)
        if len(images) > 1:
            open(os.path.join(folder, role + '.ani'), 'wb').write(ani(images, hotspot, SIZES))
        else:
            open(os.path.join(folder, role + '.cur'), 'wb').write(cur(images[0], hotspot, SIZES))
    print(THEME, len(drawings), 'cursors')

if __name__ == '__main__':
    main()
