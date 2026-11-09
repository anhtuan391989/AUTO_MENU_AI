# -*- coding: utf-8 -*-
"""
tests/test_key_detector.py — Kiểm thử tự động cho module dò key AUTO_MENU_AI
Chạy:  python tests/test_key_detector.py
Tạo file WAV bằng sóng sin thuần (key chắc chắn 100%) → chạy module → đối chiếu.
"""
import os, sys, tempfile
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from core.key_detector import KeyDetector, pearson_r, score_chroma_vector  # noqa: E402

SR = 22050
PASS, FAIL = 0, 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  [PASS] {name}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name}  {detail}")


def make_chord(path: str, freqs, dur_sec: float = 5.0) -> str:
    t = np.linspace(0, dur_sec, int(SR * dur_sec), endpoint=False)
    y = sum(0.3 * np.sin(2 * np.pi * f * t) for f in freqs)
    y += sum(0.05 * np.sin(2 * np.pi * 2 * f * t) for f in freqs)
    sf.write(path, y / np.abs(y).max() * 0.9, SR)
    return path


def test_math() -> None:
    print("== Test toán học ==")
    a = np.random.rand(12)
    check("pearson_r(identical) == 1.0", abs(pearson_r(a, a) - 1.0) < 1e-9)
    check("pearson_r(opposite) == -1.0", abs(pearson_r(a, -a) + 1.0) < 1e-9)


def test_keys() -> None:
    print("== Test dò key từ sóng sin thuần ==")
    det = KeyDetector()
    cases = [
        ("C major",  [261.63, 329.63, 392.00], "C", "major"),
        ("A minor",  [220.00, 261.63, 329.63], "A", "minor"),
        ("F# major", [369.99, 466.16, 554.37], "F#", "major"),
        ("G major",  [392.00, 493.88, 587.33], "G", "major"),
        ("D minor",  [293.66, 349.23, 440.00], "D", "minor"),
    ]
    with tempfile.TemporaryDirectory() as tmp:
        for name, freqs, exp_root, exp_scale in cases:
            path = make_chord(os.path.join(tmp, f"{name}.wav"), freqs)
            res = det.analyze(path)
            ok = res.key == exp_root and res.scale == exp_scale
            check(f"dò đúng {name}", ok, f"thực tế: {res.key_label}")
            if ok:
                check(f"  → {name} độ tin cậy > 70%", res.confidence > 0.70,
                      f"confidence={res.confidence:.2%}")


def test_modulation() -> None:
    print("== Test phát hiện đổi key ==")
    det = KeyDetector()
    with tempfile.TemporaryDirectory() as tmp:
        t5 = np.linspace(0, 5.0, int(SR * 5), endpoint=False)
        cmaj = sum(0.3 * np.sin(2 * np.pi * f * t5) for f in [261.63, 329.63, 392.00])
        gmin = sum(0.3 * np.sin(2 * np.pi * f * t5) for f in [196.00, 233.08, 293.66])
        path = os.path.join(tmp, "mod.wav")
        sf.write(path, np.concatenate([cmaj, gmin]) / 0.9, SR)
        res = det.analyze(path, with_segments=True)
        check("phát hiện >= 2 đoạn", len(res.segments) >= 2, f"số đoạn={len(res.segments)}")
        if len(res.segments) >= 2:
            check("đoạn 1 là G? không, đoạn 1 là C major",
                  res.segments[0]["key"] == "C" and res.segments[0]["scale"] == "major",
                  f"đoạn1={res.segments[0]['key']} {res.segments[0]['scale']}")
            check("đoạn cuối là G minor",
                  res.segments[-1]["key"] == "G" and res.segments[-1]["scale"] == "minor",
                  f"đoạn cuối={res.segments[-1]['key']} {res.segments[-1]['scale']}")


if __name__ == "__main__":
    test_math()
    test_keys()
    test_modulation()
    print(f"\nKẾT QUẢ: {PASS} PASS / {FAIL} FAIL")
    sys.exit(1 if FAIL else 0)
