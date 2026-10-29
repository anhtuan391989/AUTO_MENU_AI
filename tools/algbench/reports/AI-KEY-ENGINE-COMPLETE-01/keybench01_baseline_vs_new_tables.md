### Tổng hợp tập chính (set=main, tín hiệu tổng hợp; mỗi ca 24 s; ground truth = Tone dùng để tổng hợp)

| Chỉ số | Baseline (main trước sửa) | Bản mới |
|---|---|---|
| Số ca | 104 | 104 |
| Accuracy (đúng Tone chính xác, khoá cuối) | 0.0% | 100.0% |
| Accuracy Major (52 ca) | 0.0% | 100.0% |
| Accuracy Minor (52 ca) | 0.0% | 100.0% |
| Không trả kết quả | 100.0% | 0.0% |
| Sai nhưng ĐÃ khoá (tự tin) | 0.0% | 0.0% |
| Số ca sai-có-khoá | 0 | 0 |
| Thời gian khoá đầu tiên — trung vị (s) | null | 8.8 |
| Thời gian khoá đầu tiên — p90 (s) | null | 9.2 |
| Thời gian tới khoá ĐÚNG đầu tiên — trung vị (s) | null | 8.8 |

### Theo điều kiện (set=main)

| Điều kiện | n | Baseline đúng | Mới đúng |
|---|---|---|---|
| hợp âm đầu = tonic, piano, -35 dBFS | 24 | 0/24 | 24/24 |
| hợp âm đầu KHÔNG phải tonic | 24 | 0/24 | 24/24 |
| âm sắc organ/guitar/pad/brass | 32 | 0/32 | 32/32 |
| lệch tuning ±20/±35 cent | 24 | 0/24 | 24/24 |

### Tiến trình pop (relative MƠ HỒ: Am-F-C-G ≡ C: vi-IV-I-V) — 24 ca

| | Đúng chính xác | Relative (cùng bộ nốt) | Không kết quả | Lỗi khác |
|---|---|---|---|---|
| Baseline | 0 | 0 | 24 | 0 |
| Bản mới | 24 | 0 | 0 | 0 |

### Từng ca đặc biệt (không thuộc tập main)

