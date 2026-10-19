"""Synthesizes the dock sound packs: python src/sounds.py writes sounds/<pack>/Connect.wav and Disconnect.wav.

Each pack is a pair: connect rises, disconnect falls. Everything is synthesized here (no licensed samples)
in pure Python: 16-bit stereo WAV at 44.1 kHz, peak at -1 dBFS, a small Schroeder reverb, softened highs.
"""
import math, os, random, struct, wave

RATE = 44100
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
random.seed(7)


def silence(seconds):
    return [0.0] * int(seconds * RATE)


def mix(track, sound, start, gain=1.0):
    i0 = int(start * RATE)
    if len(track) < i0 + len(sound):
        track.extend([0.0] * (i0 + len(sound) - len(track)))
    for i, v in enumerate(sound):
        track[i0 + i] += v * gain
    return track


def low_pass(x, cutoff):
    a = 1 - math.exp(-2 * math.pi * cutoff / RATE)
    y, s = [], 0.0
    for v in x:
        s += a * (v - s)
        y.append(s)
    return y


def high_pass(x, cutoff):
    low = low_pass(x, cutoff)
    return [v - b for v, b in zip(x, low)]


def partials(f, ratios, amplitudes, decays, duration, attack=0.002):
    """Sum of damped sines: glass, bells."""
    n = int(duration * RATE)
    out = [0.0] * n
    for r, a, d in zip(ratios, amplitudes, decays):
        w = 2 * math.pi * f * r / RATE
        k = math.exp(-1 / (d * RATE))
        e = a
        for i in range(n):
            out[i] += math.sin(w * i) * e
            e *= k
    na = int(attack * RATE)
    for i in range(min(na, n)):
        out[i] *= i / na
    return out


def reverb(x, wet=0.22, length=0.78, offset=0):
    """Schroeder reverb: four damped comb filters, then two all-pass filters."""
    combs = [1116, 1188, 1277, 1356]
    n = len(x) + int(1.2 * RATE)
    dry = x + [0.0] * (n - len(x))
    total = [0.0] * n
    for d in combs:
        d += offset
        buf, lp = [0.0] * d, 0.0
        for i in range(n):
            out = buf[i % d]
            lp = out * 0.6 + lp * 0.4
            buf[i % d] = dry[i] + lp * length
            total[i] += out
    for d, g in ((556 + offset, 0.5), (441 + offset, 0.5)):
        buf = [0.0] * d
        for i in range(n):
            b = buf[i % d]
            v = total[i]
            buf[i % d] = v + b * g
            total[i] = b - v * g
    return [e + s * wet / 4 for e, s in zip(dry, total)]


def write(pack, name, mono, wet=0.22, length=0.78):
    left = reverb(mono, wet, length, 0)
    right = reverb(mono, wet, length, 23)
    n = max(len(left), len(right))
    left += [0.0] * (n - len(left)); right += [0.0] * (n - len(right))
    peak = max(max(abs(v) for v in left), max(abs(v) for v in right)) or 1
    threshold = peak * 0.002
    end = n
    while end > 1 and abs(left[end - 1]) < threshold and abs(right[end - 1]) < threshold:
        end -= 1
    end = min(n, end + int(0.02 * RATE))
    g = 0.891 / peak
    folder = os.path.join(ROOT, 'sounds', pack)
    os.makedirs(folder, exist_ok=True)
    with wave.open(os.path.join(folder, name + '.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<hh', int(max(-1, min(1, left[i] * g)) * 32767), int(max(-1, min(1, right[i] * g)) * 32767)) for i in range(end)))
    print(pack, name, round(end / RATE, 2), 's')


def envelope(n, attack, decay, sustain=0.0):
    na = max(1, int(attack * RATE))
    return [i / na if i < na else sustain + (1 - sustain) * math.exp(-(i - na) / (decay * RATE)) for i in range(n)]


def soften(x, cutoff=6500):
    return low_pass(low_pass(x, cutoff), cutoff * 1.4)



def glass_note(f, strength=1.0, duration=1.6):
    body = partials(f, [1, 2.0, 2.99, 4.01], [1, .22, .09, .04], [1.0, .55, .32, .2], duration, .006)
    return [v * strength for v in body]


def glass():
    e5, b5 = 659.25, 987.77
    write('Glass', 'Connect', soften(mix(mix(silence(1.9), glass_note(e5, .75), 0), glass_note(b5, .7), .14), 5200), .3, .8)
    write('Glass', 'Disconnect', soften(mix(mix(silence(1.9), glass_note(b5, .7), 0), glass_note(e5, .7), .16), 5200), .3, .8)



def bell(f):
    return partials(f, [.5, 1, 2, 2.4, 3], [.25, 1, .35, .12, .06], [2.0, 1.4, .7, .45, .3], 2.2, .006)


def chime():
    c5, e5, g5, c6 = 523.25, 659.25, 783.99, 1046.5
    b = silence(2.4)
    for k, f in enumerate((c5, e5, g5, c6)):
        mix(b, bell(f), k * .11, .8 if k < 3 else .55)
    write('Chime', 'Connect', soften(b, 5000), .26, .8)
    d = silence(2.4)
    for k, f in enumerate((g5, e5, c5)):
        mix(d, bell(f), k * .13, .75)
    write('Chime', 'Disconnect', soften(d, 5000), .26, .8)



