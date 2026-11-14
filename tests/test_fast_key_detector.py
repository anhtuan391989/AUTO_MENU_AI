# -*- coding: utf-8 -*-
"""
tests/test_fast_key_detector.py — Kiểm thử core/fast_key_detector.py (KEY-ANALYZE-02)
Chạy:  python tests/test_fast_key_detector.py
Tạo WAV tổng hợp (hợp âm có bass + họa âm) rồi đối chiếu. Không cần file nhạc thật, không cần librosa.
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
from core import fast_key_detector as fk  # noqa: E402

SR = 44100
PASS, FAIL = 0, 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  [PASS] " + name)
    else:
        FAIL += 1
        print("  [FAIL] %s  %s" % (name, detail))


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def tone(freq, t):
    return sum(a * np.sin(2 * np.pi * freq * k * t) for k, a in ((1, 1.0), (2, 0.35), (3, 0.15)))


def song(path, progression, sec_per_chord=6.0, loops=2, detune_cents=0.0):
    """progression: list of (bass_midi, [chord_midi...]). Trả đường dẫn WAV."""
    parts = []
    for _ in range(loops):
        for bass, notes in progression:
            t = np.arange(int(SR * sec_per_chord)) / SR
            env = np.minimum(1.0, t * 20) * np.exp(-t * 0.15)
            y = 1.4 * tone(midi_hz(bass) * 2 ** (detune_cents / 1200), t)
            for n in notes:
                y = y + 0.8 * tone(midi_hz(n) * 2 ** (detune_cents / 1200), t)
            parts.append(y * env)
    y = np.concatenate(parts)
    sf.write(path, (y / np.abs(y).max() * 0.8).astype("float32"), SR)
    return path


def c_major_prog():   # C - F - G - C
    return [(36, [60, 64, 67]), (41, [65, 69, 72]), (43, [67, 71, 74]), (36, [60, 64, 67])]


def a_minor_prog():   # Am - Dm - E - Am
    return [(45, [57, 60, 64]), (38, [62, 65, 69]), (40, [64, 68, 71]), (45, [57, 60, 64])]


def run_cli(path):
    r = subprocess.run([sys.executable, os.path.join(ROOT, "core", "fast_key_detector.py"), path, "--json"],
                       capture_output=True, text=True)
    return r


def main():
    tmp = tempfile.mkdtemp()
    print("== Dò key trên nhạc tổng hợp ==")
    p = song(os.path.join(tmp, "c.wav"), c_major_prog())
    r = fk.analyze_file(p)
    check("C - F - G - C -> C trưởng", r["key"] == "C" and r["scale"] == "major", str(r["key_label"]))
    p = song(os.path.join(tmp, "am.wav"), a_minor_prog())
    r = fk.analyze_file(p)
    check("Am - Dm - E - Am -> A thứ", r["key"] == "A" and r["scale"] == "minor", str(r["key_label"]))
    p = song(os.path.join(tmp, "c_detuned.wav"), c_major_prog(), detune_cents=-30)
    r = fk.analyze_file(p)
    check("C trưởng lệch tuning -30 cent vẫn ra C trưởng; bù tuning ước lượng gần -30",
          r["key"] == "C" and r["scale"] == "major" and -45 <= r["tuning_cents"] <= -15,
          "%s tuning=%s" % (r["key_label"], r["tuning_cents"]))

    print("== Khuôn kết quả (để app/keyAnalyzer.js đọc được) ==")
    for f in ("key", "scale", "confidence", "is_reliable", "duration_sec"):
        check("có trường '%s'" % f, f in r)
    check("confidence nằm trong [0, trần 0.54] (không tự lưu Key Server dùng chung)",
          0.0 <= r["confidence"] <= fk.MAX_CONFIDENCE <= 0.54, str(r["confidence"]))
    check("MAX_CONFIDENCE < 0.55 (ngưỡng gửi Key Server)", fk.MAX_CONFIDENCE < 0.55)
    check("key là nốt hợp lệ, scale là major/minor", r["key"] in fk.NAMES and r["scale"] in ("major", "minor"))

    print("== CLI --json ==")
    p = song(os.path.join(tmp, "c2.wav"), c_major_prog())
    out = run_cli(p)
    j = json.loads(out.stdout) if out.returncode == 0 else {}
    check("CLI thoát 0 và in JSON đọc được", out.returncode == 0 and j.get("key") == "C" and j.get("engine") == "fast", out.stderr[-200:])

    print("== Trường hợp lỗi: thoát mã 1 + thông báo ở stderr, không traceback ==")
    short = os.path.join(tmp, "short.wav")
    sf.write(short, (0.3 * np.sin(2 * np.pi * 440 * np.arange(SR) / SR)).astype("float32"), SR)
    out = run_cli(short)
    check("file ngắn 1 giây -> mã 1, báo 'quá ngắn'", out.returncode == 1 and "quá ngắn" in out.stderr and "Traceback" not in out.stderr, out.stderr[-200:])
    silent = os.path.join(tmp, "silent.wav")
    sf.write(silent, np.zeros(SR * 20, dtype="float32"), SR)
    out = run_cli(silent)
    check("file im lặng -> mã 1, không treo", out.returncode == 1 and "Traceback" not in out.stderr, out.stderr[-200:])
    out = run_cli(os.path.join(tmp, "khong_co.mp3"))
    check("file không tồn tại -> mã 1", out.returncode == 1 and "Traceback" not in out.stderr, out.stderr[-200:])

    print("\n%d PASS / %d FAIL" % (PASS, FAIL))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
