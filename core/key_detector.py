# -*- coding: utf-8 -*-
"""
core/key_detector.py — Module dò key âm thanh cho AUTO_MENU_AI
================================================================

Cơ sở lý thuyết:
    Thuật toán Krumhansl–Schmuckler (1990) kết hợp đặc trưng Chroma CQT
    (Constant-Q Transform) thay vì FFT thô để bền hơn với nhiễu và biến
    đổi tần số. So sánh vector phân bố 12 lớp cao độ với 24 mẫu tham chiếu
    (12 thang trưởng + 12 thang thứ) bằng hệ số tương quan Pearson.

Luồng xử lý:
    file âm thanh → load & chuẩn hóa → chroma_cqt → trung bình theo khung
    → so sánh với 24 mẫu → xếp hạng → lọc ổn định → xuất key + độ tin cậy
    → (tùy chọn) phát hiện đoạn đổi key trong bài → ước lượng tần số A4.

Phụ thuộc:
    pip install librosa numpy soundfile
    (để đọc .mp3 cần cài thêm ffmpeg trên hệ thống)

Cách dùng nhanh:
    python core/key_detector.py Cuoi-Deu.mp3
    python core/key_detector.py Cuoi-Deu.mp3 --segments --top 3

Tích hợp trong code:
    from core.key_detector import KeyDetector, analyze_file
    result = analyze_file("Cuoi-Deu.mp3")
    print(result["key"], result["scale"], result["confidence"])

Tác giả: AUTO_MENU_AI team
"""

from __future__ import annotations

import argparse
import sys
import warnings
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional, Tuple

import numpy as np

try:
    import librosa
    _HAS_LIBROSA = True
except ImportError:  # pragma: no cover
    _HAS_LIBROSA = False
    librosa = None  # type: ignore


# ---------------------------------------------------------------------------
# 1. Mẫu tham chiếu Krumhansl–Kessler (1982) — giá trị công bố chuẩn
# ---------------------------------------------------------------------------
# Thứ tự nốt: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
# (khớp với analyze_song.py ở thư mục gốc repo)
MAJOR_PROFILE = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    dtype=np.float64,
)
MINOR_PROFILE = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    dtype=np.float64,
)

NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NOTE_NAMES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

SCALE_NAMES_VI = {
    "major": "Trưởng",
    "minor": "Thứ",
}

# Ngưỡng mặc định
DEFAULT_SR = 22050            # tần số mẫu khi load (đủ cho chroma, nhẹ máy)
DEFAULT_HOP_LENGTH = 512      # bước nhảy khung CQT (khoảng 23ms ở 22050Hz)
DEFAULT_WINDOW_SEC = 3.0      # cửa sổ ổn định (giây) — tránh nhảy key do nhiễu
MIN_CONFIDENCE = 0.35         # dưới ngưỡng này → đánh dấu "không chắc chắn"
KEY_CHANGE_THRESHOLD = 0.10   # chênh lệch điểm tối thiểu (trên cùng cửa sổ) để công nhận đổi key


# ---------------------------------------------------------------------------
# 2. Cấu trúc dữ liệu đầu ra
# ---------------------------------------------------------------------------
@dataclass
class KeyCandidate:
    """Một ứng viên key duy nhất."""
    root: str               # ví dụ "C#"
    scale: str              # "major" | "minor"
    score: float            # điểm tương quan Pearson (-1..1)
    label: str = ""         # ví dụ "C# major"
    label_vi: str = ""      # ví dụ "C# Trưởng"

    def __post_init__(self) -> None:
        if not self.label:
            self.label = f"{self.root} {self.scale}"
        if not self.label_vi:
            self.label_vi = f"{self.root} {SCALE_NAMES_VI.get(self.scale, self.scale)}"


@dataclass
class KeySegment:
    """Đoạn nhạc có key không đổi (dùng khi phát hiện đổi key)."""
    start_sec: float
    end_sec: float
    key: str
    scale: str
    score: float


