# -*- coding: utf-8 -*-
"""
tools/keybench/fastkey.py — BẢN THỬ dò key nhanh cho AUTO_MENU_AI (KHÔNG nối vào app).

Ý tưởng chung (tự viết, không chép mã của plugin nào):
  1. Đọc cả file, chỉ lấy ~260 đoạn ngắn rải đều từ 3% đến 96% bài.
  2. Hạ tần số lấy mẫu 4 lần, FFT 4096 điểm.
  3. Chỉ giữ đỉnh nốt thật (cao hơn nền xung quanh), bỏ đỉnh lệch cao độ, giảm họa âm bậc 3.
  4. Gom 12 nốt + nốt bass thấp nhất + hợp âm từng đoạn, đoạn cuối bài tính nặng hơn.
  5. Chấm 24 key (12 trưởng + 12 thứ) rồi chọn key điểm cao nhất.

Bản 2b (3 thay đổi, đều có lý do âm nhạc, không chỉnh hằng số theo 9 bài thử):
  A. (TUỲ CHỌN, mặc định tắt) Bass: so cả phân bố nốt bass với mẫu key (Pearson) thay vì chỉ thưởng nốt bass
     hay lặp nhất (bass thường nằm trên nốt ÁT nên cách cũ dễ nhầm Am <-> Em). Chưa chứng minh có lợi.
  B. Tuning: ước lượng độ lệch tuning của từng bài trước khi lọc đỉnh (bài hát tune lệch A=440 vẫn giữ được nốt).
  C. Báo thêm key thứ hai (alt) và cờ "confident": cách biệt điểm quá nhỏ thì không dám kết luận.

Cần: pip install numpy scipy librosa soundfile
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional

import numpy as np
import scipy.signal as sg

NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
KK_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
MAJ_SCALE = [0, 2, 4, 5, 7, 9, 11]
MIN_SCALE = [0, 2, 3, 5, 7, 8, 10]
CONFIDENT_MARGIN = 0.10   # TẠM THỜI: ngưỡng chọn sau khi đã thấy 9 bài đầu, CẦN kiểm chứng trên bài mới
USE_BASS_PROFILE = False  # Thay đổi A: mặc định TẮT vì trên 9 bài đầu không có lợi (bài 8 từ đúng thành sai)
USE_TUNING = True         # Thay đổi B


def _pearson(a: np.ndarray, b: np.ndarray) -> float:
    a = a - a.mean()
    b = b - b.mean()
    d = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / d) if d > 0 else 0.0


def _pc(freq: float) -> int:
    return int(round(69 + 12 * np.log2(freq / 440.0))) % 12


def load_audio(path: str):
    """Đọc file (mp3/wav/flac...) -> (mảng mono float32, sample_rate). Dùng librosa."""
    import librosa
    x, sr = librosa.load(path, sr=None, mono=True)
    return x.astype(np.float32), int(sr)


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


def analyze_file(path: str) -> Dict:
    """Trả về dict có key/score/margin + decode_s (giải mã) + analyze_s (phân tích)."""
    t0 = time.time()
    x, sr = load_audio(path)
    t1 = time.time()
    res = analyze_samples(x, sr) or {"key": None, "alt": None, "confident": False, "score": 0.0, "margin": 0.0, "top3": [], "frames_used": 0}
    res["decode_s"] = round(t1 - t0, 2)
    res["analyze_s"] = round(time.time() - t1, 2)
    return res


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Cách dùng: python fastkey.py <file nhạc>")
        sys.exit(1)
    print(analyze_file(sys.argv[1]))
