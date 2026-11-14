# -*- coding: utf-8 -*-
"""
tools/keybench/run_bench.py — Đo tốc độ + độ đúng của bộ dò key trên một thư mục bài hát.
KHÔNG sửa app, KHÔNG sửa file nhạc. Chỉ đọc và in bảng kết quả.

Cách dùng (chạy trong thư mục G:\\AUTO_MENU_AI):
    py -3 tools\\keybench\\run_bench.py --songs "G:\\keybench_songs"
    py -3 tools\\keybench\\run_bench.py --songs "G:\\keybench_songs" --python   (thêm cả bộ Python cũ để so)

Quy ước: tên file nhạc bắt đầu bằng số thứ tự bài (vd "1 HAY TRAO CHO ANH.mp3") khớp cột stt trong truth.csv.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, ROOT)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT = {"DB": "C#", "EB": "D#", "GB": "F#", "AB": "G#", "BB": "A#"}
EXTS = (".mp3", ".wav", ".flac", ".m4a", ".ogg")


def parse_key(text):
    """'D#m' / 'Ebm' / 'C' / 'A minor' -> (pitch_class 0-11, is_minor) hoặc None."""
    t = str(text or "").strip().replace("♯", "#").replace("♭", "b")
    m = re.match(r"^([A-Ga-g])([#b]?)\s*(.*)$", t)
    if not m:
        return None
    letter, acc = m.group(1).upper(), m.group(2)
    if acc == "b":
        root = FLAT.get(letter + "B")
    else:
        root = letter + acc
    if root not in NAMES:
        return None
    rest = m.group(3).strip().lower()
    minor = rest.startswith("m") and not rest.startswith("maj")
    if rest.startswith("min"):
        minor = True
    return NAMES.index(root), minor


def judge(truth_list, found):
    """'DUNG' (cùng key), 'TUONG DUONG' (key song song/tương đương dùng cùng nốt), 'SAI', hoặc '---'."""
    f = parse_key(found)
    if f is None:
        return "---"
    for tr in truth_list:
        t = parse_key(tr)
        if t is None:
            continue
        if t == f:
            return "DUNG"
    for tr in truth_list:
        t = parse_key(tr)
        if t is None:
            continue
        # tương đương: Am <-> C (cùng thang âm, nốt chủ lệch 3 nửa cung)
        rel_major_of_minor = (t[0] + 3) % 12 if t[1] else None
        rel_minor_of_major = (t[0] + 9) % 12 if not t[1] else None
        if t[1] and (not f[1]) and f[0] == rel_major_of_minor:
            return "TUONG DUONG"
        if (not t[1]) and f[1] and f[0] == rel_minor_of_major:
            return "TUONG DUONG"
    return "SAI"


def load_truth(path):
    out = {}
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            try:
                n = int(str(row.get("stt", "")).strip())
            except ValueError:
                continue
            keys = [str(row.get("key_that", "")).strip()]
            extra = str(row.get("chap_nhan_them", "") or "").strip()
            if extra:
                keys += [k.strip() for k in extra.split("|") if k.strip()]
            out[n] = {"title": str(row.get("ten_bai", "")).strip(), "keys": keys}
    return out


def find_songs(folder):
    songs = {}
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith(EXTS):
            continue
        m = re.match(r"^\s*(\d+)", name)
        if m:
            songs[int(m.group(1))] = os.path.join(folder, name)
    return songs


def main():
    ap = argparse.ArgumentParser(description="Đo bộ dò key trên thư mục bài hát")
    ap.add_argument("--songs", required=True, help="Thư mục chứa file nhạc (nên để NGOÀI thư mục dự án)")
    ap.add_argument("--truth", default=os.path.join(HERE, "truth.csv"))
    ap.add_argument("--from", dest="n_from", type=int, default=1, help="Chỉ đo từ bài số này (vd 10 = chỉ 20 bài mới)")
    ap.add_argument("--to", dest="n_to", type=int, default=999, help="Chỉ đo đến bài số này")
    ap.add_argument("--python", action="store_true", help="Chạy thêm core/key_detector.py (chậm hơn) để so sánh")
    a = ap.parse_args()

    if not os.path.isdir(a.songs):
        print("Không thấy thư mục nhạc: " + a.songs)
        return 2
    truth = load_truth(a.truth)
    songs = find_songs(a.songs)
    if not songs:
        print("Thư mục không có file nhạc nào bắt đầu bằng số thứ tự (1, 2, 3...).")
        return 2

    import fastkey
    kd = None
    if a.python:
        try:
            from core.key_detector import analyze_file as kd_analyze
            kd = kd_analyze
        except Exception as e:
            print("Không nạp được core/key_detector.py (%s). Bỏ qua cột Python." % e)

    rows = []
    for n in sorted(songs):
        t = truth.get(n)
        if not t or n < a.n_from or n > a.n_to:
            continue
        fk = fastkey.analyze_file(songs[n])
        row = {"stt": n, "title": t["title"], "truth": t["keys"][0],
               "fast_key": fk["key"], "fast_verdict": judge(t["keys"], fk["key"]),
               "fast_alt": fk.get("alt"), "fast_confident": bool(fk.get("confident")),
               "fast_margin": fk["margin"], "fast_decode_s": fk["decode_s"], "fast_analyze_s": fk["analyze_s"]}
        if kd:
            t0 = time.time()
            try:
                r = kd(songs[n])
                pk = r.key + ("m" if r.scale == "minor" else "")
                row.update({"py_key": pk, "py_verdict": judge(t["keys"], pk),
                            "py_conf": round(float(r.confidence), 2), "py_reliable": bool(r.is_reliable),
                            "py_s": round(time.time() - t0, 1)})
            except Exception as e:
                row.update({"py_key": "LOI", "py_verdict": "---", "py_conf": 0, "py_reliable": False, "py_s": 0})
        rows.append(row)
        line = "%d. %-26s that=%-4s nhanh=%-4s %-11s %-10s margin=%.2f giai-ma=%.1fs phan-tich=%.2fs" % (
            n, t["title"][:26], row["truth"], row["fast_key"], row["fast_verdict"],
            "chac" if row["fast_confident"] else "KHONG-CHAC",
            row["fast_margin"], row["fast_decode_s"], row["fast_analyze_s"])
        if kd:
            line += " | python=%-4s %-11s tin-cay=%.2f %s %.1fs" % (
                row["py_key"], row["py_verdict"], row["py_conf"], "chac" if row["py_reliable"] else "KHONG-CHAC", row["py_s"])
        print(line, flush=True)

    if not rows:
        print("Không ghép được bài nào với truth.csv (kiểm tra số thứ tự đầu tên file).")
        return 2

    def count(prefix):
        v = [r[prefix + "_verdict"] for r in rows]
        return v.count("DUNG"), v.count("TUONG DUONG"), v.count("SAI"), len(v)

    d, e, s, total = count("fast")
    print("\n=== TỔNG KẾT (%d bài) ===" % total)
    print("Bản nhanh : đúng %d, tương đương %d, sai %d | phân tích TB %.2fs, giải mã TB %.2fs" % (
        d, e, s, sum(r["fast_analyze_s"] for r in rows) / total, sum(r["fast_decode_s"] for r in rows) / total))
    fc = [r for r in rows if r["fast_confident"]]
    fc_ok = sum(1 for r in fc if r["fast_verdict"] == "DUNG")
    print("  Riêng các bài bản nhanh báo 'chắc': %d bài, đúng %d, sai %d (ngưỡng margin tạm thời)." % (len(fc), fc_ok, len(fc) - fc_ok))
    if kd:
        d, e, s, total = count("py")
        used = [r for r in rows if r["py_reliable"]]
        used_ok = sum(1 for r in used if r["py_verdict"] == "DUNG")
        print("Bộ Python : đúng %d, tương đương %d, sai %d | TB %.1fs" % (d, e, s, sum(r["py_s"] for r in rows) / total))
        print("  Trong thực tế Menu chỉ dùng kết quả 'chắc': %d bài, đúng %d bài, sai %d bài." % (
            len(used), used_ok, len(used) - used_ok))

    out_csv = os.path.join(HERE, "results.csv")
    with open(out_csv, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=sorted({k for r in rows for k in r}))
        w.writeheader()
        w.writerows(rows)
    print("\nĐã lưu kết quả: " + out_csv)
    return 0


if __name__ == "__main__":
    sys.exit(main())