def synth_note(f, duration, open_cutoff, closed_cutoff, attack=.025):
    n = int(duration * RATE)
    out, lp, lp2 = [], 0.0, 0.0
    phases = [0.0, 0.0, 0.0]
    for i in range(n):
        t = i / RATE
        v = 0.0
        for o, detune in enumerate((1.0, 1.006, 0.5)):
            phases[o] = (phases[o] + f * detune / RATE) % 1.0
            v += (2 * phases[o] - 1) * (.4 if o < 2 else .25)
        env = min(1, t / attack) * math.exp(-t / (duration * .5))
        cutoff = closed_cutoff + (open_cutoff - closed_cutoff) * math.exp(-t / .18)
        a = 1 - math.exp(-2 * math.pi * cutoff / RATE)
        lp += a * (v - lp)
        lp2 += a * (lp - lp2)
        out.append(lp2 * env)
    return out


def analog():
    a3, e4, a4, c5 = 220.0, 329.63, 440.0, 523.25
    b = silence(1.4)
    mix(b, synth_note(a3, .9, 1800, 380), 0, .7)
    mix(b, synth_note(e4, .85, 2200, 420), .09, .6)
    mix(b, synth_note(a4, .8, 2600, 480), .18, .55)
    write('Analog', 'Connect', b, .24, .78)
    d = silence(1.4)
    mix(d, synth_note(c5, .7, 2200, 420), 0, .55)
    mix(d, synth_note(e4, .8, 1800, 380), .1, .6)
    mix(d, synth_note(a3, .95, 1400, 300), .2, .7)
    write('Analog', 'Disconnect', d, .24, .78)



def pulse(f, duration, duty=.25, vibrato=0.0):
    n = int(duration * RATE)
    out, phase = [], 0.0
    env = envelope(n, .003, duration * .35)
    for i in range(n):
        t = i / RATE
        phase = (phase + f * (1 + vibrato * math.sin(2 * math.pi * 6 * t)) / RATE) % 1.0
        out.append((1.0 if phase < duty else -1.0) * env[i])
    return out


def retro():
    notes = (523.25, 659.25, 783.99, 1046.5)
    b = silence(.8)
    for k, f in enumerate(notes):
        mix(b, pulse(f, .11), k * .065, .5)
    mix(b, pulse(1046.5, .3, .25, .006), len(notes) * .065, .4)
    write('Retro 8-bit', 'Connect', soften(b, 4200), .14, .55)
    d = silence(.8)
    for k, f in enumerate(reversed(notes)):
        mix(d, pulse(f, .11), k * .065, .5)
    mix(d, pulse(392.0, .3, .5, .006), len(notes) * .065, .45)
    write('Retro 8-bit', 'Disconnect', soften(d, 4200), .14, .55)



def ting(f, duration=1.3, index=2.2, ratio=3.5):
    n = int(duration * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1, t / .004) * math.exp(-t / .45)
        mod = index * math.exp(-t / .12) * math.sin(2 * math.pi * f * ratio * t)
        out.append(math.sin(2 * math.pi * f * t + mod) * env)
    return out


def crystal():
    g5, d6, g6 = 783.99, 1174.66, 1567.98
    b = silence(1.6)
    mix(b, ting(g5), 0, .7)
    mix(b, ting(d6), .1, .6)
    mix(b, ting(g6, 1.0, 1.4), .2, .35)
    write('Crystal', 'Connect', soften(b, 6000), .3, .82)
    d = silence(1.6)
    mix(d, ting(d6), 0, .6)
    mix(d, ting(g5, 1.4), .12, .7)
    write('Crystal', 'Disconnect', soften(d, 6000), .3, .82)



def sweep(f1, f2, duration):
    n = int(duration * RATE)
    out, p1, p2 = [], 0.0, 0.0
    for i in range(n):
        t = i / n
        f = f1 * (f2 / f1) ** t
        p1 += 2 * math.pi * f / RATE
        p2 += 2 * math.pi * f * 1.5 / RATE
        env = math.sin(math.pi * min(1, t * 1.15)) ** 1.4
        out.append((math.sin(p1) * .7 + math.sin(p2) * .25) * env)
    return out


def air(duration, rising):
    n = int(duration * RATE)
    noise = [random.uniform(-1, 1) for _ in range(n)]
    out, lp = [], 0.0
    for i in range(n):
        t = i / n
        cutoff = 400 + 2600 * (t if rising else 1 - t)
        a = 1 - math.exp(-2 * math.pi * cutoff / RATE)
        lp += a * (noise[i] - lp)
        out.append(lp * math.sin(math.pi * t) * .5)
    return out


def scifi():
    b = silence(1.1)
    mix(b, sweep(260, 880, .45), 0, .7)
    mix(b, air(.45, True), 0, .35)
    mix(b, ting(1318.5, .6, 1.2, 2.0), .38, .3)
    write('Sci-fi', 'Connect', soften(b, 5500), .28, .75)
    d = silence(1.1)
    mix(d, sweep(880, 220, .5), 0, .7)
    mix(d, air(.5, False), 0, .35)
    write('Sci-fi', 'Disconnect', soften(d, 5500), .28, .75)