@dataclass
class AnalysisResult:
    """Kết quả phân tích đầy đủ của một file âm thanh."""
    file_path: str
    duration_sec: float
    sample_rate: int
    key: str                        # chủ âm, ví dụ "A"
    scale: str                      # "major" | "minor"
    key_label: str                  # ví dụ "A minor"
    key_label_vi: str               # ví dụ "A Thứ"
    confidence: float               # 0..1 — độ tin cậy chuẩn hóa
    raw_score: float                # điểm Pearson gốc (-1..1)
    is_reliable: bool               # confidence >= MIN_CONFIDENCE
    top_candidates: List[Dict[str, Any]] = field(default_factory=list)
    segments: List[Dict[str, Any]] = field(default_factory=list)
    reference_a4_hz: Optional[float] = None
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def pretty(self) -> str:
        lines = [
            f"File        : {self.file_path}",
            f"Thời lượng  : {self.duration_sec:.2f}s  (sr={self.sample_rate}Hz)",
            f"Key dự đoán : {self.key_label_vi}  ({self.key_label})",
            f"Điểm số     : {self.raw_score:+.3f}  |  Độ tin cậy: {self.confidence:.2%}",
            f"Đánh giá    : {'CHẮC CHẮN' if self.is_reliable else 'KHÔNG CHẮC CHẮN — cần kiểm tra lại bằng tai'}",
        ]
        if self.reference_a4_hz:
            lines.append(f"Tần số A4 ước lượng: {self.reference_a4_hz:.1f} Hz")
        if self.top_candidates:
            lines.append("Top ứng viên:")
            for i, c in enumerate(self.top_candidates, 1):
                lines.append(f"  {i}. {c['label_vi']:<14} điểm={c['score']:+.3f}")
        if self.segments:
            lines.append("Các đoạn (phát hiện đổi key):")
            for s in self.segments:
                lines.append(
                    f"  [{s['start_sec']:6.2f}s → {s['end_sec']:6.2f}s]  "
                    f"{s['key']} {s['scale']}  (điểm={s['score']:+.3f})"
                )
        if self.warnings:
            lines.append("Cảnh báo:")
            for w in self.warnings:
                lines.append(f"  ! {w}")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# 3. Các hàm tiện ích toán học
# ---------------------------------------------------------------------------
def _zscore(x: np.ndarray) -> np.ndarray:
    """Chuẩn hóa vector về trung bình 0, độ lệch chuẩn 1 (tránh chia cho 0)."""
    x = np.asarray(x, dtype=np.float64)
    mu = x.mean()
    sigma = x.std()
    if sigma < 1e-9:
        return np.zeros_like(x)
    return (x - mu) / sigma


def pearson_r(x: np.ndarray, y: np.ndarray) -> float:
    """Hệ số tương quan Pearson, tự implement bằng numpy (không cần scipy)."""
    xz = _zscore(x)
    yz = _zscore(y)
    if xz.std() < 1e-9 or yz.std() < 1e-9:
        return 0.0
    return float(np.dot(xz, yz) / len(xz))


def build_templates() -> Tuple[np.ndarray, List[Tuple[str, str]]]:
    """
    Xây dựng 24 mẫu tham chiếu bằng cách xoay vòng 2 profile cơ bản.
    Trả về (ma trận 24×12, danh sách (chủ âm, thang) tương ứng).
    """
    templates: List[np.ndarray] = []
    labels: List[Tuple[str, str]] = []
    for i in range(12):
        templates.append(np.roll(MAJOR_PROFILE, i))
        labels.append((NOTE_NAMES_SHARP[i], "major"))
        templates.append(np.roll(MINOR_PROFILE, i))
        labels.append((NOTE_NAMES_SHARP[i], "minor"))
    return np.array(templates), labels


TEMPLATES, TEMPLATE_LABELS = build_templates()


