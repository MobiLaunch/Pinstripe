"""Synthesizes the app's small sound effects into assets/sounds (16-bit mono WAV).

Run from apps/mobile: python3 scripts/make-sounds.py
"""
import math
import random
import struct
import wave

RATE = 22050
random.seed(6)


def write(name, samples, gain=0.8):
    peak = max(1e-9, max(abs(s) for s in samples))
    with wave.open(f"assets/sounds/{name}.wav", "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(b"".join(struct.pack("<h", int(s / peak * gain * 32767)) for s in samples))


def bandpass(signal, freq_at, q=4.0):
    """A resonant band-pass (RBJ biquad) whose centre follows freq_at(t)."""
    out, x1, x2, y1, y2 = [], 0.0, 0.0, 0.0, 0.0
    for i, x in enumerate(signal):
        w = 2 * math.pi * freq_at(i / RATE) / RATE
        alpha = math.sin(w) / (2 * q)
        b0, b2 = alpha, -alpha
        a0, a1, a2 = 1 + alpha, -2 * math.cos(w), 1 - alpha
        y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0
        out.append(y)
        x2, x1, y2, y1 = x1, x, y1, y
    return out


def noise(seconds):
    return [random.uniform(-1, 1) for _ in range(int(seconds * RATE))]


def tone(freq, seconds, decay=12.0, attack=0.004):
    n = int(seconds * RATE)
    return [
        math.sin(2 * math.pi * freq * i / RATE) * min(1, i / (attack * RATE)) * math.exp(-decay * i / RATE)
        # A little second harmonic keeps it from sounding like a test tone.
        + 0.25 * math.sin(4 * math.pi * freq * i / RATE) * math.exp(-decay * 2 * i / RATE)
        for i in range(n)
    ]


def silence(seconds):
    return [0.0] * int(seconds * RATE)


# Sent: air rushing past, rising in pitch, swelling and fading.
length = 0.5
swoosh = bandpass(noise(length), lambda t: 500 + 3200 * (t / length) ** 1.6, q=2.5)
swoosh = [s * math.sin(math.pi * min(1, (i / RATE) / length)) ** 2 for i, s in enumerate(swoosh)]
write("sent", swoosh, 0.6)

# Refresh: a small wet pop, falling in pitch.
n = int(0.09 * RATE)
pop = [
    math.sin(2 * math.pi * (1100 - 5000 * (i / RATE)) * i / RATE) * math.exp(-45 * i / RATE)
    for i in range(n)
]
write("pop", pop, 0.55)

# Recording starts: two rising notes; stops: the same falling.
write("record-start", tone(988, 0.12, 16) + silence(0.02) + tone(1319, 0.2, 14), 0.5)
write("record-stop", tone(1319, 0.12, 16) + silence(0.02) + tone(988, 0.2, 14), 0.5)

# Shutter: two quick mechanical clicks.
def click(seconds, centre):
    burst = bandpass(noise(seconds), lambda t: centre, q=1.2)
    return [s * math.exp(-90 * i / RATE) for i, s in enumerate(burst)]

write("shutter", click(0.05, 2600) + silence(0.035) + click(0.07, 1700), 0.7)
# Picker tick: the short, dry click of the wheel passing a detent.
tick = bandpass(noise(0.012), lambda t: 3800, q=2.0)
tick = [s * math.exp(-420 * i / RATE) for i, s in enumerate(tick)]
write("tick", tick + silence(0.01), 0.45)
print("ok")
