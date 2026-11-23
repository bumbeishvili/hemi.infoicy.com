"""What every voice file goes through, whichever voice made it, so they all match."""
import json
import os
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
# Lines live next to whatever uses them: the shared ones, and any a game has for itself.
VOICE_DIRS = [
    ROOT / "core" / "audio" / "voice",
    ROOT / "core" / "body" / "voice",
    ROOT / "games" / "mighty-moves" / "audio" / "voice",
    ROOT / "games" / "leap-trail" / "audio" / "voice",
    ROOT / "games" / "sky-wings" / "audio" / "voice",
    ROOT / "games" / "smoothie-stand" / "audio" / "voice",
    ROOT / "games" / "giraffe-walk" / "audio" / "voice",
    ROOT / "games" / "lighthouse" / "audio" / "voice",
    ROOT / "games" / "robot-rescue" / "audio" / "voice",
    ROOT / "games" / "cannon-bay" / "audio" / "voice",
    ROOT / "games" / "tank-patrol" / "audio" / "voice",
    ROOT / "games" / "spider-catcher" / "audio" / "voice",
    ROOT / "games" / "giraffe-maze" / "audio" / "voice",
    ROOT / "games" / "giraffe-garden" / "audio" / "voice",
    ROOT / "games" / "giraffe-goal" / "audio" / "voice",
    ROOT / "games" / "frost-arena" / "audio" / "voice",
    ROOT / "games" / "arrow-meadow" / "audio" / "voice",
    ROOT / "games" / "giraffe-puzzles" / "audio" / "voice",
    ROOT / "games" / "chick-flap" / "audio" / "voice",
    ROOT / "games" / "mighty-lift" / "audio" / "voice",
    ROOT / "core" / "face" / "voice",
    ROOT / "games" / "gobble-grow" / "audio" / "voice",
    ROOT / "games" / "giraffe-paint" / "audio" / "voice",
    ROOT / "games" / "moto-mountain" / "audio" / "voice",
    ROOT / "games" / "rooftop-rope" / "audio" / "voice",
    ROOT / "games" / "world-tour" / "audio" / "voice",
    ROOT / "games" / "swamp-splash" / "audio" / "voice",
    ROOT / "games" / "hat-chase" / "audio" / "voice",
    ROOT / "games" / "riddle-doors" / "audio" / "voice",
]
# Rendering is slow, so this can pick out one folder: VOICE_ONLY=sky-wings npm run voice
if os.environ.get("VOICE_ONLY"):
    VOICE_DIRS = [folder for folder in VOICE_DIRS if os.environ["VOICE_ONLY"] in str(folder)]
FFMPEG = (Path.home() / ".cache" / "explainer-video" / "ffmpeg-path").read_text().strip()

TRIM_LEVEL = 10 ** (-45 / 20)
# Every line ends up equally loud, so short words don't sound quieter than long sentences.
TARGET_SPEECH_RMS = 10 ** (-19 / 20)
PEAK_LIMIT = 10 ** (-1.5 / 20)


def load_lines(folder):
    lines = json.loads((folder / "lines.json").read_text())
    ids = [line["id"] for line in lines]
    if len(set(ids)) != len(ids):
        raise ValueError("Two lines share an id")
    return lines


def _windows_rms(audio, window):
    n = len(audio) // window
    return np.sqrt((audio[: n * window].reshape(n, window) ** 2).mean(axis=1))


def finish(audio, rate):
    """Trims the silence around a line, softens its edges and sets its level."""
    window = int(0.02 * rate)
    fade = int(0.006 * rate)
    rms = _windows_rms(audio, window)
    loud = np.nonzero(rms > TRIM_LEVEL)[0]
    if not len(loud):
        raise ValueError("the clip is silent")
    audio = audio[loud[0] * window : (loud[-1] + 1) * window].copy()
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)

    rms = _windows_rms(audio, window)
    speech = rms[rms > rms.max() * 0.25]
    gain = TARGET_SPEECH_RMS / np.sqrt((speech**2).mean())
    gain = min(gain, PEAK_LIMIT / np.abs(audio).max())
    return audio * gain


def encode(audio, rate, target):
    """Writes Ogg Opus through a temporary WAV, about 8 KB per second of speech."""
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / "line.wav"
        with wave.open(str(source), "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(rate)
            out.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
        subprocess.run(
            [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
             "-c:a", "libopus", "-b:a", "64k", "-application", "audio", str(target)],
            check=True,
        )


def decode(path, rate=48000):
    """Reads any audio file ffmpeg understands, such as a phone's voice memo, as mono."""
    result = subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-f", "s16le", "-ac", "1", "-ar", str(rate), "-"],
        check=True,
        capture_output=True,
    )
    return np.frombuffer(result.stdout, dtype="<i2").astype(np.float32) / 32768


def remove_stale(folder, lines):
    """Files from lines that no longer exist would ship with the game for nothing."""
    ids = {line["id"] for line in lines}
    for stale in folder.glob("*.ogg"):
        if stale.stem not in ids:
            stale.unlink()
            print("removed", stale.name)
