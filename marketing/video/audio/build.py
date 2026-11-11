"""Builds the soundtrack for out/athenyx-short.mp4 from cues.json.

Voice: Microsoft Edge neural TTS. SFX: synthesized here. Music: audio/music.(mp3|wav|m4a) if present,
otherwise a synthesized placeholder bed. The mix ducks music under the voice, is normalized to
-14 LUFS, and is muxed into the video without re-encoding the picture.

    .venv/Scripts/python build.py                         # Ava
    .venv/Scripts/python build.py --voice en-US-AndrewMultilingualNeural --name andrew
"""
import argparse
import asyncio
import hashlib
import json
import re
import subprocess
from pathlib import Path

import edge_tts
import numpy as np

HERE = Path(__file__).resolve().parent
VIDEO = HERE.parent
FFMPEG = str(VIDEO / "node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe")
SR = 48000
CACHE = HERE / ".cache"
rng = np.random.default_rng(7)


def ff(*args, capture=False):
    r = subprocess.run([FFMPEG, "-hide_banner", "-y", *args], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode(errors="ignore")[-1500:])
    return r


def decode(path, tempo=1.0):
    af = ["-af", f"atempo={tempo:.4f}"] if abs(tempo - 1) > 1e-3 else []
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path), *af, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def trim(x, thresh=0.01):
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    a, b = max(0, idx[0] - int(0.02 * SR)), min(len(x), idx[-1] + int(0.08 * SR))
    return x[a:b]


# ---------- voice ----------

async def tts(text, voice, rate, out):
    tmp = out.with_suffix(".part")
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice, rate=rate).save(str(tmp))
            tmp.replace(out)
            return
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == 3:
                raise
            await asyncio.sleep(2 * (attempt + 1))


def voice_line(text, voice, rate, slot):
    CACHE.mkdir(exist_ok=True)
    key = hashlib.sha1(f"{voice}|{rate}|{text}".encode()).hexdigest()[:16]
    mp3 = CACHE / f"{key}.mp3"
    if not mp3.exists():
        asyncio.run(tts(text, voice, rate, mp3))
    x = trim(decode(mp3))
    raw = len(x) / SR
    tempo = 1.0
    if raw > slot:
        tempo = min(raw / slot, 1.25)
        x = trim(decode(mp3, tempo))
    return x / (np.max(np.abs(x)) + 1e-9) * 0.9, raw, tempo


# ---------- sfx ----------

def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def onepole_lp(x, cut):
    cut = np.broadcast_to(np.asarray(cut, dtype=np.float64), x.shape)
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def sine_glide(f0, f1, dur, curve=3.0):
    t = t_axis(dur)
    f = f1 + (f0 - f1) * np.exp(-curve * t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def bell(freq, dur, decay=0.35):
    t = t_axis(dur)
    parts = [(1, 1.0, 1.0), (2.76, 0.45, 0.6), (5.4, 0.25, 0.35), (8.9, 0.1, 0.2)]
    return sum(a * np.sin(2 * np.pi * freq * m * t) * np.exp(-t / (decay * d)) for m, a, d in parts)


def whoosh(dur=0.5, lo=300, hi=3800):
    t = t_axis(dur)
    n = rng.standard_normal(len(t))
    shape = np.sin(np.pi * t / dur) ** 2
    y = onepole_lp(n, lo + (hi - lo) * shape)
    y = y - onepole_lp(y, 150)
    return y * shape


def pop():
    t = t_axis(0.12)
    return sine_glide(1100, 320, 0.12, 5) * np.exp(-t / 0.035)


def click():
    t = t_axis(0.05)
    n = np.diff(rng.standard_normal(len(t) + 1))
    return (0.6 * n + np.sin(2 * np.pi * 2400 * t)) * np.exp(-t / 0.008)


def series(make, dur, gap_lo, gap_hi, amp_lo=0.5):
    out = np.zeros(int((dur + 0.2) * SR))
    t = 0.0
    while t < dur:
        s = make() * rng.uniform(amp_lo, 1.0)
        i = int(t * SR)
        out[i:i + len(s)] += s[: len(out) - i]
        t += rng.uniform(gap_lo, gap_hi)
    return out


def sparkle():
    out = np.zeros(int(0.9 * SR))
    for k, f in enumerate([1047, 1319, 1568, 2093]):
        s = bell(f, 0.6, 0.25) * 0.5
        i = int(k * 0.06 * SR)
        out[i:i + len(s)] += s
    return out


def stamp():
    t = t_axis(0.3)
    return sine_glide(160, 70, 0.3, 4) * np.exp(-t / 0.08) + 0.4 * onepole_lp(rng.standard_normal(len(t)), 1200) * np.exp(-t / 0.03)


def boom():
    t = t_axis(0.9)
    return sine_glide(90, 38, 0.9, 3) * np.exp(-t / 0.28) + 0.6 * onepole_lp(rng.standard_normal(len(t)), 900) * np.exp(-t / 0.12)


def party():
    burst = whoosh(0.18, 800, 6000) * 1.4
    crackle = series(lambda: click() * 0.5, 0.7, 0.015, 0.06, 0.2)
    crackle *= np.linspace(1, 0, len(crackle))
    out = np.zeros(max(len(burst), len(crackle)))
    out[: len(burst)] += burst
    out[: len(crackle)] += crackle
    return out


def rocket(dur=2.6):
    t = t_axis(dur)
    n = rng.standard_normal(len(t))
    env = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.8)
    rumble = onepole_lp(n, 260 + 500 * t / dur)
    hiss = onepole_lp(n, 2500) - onepole_lp(n, 900)
    return (rumble * 2.5 + hiss * 0.6) * env