def score_chroma_vector(chroma_vec: np.ndarray) -> List[Tuple[float, str, str]]:
    """
    Chấm điểm một vector chroma 12 chiều với cả 24 mẫu.
    Trả về danh sách (điểm, chủ âm, thang) đã SẮP XẾP GIẢM DẦN theo điểm.
    """
    results = []
    for tpl, (root, scale) in zip(TEMPLATES, TEMPLATE_LABELS):
        results.append((pearson_r(chroma_vec, tpl), root, scale))
    results.sort(key=lambda r: r[0], reverse=True)
    return results


def normalize_confidence(best: float, second: float) -> float:
    """
    Chuẩn hóa độ tin cậy từ điểm số tốt nhất và thứ hai.
    Công thức: căn cứ vào khoảng cách tương đối giữa top-1 và top-2,
    giới hạn trong [0, 1]. Khoảng cách càng lớn → càng tin cậy.
    """
    gap = max(best - second, 0.0)
    # điểm Pearson thực tế thường rơi vào 0.2..0.9; gap 0.3 là rất rõ ràng
    conf = min(gap / 0.3, 1.0) * 0.7 + max(best, 0.0) * 0.3
    return float(np.clip(conf, 0.0, 1.0))


# ---------------------------------------------------------------------------
# 4. Lớp chính KeyDetector
# ---------------------------------------------------------------------------
class KeyDetector:
    """
    Bộ dò key có trạng thái — dùng lại cho nhiều file, hỗ trợ xử lý luồng.

    Tham số:
        sr            : tần số mẫu mục tiêu khi load audio
        hop_length    : bước nhảy khung khi tính chroma
        window_sec    : độ dài cửa sổ ổn định (giây) để làm mượt kết quả
        min_confidence: ngưỡng độ tin cậy tối thiểu để công nhận kết quả
    """

    def __init__(
        self,
        sr: int = DEFAULT_SR,
        hop_length: int = DEFAULT_HOP_LENGTH,
        window_sec: float = DEFAULT_WINDOW_SEC,
        min_confidence: float = MIN_CONFIDENCE,
    ) -> None:
        if not _HAS_LIBROSA:
            raise ImportError(
                "Thư viện 'librosa' chưa được cài đặt. "
                "Chạy: pip install librosa numpy soundfile"
            )
        self.sr = sr
        self.hop_length = hop_length
        self.window_sec = window_sec
        self.min_confidence = min_confidence

    # -- 4.1 Load & tiền xử lý ---------------------------------------------
    def load_audio(self, file_path: str) -> Tuple[np.ndarray, int]:
        """
        Load file âm thanh, chuyển mono, chuẩn hóa biên độ về [-1, 1].
        Hỗ trợ .wav .mp3 .flac .ogg (cần ffmpeg cho mp3).
        """
        try:
            y, sr = librosa.load(file_path, sr=self.sr, mono=True)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"Không đọc được file âm thanh '{file_path}': {exc}. "
                "Với file .mp3 hãy cài ffmpeg: sudo apt install ffmpeg"
            ) from exc
        if y.size == 0:
            raise ValueError(f"File '{file_path}' không chứa dữ liệu âm thanh.")
        # Cắt khoảng lặng hai đầu để tránh nhiễu ảnh hưởng đến phân bố nốt
        y, _ = librosa.effects.trim(y, top_db=30)
        # Chuẩn hóa biên độ
        peak = np.abs(y).max()
        if peak > 1e-6:
            y = y / peak
        return y, sr

    # -- 4.2 Trích xuất đặc trưng Chroma -----------------------------------
    def compute_chroma(self, y: np.ndarray) -> np.ndarray:
        """
        Tính ma trận chroma (12 × N_khung) bằng Constant-Q Transform.
        CQT bền hơn FFT thô vì phân giải logarit tự nhiên theo cao độ.
        """
        chroma = librosa.feature.chroma_cqt(
            y=y,
            sr=self.sr,
            hop_length=self.hop_length,
            n_chroma=12,
            bins_per_octave=12 * 3,  # 3 bin/nốt → làm mượt, giảm sai số tần số
        )
        # Làm mượt theo thời gian bằng bộ lọc trung bình 7 khung (~160ms)
        chroma = np.maximum(chroma, 0.0)
        kernel = np.ones(7) / 7.0
        for i in range(12):
            chroma[i] = np.convolve(chroma[i], kernel, mode="same")
        return chroma

    # -- 4.3 Dò key toàn bài (global) --------------------------------------
    def detect_global(self, chroma: np.ndarray) -> List[KeyCandidate]:
        """Dò key của cả bài bằng cách trung bình chroma theo thời gian."""
        chroma_avg = chroma.mean(axis=1)
        ranked = score_chroma_vector(chroma_avg)
        return [
            KeyCandidate(root=root, scale=scale, score=score)
            for score, root, scale in ranked
        ]

    # -- 4.4 Dò key theo khung & phát hiện đổi key -------------------------
    def detect_segments(
        self,
        chroma: np.ndarray,
        change_threshold: float = 0.10,
    ) -> List[KeySegment]:
        """
        Chia bài thành các cửa sổ chồng lấn, dò key từng cửa sổ,
        gộp các cửa sổ liền kề có cùng key thành đoạn. Một cửa sổ được
        công nhận đổi key khi top-1 của nó KHÁC key hiện tại VÀ điểm top-1
        cao hơn điểm của key hiện tại (tính lại trên chính cửa sổ đó) ít
        nhất `change_threshold`. Tránh lỗi so sánh điểm của hai cửa sổ
        khác nhau (chất lượng tín hiệu mỗi cửa sổ không giống nhau).
        """
        frames_per_window = max(
            1, int(self.window_sec * self.sr / self.hop_length)
        )
        hop_frames = max(1, frames_per_window // 4)  # chồng lấn 75% → mượt hơn
        n_frames = chroma.shape[1]

        # Mỗi phần tử: (t_start, ranked_list) với ranked_list = [(điểm, root, scale)...]
        per_window: List[Tuple[float, List[Tuple[float, str, str]]]] = []
        for start in range(0, max(1, n_frames - frames_per_window + 1), hop_frames):
            end = min(start + frames_per_window, n_frames)
            seg = chroma[:, start:end].mean(axis=1)
            ranked = score_chroma_vector(seg)
            t_start = start * self.hop_length / self.sr
            per_window.append((t_start, ranked))

        if not per_window:
            return []

        window_dur = frames_per_window * self.hop_length / self.sr
        segments: List[KeySegment] = []

        # Khởi tạo key hiện tại từ cửa sổ đầu tiên
        cur_t0 = per_window[0][0]
        cur_score, cur_root, cur_scale = per_window[0][1][0]
        cur_scores: List[float] = [cur_score]

        def score_of(ranked: List[Tuple[float, str, str]], root: str, scale: str) -> float:
            """Điểm của một key cụ thể trong bảng xếp hạng của một cửa sổ."""
            for s, r, sc in ranked:
                if r == root and sc == scale:
                    return s
            return -1.0

        for t_start, ranked in per_window[1:]:
            top_score, top_root, top_scale = ranked[0]
            same_key = (top_root == cur_root) and (top_scale == cur_scale)
            if same_key:
                cur_scores.append(top_score)
                continue
            # So sánh CÙNG cửa sổ: top-1 mới vs key hiện tại (tính lại trên cửa sổ này)
            cur_score_here = score_of(ranked, cur_root, cur_scale)
            if (top_score - cur_score_here) > change_threshold:
                segments.append(
                    KeySegment(
                        start_sec=cur_t0,
                        end_sec=t_start + window_dur * 0.5,
                        key=cur_root,
                        scale=cur_scale,
                        score=float(np.mean(cur_scores)),
                    )
                )
                cur_t0 = t_start + window_dur * 0.5
                cur_root, cur_scale, cur_score = top_root, top_scale, top_score
                cur_scores = [top_score]
            else:
                # chưa đủ bằng chứng → giữ nguyên key cũ
                cur_scores.append(cur_score_here)

        total_dur = n_frames * self.hop_length / self.sr
        segments.append(
            KeySegment(
                start_sec=cur_t0,
                end_sec=total_dur,
                key=cur_root,
                scale=cur_scale,
                score=float(np.mean(cur_scores)),
            )
        )
        return self._merge_short_segments(segments, min_dur=1.5)

    @staticmethod
    def _merge_short_segments(
        segs: List[KeySegment], min_dur: float
    ) -> List[KeySegment]:
        if len(segs) <= 1:
            return segs
        merged: List[KeySegment] = []
        for s in segs:
            dur = s.end_sec - s.start_sec
            if dur < min_dur and merged:
                prev = merged[-1]
                # gộp vào đoạn trước, giữ key của đoạn dài hơn
                if (s.end_sec - s.start_sec) <= (prev.end_sec - prev.start_sec):
                    prev.end_sec = s.end_sec
                else:
                    prev.key, prev.scale, prev.score = s.key, s.scale, s.score
                    prev.end_sec = s.end_sec
            else:
                merged.append(s)
        return merged

    # -- 4.5 Ước lượng tần số A4 tham chiếu --------------------------------
    def estimate_reference_pitch(self, y: np.ndarray) -> Optional[float]:
        """
        Ước lượng tần số A4 của bản ghi (thường 440Hz, có thể 441/442Hz).
        Dùng piptrack của librosa để dò các đỉnh tần số bền, rồi tìm độ lệch
        so với lưới 12 cung đều. Trả về None nếu tín hiệu quá yếu.
        """
        try:
            pitches, magnitudes = librosa.piptrack(
                y=y, sr=self.sr, hop_length=self.hop_length
            )
        except Exception:  # noqa: BLE001
            return None
        # Lấy top 200 tần số có năng lượng cao nhất
        idx = np.argsort(magnitudes.ravel())[-200:]
        freqs = pitches.ravel()[idx]
        freqs = freqs[freqs > 50.0]  # loại bỏ tần số quá thấp
        if freqs.size < 20:
            return None
        # Quy về cùng một bát độ quanh A4 (440Hz): f * 2^k sao cho nằm trong [220, 880)
        while (freqs < 220.0).any():
            freqs[freqs < 220.0] *= 2.0
        while (freqs >= 880.0).any():
            freqs[freqs >= 880.0] /= 2.0
        # Với mỗi tần số, tính số cung lệch so với 440Hz: 12*log2(f/440)
        cents_deviation = 1200.0 * np.log2(freqs / 440.0)
        # Lấy phần dư trong [-50, 50) cent
        residual = ((cents_deviation + 50.0) % 100.0) - 50.0
        median_cents = float(np.median(residual))
        # Độ lệch > 40 cent coi như không đáng tin (bản ghi quá lệch tần số)
        if abs(median_cents) > 40:
            return None
        return 440.0 * (2.0 ** (median_cents / 1200.0))

    # -- 4.6 Phân tích đầy đủ một file -------------------------------------
    def analyze(
        self,
        file_path: str,
        with_segments: bool = False,
        top_n: int = 3,
    ) -> AnalysisResult:
        """Phân tích đầy đủ một file âm thanh, trả về AnalysisResult."""
        warnings_list: List[str] = []

        y, sr = self.load_audio(file_path)
        duration = librosa.get_duration(y=y, sr=sr)

        if duration < 3.0:
            warnings_list.append(
                f"File quá ngắn ({duration:.1f}s) — kết quả có thể không chính xác."
            )

        chroma = self.compute_chroma(y)
        candidates = self.detect_global(chroma)
        best = candidates[0]
        second = candidates[1] if len(candidates) > 1 else best

        confidence = normalize_confidence(best.score, second.score)
        reliable = confidence >= self.min_confidence and best.score > 0.2

        if not reliable:
            warnings_list.append(
                "Độ tin cậy thấp — bài có thể có nhiều nốt ngoài thang, "
                "nhiều nhiễu, hoặc chuyển key liên tục. Hãy kiểm tra lại bằng tai."
            )

        # Kiểm tra trường hợp nhầm lẫn trưởng ↔ thứ tương quan
        rel_minor_root = NOTE_NAMES_SHARP[
            (NOTE_NAMES_SHARP.index(best.root) - 3) % 12
        ]
        if best.scale == "major" and second.root == rel_minor_root and second.scale == "minor":
            warnings_list.append(
                f"Cảnh báo nhầm lẫn tương quan: {best.label_vi} vs "
                f"{rel_minor_root} Thứ — hai thang này dùng cùng tập hợp nốt."
            )

        segments: List[Dict[str, Any]] = []
        if with_segments:
            segs = self.detect_segments(chroma)
            segments = [asdict(s) for s in segs]
            if len(segs) > 1:
                warnings_list.append(
                    f"Phát hiện {len(segs)} đoạn key khác nhau trong bài."
                )

        a4 = self.estimate_reference_pitch(y)

        return AnalysisResult(
            file_path=file_path,
            duration_sec=float(duration),
            sample_rate=int(sr),
            key=best.root,
            scale=best.scale,
            key_label=best.label,
            key_label_vi=best.label_vi,
            confidence=confidence,
            raw_score=best.score,
            is_reliable=reliable,
            top_candidates=[asdict(c) for c in candidates[:top_n]],
            segments=segments,
            reference_a4_hz=a4,
            warnings=warnings_list,
        )


# ---------------------------------------------------------------------------
# 5. Hàm tiện ích cấp module (dùng nhanh, không cần khởi tạo lớp)
# ---------------------------------------------------------------------------
def analyze_file(
    file_path: str,
    with_segments: bool = False,
    top_n: int = 3,
    **kwargs: Any,
) -> AnalysisResult:
    """
    Hàm tiện ích: phân tích một file và trả về kết quả.
    Các tham số tùy chọn (sr, hop_length, window_sec...) truyền qua kwargs.
    """
    detector = KeyDetector(**{k: v for k, v in kwargs.items() if v is not None})
    return detector.analyze(file_path, with_segments=with_segments, top_n=top_n)


def compare_files(paths: List[str]) -> List[AnalysisResult]:
    """Phân tích hàng loạt file, trả về danh sách kết quả theo thứ tự."""
    detector = KeyDetector()
    return [detector.analyze(p) for p in paths]


# ---------------------------------------------------------------------------
# 6. Chạy trực tiếp từ dòng lệnh
# ---------------------------------------------------------------------------
def _parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="AUTO_MENU_AI — Bộ dò key âm thanh (Krumhansl-Schmuckler + Chroma CQT)"
    )
    parser.add_argument("files", nargs="+", help="Đường dẫn file âm thanh (.mp3/.wav/.flac)")
    parser.add_argument(
        "--segments", action="store_true", help="Phát hiện các đoạn đổi key trong bài"
    )
    parser.add_argument(
        "--top", type=int, default=3, help="Số ứng viên key hiển thị (mặc định 3)"
    )
    parser.add_argument(
        "--window", type=float, default=DEFAULT_WINDOW_SEC,
        help=f"Độ dài cửa sổ ổn định tính bằng giây (mặc định {DEFAULT_WINDOW_SEC})"
    )
    parser.add_argument(
        "--json", action="store_true", help="Xuất kết quả dạng JSON thay vì văn bản"
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = _parse_args(argv)
    import json

    detector = KeyDetector(window_sec=args.window)
    exit_code = 0

    for path in args.files:
        try:
            result = detector.analyze(
                path, with_segments=args.segments, top_n=args.top
            )
        except (FileNotFoundError, RuntimeError, ValueError) as exc:
            print(f"[LỖI] {path}: {exc}", file=sys.stderr)
            exit_code = 1
            continue

        if args.json:
            print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        else:
            print("=" * 60)
            print(result.pretty())
            print()

    return exit_code


if __name__ == "__main__":
    # Tắt cảnh báo UserWarning của librosa để output sạch hơn
    warnings.filterwarnings("ignore", category=UserWarning)
    sys.exit(main())
