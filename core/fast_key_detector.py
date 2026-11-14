# -*- coding: utf-8 -*-
"""
core/fast_key_detector.py — Bộ dò Key NHANH cho AUTO_MENU_AI (KEY-ANALYZE-02)

Dùng cho file nhạc trên máy (MPC-HC). Cách làm: chỉ lấy ~260 đoạn ngắn rải đều trong bài (3%..96%),
hạ tần số lấy mẫu 4 lần, FFT 4096 điểm, gom 12 nốt + nốt bass + hợp âm, chấm 24 key.
Đo trên 29 bài Vpop (tools/keybench): đúng 22/29, riêng 20 bài chưa từng chỉnh: 16/20; bộ key_detector.py: 12/20.

Khuôn kết quả --json giống core/key_detector.py (key, scale, confidence, is_reliable, duration_sec) để
app/keyAnalyzer.js đọc được không cần sửa luồng phía sau.

LƯU Ý VỀ confidence:
  Chỉ ~80% bài đúng và cờ margin chưa tách được bài đúng/sai (xem báo cáo KeyBench), nên confidence bị
  chặn trần MAX_CONFIDENCE = 0.54, thấp hơn ngưỡng gửi Key Server (0.55 trong KeyServerSync).
  => Kết quả vẫn HIỂN THỊ trong Menu nhưng KHÔNG tự động lưu lên Key Server dùng chung.
  Khi có thêm dữ liệu kiểm chứng thì mới nâng trần này.

Cần: numpy, scipy, soundfile (đã có trong requirements.txt: scipy đi kèm librosa). Không bắt buộc librosa.
Dùng:  python core/fast_key_detector.py <file> --json
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from typing import Dict, List, Optional

import numpy as np
import scipy.signal as sg

MAX_CONFIDENCE = 0.54     # xem ghi chú ở đầu file
MIN_SECONDS = 4.0         # ngắn hơn thì không đủ dữ liệu
CONFIDENT_MARGIN = 0.10   # chỉ để báo thêm trong JSON (margin_ok), KHÔNG dùng để loại kết quả
USE_BASS_PROFILE = False  # thử nghiệm A: không có lợi trên bộ kiểm tra, mặc định tắt
USE_TUNING = True         # bù độ lệch tuning của từng bài

NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
KK_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
MAJ_SCALE = [0, 2, 4, 5, 7, 9, 11]
MIN_SCALE = [0, 2, 3, 5, 7, 8, 10]


def _pearson(a: np.ndarray, b: np.ndarray) -> float:
    a = a - a.mean()
    b = b - b.mean()
    d = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / d) if d > 0 else 0.0


def _pc(freq: float) -> int:
    return int(round(69 + 12 * np.log2(freq / 440.0))) % 12




def _frame_peaks(seg: np.ndarray, N: int, win: np.ndarray, freqs: np.ndarray, lo: int, hi: int):
    """FFT một đoạn -> (tần số đỉnh, biên độ đỉnh đã chuẩn hoá theo đỉnh lớn nhất). Chưa lọc theo cao độ."""
    mag = np.abs(np.fft.rfft(seg * win))
    floor = sg.medfilt(mag, 49) + 1e-9
    cand = np.arange(max(lo, 1), hi)
    is_pk = (mag[cand] > mag[cand - 1]) & (mag[cand] >= mag[cand + 1]) & (mag[cand] > 2.65 * floor[cand])
    pf, pm = [], []
    for i in cand[is_pk]:
        a, b, c = np.log(mag[i - 1] + 1e-12), np.log(mag[i] + 1e-12), np.log(mag[i + 1] + 1e-12)
        d = 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
        f = float(freqs[i] + d * (freqs[1] - freqs[0]))
        if f > 0:
            pf.append(f)
            pm.append(float(mag[i]))
    if not pf:
        return None
    pm_a = np.array(pm)
    return np.array(pf), pm_a / pm_a.max()


def _estimate_tuning_cents(frames) -> float:
    """Độ lệch tuning toàn bài (cent, -50..50) = đỉnh của histogram độ lệch các đỉnh mạnh."""
    devs, wts = [], []
    for pf, pm, _ in frames:
        m = 69 + 12 * np.log2(pf / 440.0)
        dev = (m - np.round(m)) * 100.0
        keep = pm >= 0.3
        devs.extend(dev[keep].tolist())
        wts.extend(pm[keep].tolist())
    if len(devs) < 50:
        return 0.0
    h, edges = np.histogram(devs, bins=20, range=(-50, 50), weights=wts)
    h = np.convolve(np.r_[h[-1], h, h[0]], np.ones(3) / 3, mode="valid")  # làm mượt vòng tròn
    k = int(np.argmax(h))
    return float((edges[k] + edges[k + 1]) / 2.0)


def analyze_samples(x: np.ndarray, sr: int, nframes: int = 260, flen: int = 16384, dec: int = 4) -> Optional[Dict]:
    n = len(x)
    if n < flen * 8:
        return None
    starts = np.linspace(0.03 * n, 0.96 * n - flen, nframes).astype(int)
    N = flen // dec
    fs = sr / dec
    win = np.hanning(N)
    freqs = np.fft.rfftfreq(N, 1.0 / fs)
    lo, hi = int(np.searchsorted(freqs, 52)), int(np.searchsorted(freqs, 1320))

    # ---- Lượt 1: đỉnh phổ từng đoạn (chưa lọc cao độ)
    frames = []
    for idx, s in enumerate(starts):
        seg = x[s:s + flen]
        if len(seg) < flen or float(np.sqrt((seg ** 2).mean())) < 0.0035:
            continue
        seg = sg.decimate(seg, dec, ftype="fir", zero_phase=False)[:N]
        if len(seg) < N:
            continue
        r = _frame_peaks(seg, N, win, freqs, lo, hi)
        if r is not None:
            frames.append((r[0], r[1], idx / len(starts)))
    if len(frames) < 5:
        return None

    # ---- Thay đổi B: bù tuning
    tune = _estimate_tuning_cents(frames) if USE_TUNING else 0.0
    ref_a4 = 440.0 * 2 ** (tune / 1200.0)

    # ---- Lượt 2: lọc cao độ (theo tuning của bài), gom nốt / bass / hợp âm
    chroma = np.zeros(12)
    bass = np.zeros(12)
    chords = np.zeros(24)
    endchord = np.zeros(24)
    used = 0
    for pf_all, pm_all, pos in frames:
        m = 69 + 12 * np.log2(pf_all / ref_a4)
        ok = np.abs(m - np.round(m)) * 100 <= 36
        if not ok.any():
            continue
        pf_a, pm_a = pf_all[ok], pm_all[ok]
        w = np.sqrt(pm_a)
        for j in range(len(pf_a)):  # họa âm bậc 3 của nốt thấp hơn mạnh hơn -> giảm điểm
            for k in range(len(pf_a)):
                if pf_a[k] < pf_a[j] and pm_a[k] > pm_a[j] and abs(1200 * np.log2(pf_a[j] / (3 * pf_a[k]))) < 40:
                    w[j] *= 0.25
                    break
        pw = 1.25 if pos >= 0.78 else (1.10 if pos >= 0.12 else 1.0)
        pcs = np.round(69 + 12 * np.log2(pf_a / ref_a4)).astype(int) % 12
        c12 = np.zeros(12)
        for pc, ww in zip(pcs, w):
            c12[pc] += ww
        chroma += c12 * pw
        used += 1

        bi = [j for j in range(len(pf_a)) if 55 <= pf_a[j] <= 240 and pm_a[j] >= 0.4]
        if bi:
            j = min(bi, key=lambda t: pf_a[t])
            bass[pcs[j]] += pw

        best, bs = None, 0.0
        for r in range(12):
            for q, t3 in enumerate((4, 3)):
                sc = c12[r] + 0.9 * c12[(r + t3) % 12] + 0.8 * c12[(r + 7) % 12] \
                    - 0.15 * (c12.sum() - c12[r] - c12[(r + t3) % 12] - c12[(r + 7) % 12])
                if sc > bs:
                    bs, best = sc, r + 12 * q
        if best is not None:
            chords[best] += pw
            if pos >= 0.90:
                endchord[best] += 1

    if used < 5:
        return None

    cn = chroma / chroma.sum()
    bn = bass / (bass.sum() + 1e-9)
    hn = chords / (chords.sum() + 1e-9)
    en = endchord / (endchord.sum() + 1e-9)

    scores = []
    for q, prof, scale in ((0, KK_MAJ, MAJ_SCALE), (1, KK_MIN, MIN_SCALE)):
        for k in range(12):
            rolled = np.roll(prof, k)
            r = _pearson(cn, rolled)
            r_bass = _pearson(bn, rolled) if bn.sum() > 0 else 0.0     # Thay đổi A
            inscale = sum(cn[(k + d) % 12] for d in scale)
            tonic_chord = hn[k + 12 * q] / (hn.max() + 1e-9)
            quals = [0, 1, 1, 0, 0, 1] if q == 0 else [1, 1, 0, 1, 1, 0]
            chord_dia = sum(hn[(k + scale[i]) % 12 + 12 * quals[i]] for i in range(6))
            bass_term = 0.5 * r_bass if USE_BASS_PROFILE else (0.8 * bn[k] + 0.3 * bn[(k + 7) % 12])
            s = (0.5 * r + bass_term + 0.5 * chord_dia
                 + 0.3 * tonic_chord + 0.5 * en[k + 12 * q] + 0.4 * inscale)
            scores.append((float(s), k, q))
    scores.sort(reverse=True)
    s1, k1, q1 = scores[0]
    s2, k2, q2 = scores[1]
    margin = s1 - s2
    return {
        "key": NAMES[k1] + ("m" if q1 else ""),
        "alt": NAMES[k2] + ("m" if q2 else ""),           # Thay đổi C
        "confident": bool(margin >= CONFIDENT_MARGIN),     # Thay đổi C (ngưỡng tạm thời)
        "score": round(s1, 3),
        "margin": round(margin, 3),
        "top3": [NAMES[k] + ("m" if q else "") for _, k, q in scores[:3]],
        "tuning_cents": round(tune, 1),
        "frames_used": used,
    }


def load_audio(path: str):
    """Đọc file -> (mảng mono float32, sample_rate). Ưu tiên soundfile (nhanh), không được thì dùng librosa."""
    try:
        import soundfile as sf
        x, sr = sf.read(path, dtype="float32", always_2d=False)
    except Exception as first_error:
        try:
            import librosa
            x, sr = librosa.load(path, sr=None, mono=True)
        except Exception as second_error:
            raise RuntimeError(
                "Không đọc được file âm thanh '%s': %s. Với file .mp3/.m4a hãy cài ffmpeg." % (path, second_error)
            ) from first_error
    x = np.asarray(x, dtype=np.float32)
    if x.ndim > 1:
        x = x.mean(axis=1)
    return x, int(sr)


def analyze_file(path: str) -> Dict:
    """Dò key cả file. Ném RuntimeError/ValueError khi lỗi (nơi gọi in ra stderr)."""
    x, sr = load_audio(path)
    duration = len(x) / float(sr) if sr else 0.0
    if duration < MIN_SECONDS:
        raise ValueError("File quá ngắn (%.1f giây) để dò key" % duration)
    res = analyze_samples(x, sr)
    if not res:
        raise ValueError("Không đủ đoạn có tiếng để dò key (file quá nhỏ tiếng hoặc quá ngắn)")
    key = res["key"]
    minor = key.endswith("m")
    root = key[:-1] if minor else key
    margin = float(res["margin"])
    return {
        "file_path": path,
        "duration_sec": round(duration, 2),
        "sample_rate": sr,
        "engine": "fast",
        "key": root,
        "scale": "minor" if minor else "major",
        "key_label": "%s %s" % (root, "minor" if minor else "major"),
        "confidence": round(min(MAX_CONFIDENCE, max(0.0, 0.20 + margin)), 2),
        "is_reliable": True,
        "margin": round(margin, 3),
        "margin_ok": bool(margin >= CONFIDENT_MARGIN),
        "alt": res["alt"],
        "top3": res["top3"],
        "tuning_cents": res["tuning_cents"],
        "frames_used": res["frames_used"],
    }


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="AUTO_MENU_AI — Bộ dò key nhanh (lấy mẫu cả bài + FFT)")
    ap.add_argument("files", nargs="+", help="Đường dẫn file âm thanh")
    ap.add_argument("--json", action="store_true", help="Xuất JSON")
    args = ap.parse_args(argv)
    code = 0
    for path in args.files:
        try:
            r = analyze_file(path)
        except Exception as exc:  # không để traceback dài ra ngoài: app chỉ đọc mã thoát + stderr
            print("[LỖI] %s: %s" % (path, exc), file=sys.stderr)
            code = 1
            continue
        if args.json:
            print(json.dumps(r, ensure_ascii=True))
        else:
            print("%s -> %s (%s) | cách biệt điểm %.2f | key thứ hai: %s" % (
                path, r["key_label"], "thứ" if r["scale"] == "minor" else "trưởng", r["margin"], r["alt"]))
    return code


if __name__ == "__main__":
    warnings.filterwarnings("ignore")
    sys.exit(main())