def sting():
    out = np.zeros(int(2.0 * SR))
    for k, f in enumerate([523, 659, 784, 1047]):
        s = bell(f, 1.6, 0.6) * 0.45
        i = int(k * 0.07 * SR)
        out[i:i + len(s)] += s
    return out


SFX = {
    "whoosh": (lambda c: whoosh(), 0.32),
    "pop": (lambda c: pop(), 0.28),
    "click": (lambda c: click(), 0.4),
    "typing": (lambda c: series(click, c.get("duration", 1.4), 0.05, 0.11), 0.22),
    "sparkle": (lambda c: sparkle(), 0.22),
    "swish": (lambda c: whoosh(0.28, 900, 6000), 0.25),
    "stamp": (lambda c: stamp(), 0.5),
    "scurry": (lambda c: series(lambda: click() * 0.6, c.get("duration", 2.5), 0.02, 0.045, 0.3), 0.14),
    "boom": (lambda c: boom(), 0.6),
    "ding": (lambda c: bell(1319, 1.2, 0.4), 0.22),
    "party": (lambda c: party(), 0.35),
    "rocket": (lambda c: rocket(c.get("duration", 2.6)), 0.3),
    "sting": (lambda c: sting(), 0.4),
}


# ---------- music ----------

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(name, octave):
    return 440 * 2 ** ((NOTE[name] + 12 * (octave + 1) - 69) / 12)


def pluck(freq, dur=0.5, decay=0.16):
    t = t_axis(dur)
    tone = sum(np.sin(2 * np.pi * freq * k * t) / k ** 1.4 for k in range(1, 6))
    return tone * np.exp(-t / decay) * np.minimum(1, t / 0.004)


def placeholder_music(total, bpm=116):
    beat = 60 / bpm
    out = np.zeros(int((total + 2) * SR))
    prog = [("C", "E", "G"), ("G", "B", "D"), ("A", "C", "E"), ("F", "A", "C")]
    roots = ["C", "G", "A", "F"]

    def put(sig, t, gain):
        i = int(t * SR)
        if i < len(out):
            out[i:i + len(sig)] += gain * sig[: len(out) - i]

    kick_t = t_axis(0.3)
    kick = sine_glide(130, 45, 0.3, 6) * np.exp(-kick_t / 0.09)
    hat_t = t_axis(0.04)
    hat = np.diff(rng.standard_normal(len(hat_t) + 1)) * np.exp(-hat_t / 0.01)
    clap_t = t_axis(0.12)
    clap = (onepole_lp(rng.standard_normal(len(clap_t)), 3000) - onepole_lp(rng.standard_normal(len(clap_t)), 700)) * np.exp(-clap_t / 0.035)

    bar = 0
    t = 0.0
    pattern = [0, 1, 2, 1, 0, 2, 1, 2]
    while t < total + 1:
        chord = prog[bar % 4]
        for b in range(4):
            bt = t + b * beat
            put(kick, bt, 0.9)
            put(hat, bt + beat / 2, 0.25)
            if b in (1, 3):
                put(clap, bt, 0.35)
        for k, idx in enumerate(pattern):
            octave = 5 if k % 4 == 3 else 4
            put(pluck(hz(chord[idx], octave)), t + k * beat / 2, 0.16)
        for k in (0, 1.5, 2, 3.5):
            put(pluck(hz(roots[bar % 4], 2), 0.45, 0.22), t + k * beat, 0.35)
        bar += 1
        t += 4 * beat
    return out


def load_music(total):
    for ext in ("mp3", "wav", "m4a", "ogg"):
        p = HERE / f"music.{ext}"
        if p.exists():
            x = decode(p)
            reps = int(np.ceil(total * SR / len(x))) + 1
            return np.tile(x, reps), p.name
    return placeholder_music(total), "synthesized placeholder"


