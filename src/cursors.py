"""Builds Lampfish's pixel-art cursor themes: python src/cursors.py

Each cursor is drawn on a 16 x 16 grid (one letter per cell), then scaled without smoothing to 16, 32, 48, 64, 96
and 128 px in a single file, so Windows picks the size matching the pointer size setting.
Hotspots are given in grid units measured from the top left edge, so they land on the same point at every size.
Output: app/cursor-themes/<theme>/<role>.cur|.ani
"""
import math, os, struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, 'app', 'cursor-themes')
SCALES = [1, 2, 3, 4, 6, 8]
SCALES_ANI = [2, 3, 4, 8]  # Windows refuses to load an .ani frame with more than four sizes.

TINTS = {
    'Lampfish Violet': {'K': (8, 1, 26), 'P': (136, 87, 224), 'L': (185, 157, 255), 'D': (90, 32, 171)},
    'Lampfish Snow':  {'K': (55, 12, 111), 'P': (245, 244, 251), 'L': (255, 255, 255), 'D': (204, 197, 232)},
    'Lampfish Night': {'K': (185, 157, 255), 'P': (24, 16, 42), 'L': (61, 42, 101), 'D': (4, 2, 11)},
}

def grid(rows):
    g = [list(r.ljust(16, '.')[:16]) for r in rows]
    while len(g) < 16: g.append(['.'] * 16)
    return g

def empty():
    return [['.'] * 16 for _ in range(16)]

def outline(g):
    r = [row[:] for row in g]
    for y in range(16):
        for x in range(16):
            if g[y][x] != '.': continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                X, Y = x + dx, y + dy
                if 0 <= X < 16 and 0 <= Y < 16 and g[Y][X] not in '.K':
                    r[y][x] = 'K'; break
    return r

def overlay(base, pattern, ox, oy):
    r = [row[:] for row in base]
    for y, row in enumerate(pattern):
        for x, c in enumerate(row):
            if c != '.' and 0 <= ox + x < 16 and 0 <= oy + y < 16: r[oy + y][ox + x] = c
    return r

def badge(rows, margin=1):
    h, w = len(rows), max(len(r) for r in rows)
    g = [['.'] * (w + 2 * margin) for _ in range(h + 2 * margin)]
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            g[y + margin][x + margin] = c
    r = [row[:] for row in g]
    for y in range(len(g)):
        for x in range(len(g[0])):
            if g[y][x] != '.': continue
            if any(0 <= x + dx < len(g[0]) and 0 <= y + dy < len(g) and g[y + dy][x + dx] not in '.K' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                r[y][x] = 'K'
    return r

ARROW = grid([
    'K',
    'KK',
    'KLK',
    'KLPK',
    'KLPPK',
    'KLPPPK',
    'KLPPPPK',
    'KLPPPPPK',
    'KLPPPPPPK',
    'KLPPPPPPPK',
    'KLPPPPKKKKK',
    'KLPKPPK',
    'KLK.KPPK',
    'KK..KPPK',
    'K....KPPK',
    '.....KKK',
])

def ring(head, radius=(4.3, 6.4), center=(7.5, 7.5), segments=12):
    g = empty()
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - center[0], y - center[1])
            if radius[0] <= d <= radius[1]:
                a = (math.degrees(math.atan2(y - center[1], x - center[0])) + 90) % 360
                k = (a / 360 * segments - head) % segments
                g[y][x] = 'L' if k >= segments - 1.5 else 'P' if k >= segments - 5 else 'D'
    return outline(g)

def mini_ring(head):
    edge = [(1, 0), (2, 0), (3, 0), (4, 1), (4, 2), (4, 3), (3, 4), (2, 4), (1, 4), (0, 3), (0, 2), (0, 1)]
    m = [['.'] * 5 for _ in range(5)]
    for i, (x, y) in enumerate(edge):
        k = (i - head) % 12
        m[y][x] = 'L' if k == 0 else 'P' if k in (11, 10) else 'D'
    return badge([''.join(row) for row in m])