def drop(f0, rise=2.1):
    n = int(.16 * RATE)
    out, phase = [], 0.0
    for i in range(n):
        t = i / RATE
        f = f0 * (1 + (rise - 1) * (1 - math.exp(-t / .018)))
        phase += 2 * math.pi * f / RATE
        env = min(1, t / .001) * math.exp(-t / .035)
        out.append(math.sin(phase) * env)
    return out


def drops():
    b = mix(mix(silence(1.0), drop(520), 0, .85), drop(780), .12)
    write('Drops', 'Connect', b, .3, .82)
    d = mix(mix(silence(1.0), drop(820, 1.8), 0, .8), drop(480, 1.6), .14)
    write('Drops', 'Disconnect', d, .3, .82)



def click(bright=3200, thump=110, strength=1.0):
    n = int(.05 * RATE)
    noise = high_pass([random.uniform(-1, 1) * math.exp(-i / (0.0012 * RATE)) for i in range(n)], bright)
    hit = [math.sin(2 * math.pi * thump * i / RATE) * math.exp(-i / (0.006 * RATE)) for i in range(n)]
    return [(b * .9 + c * .7) * strength for b, c in zip(noise, hit)]


def motor(f1, f2, duration):
    n = int(duration * RATE)
    out, phase = [], 0.0
    for i in range(n):
        t = i / n
        f = f1 + (f2 - f1) * t
        phase = (phase + f / RATE) % 1.0
        env = math.sin(math.pi * t) ** 1.5
        out.append((2 * phase - 1) * env)
    return low_pass(out, 1400)


def mechanical():
    b = silence(.9)
    mix(b, click(strength=.9), 0)
    mix(b, click(4200, 160, .7), .055)
    mix(b, motor(180, 420, .22), .1, .22)
    write('Mechanical', 'Connect', b, .12, .6)
    d = silence(.9)
    mix(d, motor(420, 160, .24), 0, .22)
    mix(d, click(2600, 90, 1.0), .25)
    write('Mechanical', 'Disconnect', d, .12, .6)


def tone(f, duration, attack, decay, harmonics=(1.0, 0.16, 0.04)):
    n = int(duration * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / attack) * math.exp(-t / decay)
        out.append(sum(a * math.sin(2 * math.pi * f * (k + 1) * t) for k, a in enumerate(harmonics)) * env)
    return out


def squash(x, drive=1.8):
    top = math.tanh(drive)
    return [math.tanh(v * drive) / top for v in x]


def chord(b, start, notes, gain):
    for f, g in notes:
        mix(b, tone(f, 1.7, .035, .75), start, gain * g)


def sonar():
    """Speed test pair: a rising run of soft sine notes over a breath that lands on a warm D major chord, then the same run falling to rest."""
    b = silence(3.2)
    for i, f in enumerate((293.66, 369.99, 440.0, 587.33, 739.99)):
        mix(b, tone(f, 1.0, .012, .3), i * .2, .3 + i * .05)
    mix(b, sweep(220, 1300, 1.2), 0, .16)
    mix(b, air(1.2, True), 0, .14)
    chord(b, 1.1, ((587.33, 1.0), (739.99, .7), (880.0, .55), (146.83, 1.1), (293.66, .6)), .42)
    write('Sonar', 'Connect', soften(squash(b), 4200), .26, .78)
    d = silence(3.2)
    for i, f in enumerate((880.0, 739.99, 587.33)):
        mix(d, tone(f, 1.0, .012, .32), i * .18, .4 - i * .04)
    chord(d, .55, ((440.0, 1.0), (587.33, .75), (739.99, .5), (146.83, 1.0), (293.66, .55)), .4)
    write('Sonar', 'Disconnect', soften(squash(d), 4200), .26, .78)


def pluck(f, duration=.7):
    """A wooden mallet note: marimba-like partials (1, 4, 10) with a soft tap, no sustained tone."""
    body = partials(f, (1, 4.0, 10.0), (1.0, .2, .04), (.22, .06, .02), duration, .003)
    tap = low_pass([random.uniform(-1, 1) * math.exp(-i / (RATE * .004)) for i in range(int(.03 * RATE))], 2200)
    for i, v in enumerate(tap):
        body[i] += v * .12
    return body


def steps():
    """One soft wooden note per speed test step, rising: app/sounds/step-1..5.wav, played by Sounds.Step."""
    for i, f in enumerate((329.63, 392.0, 440.0, 523.25, 659.25), 1):
        b = silence(1.1)
        mix(b, pluck(f), 0, .9)
        if i == 5:
            mix(b, pluck(f / 2, .9), .02, .5)
            mix(b, pluck(f * 1.5, .8), .05, .3)
        write('../app/sounds', 'step-%d' % i, soften(b, 3400), .1, .4)


if __name__ == '__main__':
    glass(); chime(); analog(); drops(); mechanical(); retro(); crystal(); scifi(); sonar(); steps()