# ---------- mix ----------

def place(track, sig, t, gain=1.0):
    i = int(t * SR)
    if i >= len(track):
        return
    n = min(len(sig), len(track) - i)
    track[i:i + n] += gain * sig[:n]


def duck_gain(voice, duck_db, rate=200):
    hop = SR // rate
    frames = len(voice) // hop
    env = np.abs(voice[: frames * hop]).reshape(frames, hop).max(axis=1)
    active = (env > 0.03).astype(float)
    target = np.where(active > 0, 10 ** (duck_db / 20), 1.0)
    g = np.empty(frames)
    acc = 1.0
    for i in range(frames):
        coef = 0.35 if target[i] < acc else 0.03
        acc += coef * (target[i] - acc)
        g[i] = acc
    return np.interp(np.arange(len(voice)), np.arange(frames) * hop, g)


def fade(x, fin, fout):
    a, b = int(fin * SR), int(fout * SR)
    x[:a] *= np.linspace(0, 1, a)
    x[len(x) - b:] *= np.linspace(1, 0, b)
    return x


def srt_time(s):
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{int(h):02}:{int(m):02}:{int(sec):02},{int(round((sec % 1) * 1000)):03}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="en-US-AvaMultilingualNeural")
    ap.add_argument("--rate", default="+6%")
    ap.add_argument("--name", default="ava")
    args = ap.parse_args()

    cues = json.loads((HERE / "cues.json").read_text(encoding="utf-8"))
    total = cues["duration"]
    n = int(total * SR)
    voice = np.zeros(n)
    sfx = np.zeros(n)

    print(f"voice: {args.voice} ({args.rate})")
    for line in cues["voice"]["lines"]:
        slot = line["end"] - line["start"]
        x, raw, tempo = voice_line(line["text"], args.voice, args.rate, slot)
        place(voice, x, line["start"])
        flag = "" if tempo == 1 else f"  sped up x{tempo:.2f}"
        flag += "  STILL TOO LONG" if raw / tempo > slot + 0.05 else ""
        print(f"  {line['start']:5.1f}s  {raw:4.2f}s / slot {slot:3.1f}s{flag}  {line['text']}")

    for c in cues["sfx"]:
        make, gain = SFX[c["kind"]]
        s = make(c)
        place(sfx, s / (np.max(np.abs(s)) + 1e-9), c["t"], gain)

    music_raw, source = load_music(total)
    m = cues["music"]
    music = music_raw[:n].astype(float)
    music *= (10 ** (m["volume_db"] / 20)) / (np.sqrt(np.mean(music ** 2)) + 1e-9)
    music *= duck_gain(voice, m["duck_under_voice_db"])
    music = fade(music, m["fade_in"], m["fade_out"])
    print(f"music: {source}")

    mix = voice + sfx + music
    peak = np.max(np.abs(mix))
    if peak > 0.95:
        mix *= 0.95 / peak

    work = HERE / "out"
    work.mkdir(exist_ok=True)
    raw_wav = work / f"mix-{args.name}-raw.f32"
    mix.astype(np.float32).tofile(raw_wav)
    pcm = ["-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(raw_wav)]

    probe = ff(*pcm, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-")
    meas = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", probe.stderr.decode()).group(0))
    ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={meas['input_i']}:measured_TP={meas['input_tp']}:"
          f"measured_LRA={meas['input_lra']}:measured_thresh={meas['input_thresh']}:offset={meas['target_offset']}:linear=true")
    m4a = work / f"mix-{args.name}.m4a"
    ff(*pcm, "-af", ln, "-ar", str(SR), "-ac", "2", "-c:a", "aac", "-b:a", "192k", str(m4a))
    raw_wav.unlink()

    video_in = VIDEO / "out/athenyx-short.mp4"
    video_out = VIDEO / f"out/athenyx-short-{args.name}.mp4"
    ff("-i", str(video_in), "-i", str(m4a), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-shortest", str(video_out))

    srt = []
    for i, line in enumerate(cues["voice"]["lines"], 1):
        srt.append(f"{i}\n{srt_time(line['start'])} --> {srt_time(line['end'])}\n{line['text']}\n")
    (VIDEO / "out/athenyx-short.srt").write_text("\n".join(srt), encoding="utf-8")

    ff("-i", str(m4a), "-filter_complex", "showwavespic=s=1600x260:colors=#1a1206", "-frames:v", "1", str(work / f"wave-{args.name}.png"))
    print(f"loudness before normalize: {meas['input_i']} LUFS, true peak {meas['input_tp']} dBTP")
    print(f"video: {video_out}")


if __name__ == "__main__":
    main()