def draw():
    c = {}
    c['Arrow'] = (ARROW, (0, 0))
    c['Help'] = (overlay(ARROW, badge(['PPP', '..P', '.P.', '...', '.P.'], 1), 10, 0), (0, 0))
    c['AppStarting'] = ([overlay(ARROW, mini_ring(t), 9, 9) for t in range(12)], (0, 0))
    c['Wait'] = ([ring(t) for t in range(12)], (8, 8))
    g = empty()
    for (x, y) in [(2, 2), (3, 2), (4, 2), (2, 3), (2, 4), (13, 2), (12, 2), (11, 2), (13, 3), (13, 4),
                   (2, 13), (3, 13), (4, 13), (2, 12), (2, 11), (13, 13), (12, 13), (11, 13), (13, 12), (13, 11)]:
        g[y][x] = 'L'
    g[7][7] = g[7][8] = g[8][7] = g[8][8] = 'P'
    c['Crosshair'] = (outline(g), (8, 8))
    g = empty()
    for x in (5, 6, 8, 9): g[1][x] = g[14][x] = 'P'
    for y in range(2, 14): g[y][7] = 'L'
    c['IBeam'] = (outline(g), (7.5, 8))
    g = empty()
    for t in range(10):
        g[12 - t][3 + t] = 'P'; g[13 - t][3 + t] = 'L' if t < 9 else 'D'
    g[14][1] = g[13][2] = 'L'; g[2][12] = g[1][13] = 'D'
    c['NWPen'] = (outline(g), (1.5, 14.5))
    g = empty()
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5)
            if 4.6 <= d <= 6.3 or (d < 4.8 and abs((x - 7.5) - (y - 7.5)) < 1.1): g[y][x] = 'P'
    c['No'] = (outline(g), (8, 8))
    def double(vertical):
        g = empty()
        for i in range(3, 13): g[i][7] = 'L'
        for k, width in ((1, 0), (2, 1), (3, 2)):
            for d in range(-width, width + 1):
                g[k][7 + d] = 'P'; g[15 - k][7 + d] = 'P'
        return outline(g) if vertical else outline([list(r) for r in zip(*g)])
    c['SizeNS'] = (double(True), (7.5, 8))
    c['SizeWE'] = (double(False), (8, 7.5))
    def diagonal(mirror):
        g = empty()
        for i in range(4, 12): g[i][i] = 'L'
        for k in range(2, 7):
            g[2][k] = g[k][2] = 'P'; g[13][15 - k] = g[15 - k][13] = 'P'
        g[3][3] = g[12][12] = 'P'
        if mirror: g = [row[::-1] for row in g]
        return outline(g)
    c['SizeNWSE'] = (diagonal(False), (8, 8))
    c['SizeNESW'] = (diagonal(True), (8, 8))
    g = empty()
    for i in range(3, 13): g[i][7] = g[7][i] = 'L'
    for k, width in ((1, 0), (2, 1), (3, 2)):
        for d in range(-width, width + 1):
            g[k][7 + d] = g[15 - k][7 + d] = g[7 + d][k] = g[7 + d][15 - k] = 'P'
    c['SizeAll'] = (outline(g), (7.5, 7.5))
    g = empty()
    for k in range(5):
        for d in range(-k, k + 1): g[1 + k][7 + d] = 'P'
    for y in range(6, 15):
        for x in (6, 7, 8): g[y][x] = 'L' if x == 6 else 'P'
    c['UpArrow'] = (outline(g), (7.5, 1))
    hand = grid([
        '',
        '.....LP',
        '.....LP',
        '.....LP',
        '.....LP',
        '.....LPDPP',
        '.....LPDPPDPP',
        '.PP..LPPPPPPPP',
        '.LPP.LPPPPPPPP',
        '..LPPLPPPPPPPP',
        '...LPPPPPPPPPP',
        '....PPPPPPPPP',
        '....PPPPPPPPP',
        '.....PPPPPPP',
        '.....PPPPPPP',
    ])
    c['Hand'] = (outline(hand), (6, 1))
    c['Pin'] = (overlay(ARROW, badge(['.PPP.', 'PPLPP', 'PLLLP', 'PPLPP', '.PPP.', '..P..', '..P..']), 8, 7), (0, 0))
    c['Person'] = (overlay(ARROW, badge(['.PP.', 'PLPP', 'PPPP', '.PP.', '....', 'PPPP', 'LPPP', 'PPPP']), 9, 6), (0, 0))
    return c

def image(g, tint, s):
    """32-bit BMP (BGRA, bottom-up) plus its AND mask, as stored in a .cur file."""
    n = 16 * s
    pixels = bytearray()
    for y in range(n - 1, -1, -1):
        for x in range(n):
            c = g[y // s][x // s]
            if c == '.': pixels += b'\0\0\0\0'
            else:
                r, gr, b = tint[c]
                pixels += bytes((b, gr, r, 255))
    stride = ((n + 31) // 32) * 4
    mask = bytearray()
    for y in range(n - 1, -1, -1):
        bits = bytearray(stride)
        for x in range(n):
            if g[y // s][x // s] == '.': bits[x // 8] |= 0x80 >> (x % 8)
        mask += bits
    header = struct.pack('<IiiHHIIiiII', 40, n, n * 2, 1, 32, 0, len(pixels) + len(mask), 0, 0, 0, 0)
    return header + bytes(pixels) + bytes(mask)

def cur(g, hotspot, tint, scales=None):
    images = [(16 * s, min(16 * s - 1, round(hotspot[0] * s)), min(16 * s - 1, round(hotspot[1] * s)), image(g, tint, s)) for s in (scales or SCALES)]
    head = struct.pack('<HHH', 0, 2, len(images))
    offset = 6 + 16 * len(images)
    entries, data = b'', b''
    for n, hx, hy, d in images:
        entries += struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, hx, hy, len(d), offset + len(data))
        data += d
    return head + entries + data

def chunk(name, data):
    return name + struct.pack('<I', len(data)) + data + (b'\0' if len(data) % 2 else b'')

def ani(frames, hotspot, tint, jiffies=5):
    anih = struct.pack('<IIIIIIIII', 36, len(frames), len(frames), 0, 0, 0, 0, jiffies, 1)
    body = b'fram' + b''.join(chunk(b'icon', cur(g, hotspot, tint, SCALES_ANI)) for g in frames)
    riff = b'ACON' + chunk(b'anih', anih) + chunk(b'LIST', body)
    return b'RIFF' + struct.pack('<I', len(riff)) + riff

def main():
    drawings = draw()
    for theme, tint in TINTS.items():
        folder = os.path.join(OUTPUT, theme)
        os.makedirs(folder, exist_ok=True)
        for role, (g, hotspot) in drawings.items():
            if isinstance(g, list) and isinstance(g[0][0], list):
                open(os.path.join(folder, role + '.ani'), 'wb').write(ani(g, hotspot, tint))
            else:
                open(os.path.join(folder, role + '.cur'), 'wb').write(cur(g, hotspot, tint))
        print(theme, len(drawings), 'cursors')

if __name__ == '__main__':
    main()