| Ca | Mong đợi | Baseline | Bản mới |
|---|---|---|---|
| g1.silence — im lặng hoàn toàn | NO_KEY | PASS (không khoá) | PASS (không khoá) |
| g1.white-40 — nhiễu trắng -40 dBFS | NO_KEY | PASS (không khoá) | PASS (không khoá) |
| g1.white-25 — nhiễu trắng -25 dBFS | NO_KEY | PASS (không khoá) | PASS (không khoá) |
| g1.brown-30 — nhiễu nâu -30 dBFS | NO_KEY | PASS (không khoá) | PASS (không khoá) |
| g1.hum60-35 — ù 60 Hz + hài (1..8) -35 dBFS (không phải nhạc) | NO_KEY | PASS (không khoá) | FAIL (A# Major) |
| g1.level.-20 — C Major (I-IV-V-I) ở -20 dBFS | EXACT C Major | PASS (C Major) | PASS (C Major) |
| g1.level.-45 — C Major (I-IV-V-I) ở -45 dBFS | EXACT C Major | FAIL (không khoá) | PASS (C Major) |
| g1.level.-55 — C Major (I-IV-V-I) ở -55 dBFS | EXACT C Major | FAIL (không khoá) | PASS (C Major) |
| g1.volchange — đổi âm lượng -20→-50→-30 dBFS, Tone không đổi (A Minor) | KEEP_KEY A Minor | PASS (A Minor) | PASS (A Minor) |
| g2.bass.C Major — C Major, bass RẤT mạnh (x4), bass chơi quãng 5 | EXACT C Major | FAIL (không khoá) | PASS (C Major) |
| g2.no3.C Major — C Major: chỉ hợp âm rỗng (root+5, thiếu quãng 3) — Major/Minor KHÔNG xác định được | NO_WRONG_MODE | PASS (không khoá, no-lock) | PASS (không khoá, no-lock) |
| g2.short.C Major — C Major: đoạn ngắn 6 s | EXACT C Major | FAIL (không khoá) | FAIL (không khoá) |
| g2.rests.C Major — C Major: có đoạn nghỉ im lặng 3 s giữa bài | EXACT C Major | FAIL (không khoá) | PASS (C Major) |
| g2.bass.A Minor — A Minor, bass RẤT mạnh (x4), bass chơi quãng 5 | EXACT A Minor | FAIL (không khoá) | PASS (A Minor) |
| g2.no3.A Minor — A Minor: chỉ hợp âm rỗng (root+5, thiếu quãng 3) — Major/Minor KHÔNG xác định được | NO_WRONG_MODE | PASS (không khoá, no-lock) | PASS (không khoá, no-lock) |
| g2.short.A Minor — A Minor: đoạn ngắn 6 s | EXACT A Minor | FAIL (không khoá) | FAIL (không khoá) |
| g2.rests.A Minor — A Minor: có đoạn nghỉ im lặng 3 s giữa bài | EXACT A Minor | FAIL (không khoá) | PASS (A Minor) |
| g2.bass.G Major — G Major, bass RẤT mạnh (x4), bass chơi quãng 5 | EXACT G Major | FAIL (không khoá) | PASS (G Major) |
| g2.no3.G Major — G Major: chỉ hợp âm rỗng (root+5, thiếu quãng 3) — Major/Minor KHÔNG xác định được | NO_WRONG_MODE | PASS (không khoá, no-lock) | PASS (không khoá, no-lock) |
| g2.short.G Major — G Major: đoạn ngắn 6 s | EXACT G Major | FAIL (không khoá) | FAIL (không khoá) |
| g2.rests.G Major — G Major: có đoạn nghỉ im lặng 3 s giữa bài | EXACT G Major | FAIL (không khoá) | PASS (G Major) |
| g2.bass.D Minor — D Minor, bass RẤT mạnh (x4), bass chơi quãng 5 | EXACT D Minor | FAIL (không khoá) | PASS (D Minor) |
| g2.no3.D Minor — D Minor: chỉ hợp âm rỗng (root+5, thiếu quãng 3) — Major/Minor KHÔNG xác định được | NO_WRONG_MODE | PASS (không khoá, no-lock) | PASS (không khoá, no-lock) |
| g2.short.D Minor — D Minor: đoạn ngắn 6 s | EXACT D Minor | FAIL (không khoá) | FAIL (không khoá) |
| g2.rests.D Minor — D Minor: có đoạn nghỉ im lặng 3 s giữa bài | EXACT D Minor | FAIL (không khoá) | PASS (D Minor) |
| g2.firstchord.vi — C Major nhưng 6 s đầu chỉ ngân hợp âm Am (vi) rồi mới vào I-IV-V-I | EXACT C Major | FAIL (không khoá) | PASS (C Major, 2 lần khoá) |
| g2.firstchord.IV — G Major nhưng 6 s đầu chỉ ngân hợp âm C (IV) rồi mới vào I-IV-V-I | EXACT G Major | FAIL (không khoá) | PASS (G Major, 4 lần khoá) |
| g2.chordonly.C Major — C Major: xen hợp âm vay mượn THƯA (1/3 số hợp âm), KHÔNG chuyển Tone | KEEP_KEY C Major | FAIL (không khoá) | FAIL (C Major, 2 lần khoá) |
| g2.chordstress.C Major — C Major: 8 s liên tục hợp âm NGOÀI thang rồi quay về (INFO) | INFO_KEEP_KEY C Major | INFO (không khoá) | INFO (C Major, 3 lần khoá) |
| g2.chordonly.E Major — E Major: xen hợp âm vay mượn THƯA (1/3 số hợp âm), KHÔNG chuyển Tone | KEEP_KEY E Major | FAIL (không khoá) | FAIL (E Major, 2 lần khoá) |
| g2.chordstress.E Major — E Major: 8 s liên tục hợp âm NGOÀI thang rồi quay về (INFO) | INFO_KEEP_KEY E Major | INFO (không khoá) | INFO (E Major, 3 lần khoá) |
| g2.chordonly.A Minor — A Minor: xen hợp âm vay mượn THƯA (1/3 số hợp âm), KHÔNG chuyển Tone | KEEP_KEY A Minor | FAIL (không khoá) | PASS (A Minor) |
| g2.chordstress.A Minor — A Minor: 8 s liên tục hợp âm NGOÀI thang rồi quay về (INFO) | INFO_KEEP_KEY A Minor | INFO (không khoá) | INFO (A Minor) |
| g2.mod.D Major+1 — chuyển Tone thật D Major → D# Major tại 30 s | MODULATION D# Major | FAIL (không khoá) | PASS (D# Major, 2 lần khoá, trễ 7.6 s) |
| g2.mod.G Major+2 — chuyển Tone thật G Major → A Major tại 30 s | MODULATION A Major | FAIL (không khoá) | PASS (A Major, 3 lần khoá, trễ 24.8 s) |
| g2.mod.A Minor+1 — chuyển Tone thật A Minor → A# Minor tại 30 s | MODULATION A# Minor | FAIL (không khoá) | PASS (A# Minor, 3 lần khoá, trễ 7.2 s) |
| g2.mod.E Minor+2 — chuyển Tone thật E Minor → F# Minor tại 30 s | MODULATION F# Minor | FAIL (không khoá) | PASS (F# Minor, 2 lần khoá, trễ 9.2 s) |
| g2.mod.C Major+1 — chuyển Tone thật C Major → C# Major tại 30 s | MODULATION C# Major | FAIL (không khoá) | PASS (C# Major, 2 lần khoá, trễ 7.6 s) |
| g2.mod.B Minor+2 — chuyển Tone thật B Minor → C# Minor tại 30 s | MODULATION C# Minor | FAIL (không khoá) | PASS (C# Minor, 2 lần khoá, trễ 9.2 s) |

### Confusion matrix 24 Tone (tập main)

#### Baseline
(hàng = Tone thật, cột = kết quả khoá cuối; chỉ in các ô ≠ 0 ngoài đường chéo)

Đường chéo (đúng): 0/104

- C Major → none: 6
- C Minor → none: 6
- C# Major → none: 2
- C# Minor → none: 2
- D Major → none: 6
- D Minor → none: 6
- D# Major → none: 4
- D# Minor → none: 4
- E Major → none: 4
- E Minor → none: 4
- F Major → none: 4
- F Minor → none: 4
- F# Major → none: 6
- F# Minor → none: 6
- G Major → none: 2
- G Minor → none: 2
- G# Major → none: 6
- G# Minor → none: 6
- A Major → none: 4
- A Minor → none: 4
- A# Major → none: 4
- A# Minor → none: 4
- B Major → none: 4
- B Minor → none: 4


#### Bản mới
(hàng = Tone thật, cột = kết quả khoá cuối; chỉ in các ô ≠ 0 ngoài đường chéo)

Đường chéo (đúng): 104/104

- (không có ô sai)


#### Đúng/tổng theo từng Tone (tập main, bản mới | baseline)

| Tone | Mới | Baseline |
|---|---|---|
| C Major | 6/6 | 0/6 |
| C Minor | 6/6 | 0/6 |
| C# Major | 2/2 | 0/2 |
| C# Minor | 2/2 | 0/2 |
| D Major | 6/6 | 0/6 |
| D Minor | 6/6 | 0/6 |
| D# Major | 4/4 | 0/4 |
| D# Minor | 4/4 | 0/4 |
| E Major | 4/4 | 0/4 |
| E Minor | 4/4 | 0/4 |
| F Major | 4/4 | 0/4 |
| F Minor | 4/4 | 0/4 |
| F# Major | 6/6 | 0/6 |
| F# Minor | 6/6 | 0/6 |
| G Major | 2/2 | 0/2 |
| G Minor | 2/2 | 0/2 |
| G# Major | 6/6 | 0/6 |
| G# Minor | 6/6 | 0/6 |
| A Major | 4/4 | 0/4 |
| A Minor | 4/4 | 0/4 |
| A# Major | 4/4 | 0/4 |
| A# Minor | 4/4 | 0/4 |
| B Major | 4/4 | 0/4 |
| B Minor | 4/4 | 0/4 |
