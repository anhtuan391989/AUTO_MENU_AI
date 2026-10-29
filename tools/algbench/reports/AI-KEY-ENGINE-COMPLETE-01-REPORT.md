# AI-KEY-ENGINE-COMPLETE-01 — Báo cáo (Claude A)

**Dự án:** `anhtuan391989/AUTO_MENU_AI` · **Nhánh:** `main`
**GitHub HEAD đầu vào (lúc bắt đầu task):** `b6159b2ef2b0492598e5e76d945ab64ade777e6c`
**GitHub HEAD mới nhất đã kiểm tra (29/10/2026 04:58 và kiểm lại cuối task):** `3c05eccf3018b32f66bc4cfa6d900fc85b625d3b` — so với HEAD đầu vào chỉ đổi `ui/js/renderer.js` ở phần preset REMIX/TUNE OFF (không liên quan Key/BPM/Mod); `ui/js/engines/*` và `ui/js/audioSource.js` KHÔNG đổi. Mọi sửa đổi dưới đây dựa trên `3c05ecc`.
**Commit cục bộ (chỉ để tham chiếu, KHÔNG push):** `d461bbd0ef8b55b456435bb962b7b2718d070d29`
**Loại task:** CODE · TEST · BENCHMARK · REPORT

> **Cảnh báo trung thực.** Mọi số liệu dưới đây là **kiểm thử tự động trên tín hiệu TỔNG HỢP** (mã engine thật chạy trong Node, FFT như Web Audio, đồng hồ ảo). **Chưa có** kết quả trên Windows/Electron với thiết bị âm thanh thật, và **chưa có** kết quả trên 20 bài hát thật (không có file audio). Không được hiểu "104/104" là độ chính xác trên nhạc thật.

---

## 1. Tóm tắt (cho người không lập trình)

- **Vì sao AI cứ `LISTENING` dù VU MUSIC có tín hiệu:** Key Engine có một "cổng" chỉ cho phép phân tích khi mức âm thanh vượt một hằng số cố định `0.0005`. Hằng số đó tương đương nhạc khoảng **−31 dBFS** (khá to). Nhạc loopback nhỏ hơn thế (rất phổ biến) bị cổng chặn hoàn toàn → Key Engine không bao giờ tích luỹ dữ liệu → không có Tone. Log thật của bạn (`maxContentRms ≈ 0.000496`) nằm **ngay sát** ngưỡng, khớp với cơ chế này.
- **Đã sửa:** thay cổng tuyệt đối bằng cổng "bằng chứng âm nhạc" không phụ thuộc âm lượng (đếm các đỉnh hòa âm nổi bật). Im lặng và nhiễu trắng/nâu vẫn không tạo Tone giả. Có công tắc để quay về như cũ.
- **Phát hiện thêm khi kiểm thử:** ngay cả khi nhạc đủ to, ở **71/128** ca tổng hợp, Tone khoá **đầu tiên** (tại 2 giây) chính là Tone của **hợp âm mở đầu** (ví dụ bài C Major bị báo F Major rồi mới tự sửa). Đã chỉnh để không đoán theo 1 hợp âm giữ ngắn: nay 0/128 khoá đầu sai — **đánh đổi:** Tone đầu tiên xuất hiện sau ~7–9 giây thay vì 2 giây. **Đây là quyết định cần Khói xác nhận** (xem mục 8).

---

## 2. Nguyên nhân gốc (có bằng chứng)

| | |
|---|---|
| Vị trí | `ui/js/engines/keyEngine.js`, hàm `updateChromaVector()` — dòng `const frameHasContent = ... > 0.0005;` (nay dòng 290) và dòng bỏ phiếu bass `winnerVal > 0.01` (nay dòng 370) |
| Cơ chế | `contentRms` = căn trung bình bình phương biên độ (`|X|/N`, đơn vị của `getFloatFrequencyData`) trên ~1000 bin 50–6000 Hz. Cổng yêu cầu `> 0.0005`. Với cửa sổ Blackman/FFT 8192 điều này ≈ nhạc **−31 dBFS RMS**. `hasMusicalContent` cần ≥50% khung đạt → luôn `false` khi nhạc nhỏ hơn → `chromaVector` không cập nhật → `keyChroma` = 12 số 0, `keyResults = 0` (khớp log của bạn). |
| Nguyên nhân phụ | Ngưỡng bass tuyệt đối `0.01` cũng làm bass **không bao giờ bỏ phiếu** khi nhạc nhỏ. |
| Đo bằng mô phỏng (mã gốc, vòng I-IV-V-I piano) | −15 dBFS: 1197/1200 khung đạt, khoá C Major @2,0 s · −25: 1066/1200 · −30: 152/1200 (không khoá) · **−35: 0/1200, `maxContentRms`=3,5e-4** · −40: 1,97e-4 · −50: 6,2e-5 · −60: 2,0e-5 (đều 0 khung, không Tone). |
| Về VU và Key Engine | VU MUSIC lấy dBFS từ BPMEngine (`getFloatTimeDomainData`), còn Key Engine đọc **phổ** từ một AnalyserNode riêng, cùng `source` SYSTEM_AUDIO (`renderer.js` `bindAiEnginesToSystemAudio`). Hai phép đo khác đơn vị/ngưỡng → VU nhảy **không** đồng nghĩa Key Engine thấy đủ tín hiệu. |
| Giới hạn chứng minh | Cơ chế khớp log thật và tái hiện được bằng mô phỏng, nhưng **chưa được chứng minh trực tiếp trên máy Windows của bạn**. Cách kiểm tra trên máy thật ở mục 9. |

Đã kiểm tra: im lặng và nhiễu **không** làm tăng `hasMusicalContent` (bản mới), đường dẫn tín hiệu MIC → AI **không** tồn tại (`audioSource.js`: chỉ `createSystemAudioSource` có `exposeRawNodeForAdapter`).

---

## 3. Thay đổi đã thực hiện

| # | File | Thay đổi | Vì sao |
|---|---|---|---|
| 1 | `ui/js/engines/keyEngine.js` (dòng 33–52, 290–335, 370, 113–116 & 587, 960–981) | (a) **Cổng thích ứng**: khung được nhận khi `rms > 1e-6` **và** có ≥4 đỉnh hòa âm nổi bật (đỉnh cục bộ cao hơn trung bình dB các bin lân cận ±7..11 ít nhất 15 dB). (b) Ngưỡng bass tuyệt đối `0.01` → `1e-5` (khi cổng thích ứng bật). (c) Hằng `LONG_STATIONARY_MIN_S = 4`: lối tắt "1 hợp âm giữ lâu" chỉ được khoá Tone khi đã có ≥4 s nhạc (trước: khoá ngay ở 2 s). (d) `getInputState()` + trường probe mới (`framesAccepted`, `tonalPeaks`, `maxTonalPeaks`, `lastLevelDb`) và `inputState` trong `getDebugSnapshot()`. Cổng cũ `0.0005` **giữ nguyên** làm số đo chẩn đoán (`framesWithContent`). | Sửa nguyên nhân gốc; chống Tone theo hợp âm đầu; chẩn đoán 5 trạng thái. |
| 2 | `ui/js/renderer.js` (1 dòng, ~1529) | Thêm `out.keyInputState` vào `__aiDiagStatus()` (chỉ đọc). | Xem trạng thái đường vào trong DevTools. Không đổi hành vi. |
| 3 | `tests/helpers/keyEngineSignalSim.js` (MỚI) | Bộ mô phỏng tín hiệu thời gian → FFT như Web Audio → KeyEngine thật. | Test với ground truth, đúng đơn vị. |
| 4 | `tests/helpers/keyEngineSim.js` | `cancelAnimationFrame` nay thực sự huỷ khung (trước là no-op → sau `stop()+init()` có 2 vòng khung chạy song song, chỉ là lỗi của mô phỏng). | Mô phỏng đúng như trình duyệt. |
| 5 | `tests/unit/AiKeyEngineComplete01.verify.js` (MỚI) | 43 kiểm tra (mục 5). | Nghiệm thu task. |
| 6 | `tools/algbench/keybench01.js` (MỚI) | Benchmark baseline-vs-mới (167 ca) + báo cáo bảng. | Số liệu trước/sau. |
| 7 | `tests/unit/AiKeyFast02`, `AiKeyFast06`, `AiNowPlayingOpt02`, `KeyEngineFastPath`, `ModalEvidenceFloorA40` `.verify.js` | Kỳ vọng "Key đầu @2000 ms / <2,5 s / <4 s" đổi thành đọc từ hằng `LONG_STATIONARY_MIN_S` (đặt `=0` thì trả lại đúng 2000 ms; **đã kiểm chứng**: các test này PASS ở bản gốc). Phần kiểm tra vòng đời watcher/guard giữ nguyên. | Đây là **hệ quả cố ý** của thay đổi 1(c), không phải lỗi. |
| 8 | `tests/unit/MarginEngine.verify.js` | Assertion `top1.score === confidence` → `confidence === (hasMusicalContent ? top1.score : 0)`. | Test cũ giả định phổ nhiễu trắng luôn qua cổng; cổng mới **từ chối đúng** nhiễu. |
| 9 | `tools/algbench/reports/AI-KEY-ENGINE-COMPLETE-01/*` (MỚI) | Số liệu benchmark, A/B tham số. | Bằng chứng. |

**Không sửa:** `bpmEngine.js`, `modEngine.js`, `audioSource.js`, giao diện/HTML, preset, MIDI, audio routing, Service Key. MIC vẫn không đi vào Key/BPM/Mod.

---

## 4. Phương pháp

- **Mô phỏng thật hơn bản cũ:** tổng hợp tín hiệu thời gian (piano/organ/guitar/pad/brass, hài 1–8, bass) → cửa sổ Blackman → FFT 8192 → dB(`|X|/N`) giống `AnalyserNode` → đưa vào `keyEngine.js` thật qua `vm` với đồng hồ ảo (đo thời gian khoá chính xác, không phụ thuộc máy).
- **Ground truth:** là Tone dùng để tổng hợp (vòng hợp âm I-IV-V-I / i-iv-V-i "rõ ràng"; vòng pop I-V-vi-IV / i-VI-III-VII báo riêng vì **relative mơ hồ về mặt nhạc lý**: Am-F-C-G ≡ C: vi-IV-I-V).
- **Một nhóm tham số mỗi lần:** cổng nội dung (đo riêng, mục 2) → sau đó mới thử `LONG_STATIONARY_MIN_S` ∈ {0, 4, 6, 99} (A/B riêng, `variants_stationary_min_s.txt`). Không đụng ngưỡng nào khác.
- **Chọn không quá khớp:** thử đặt sàn `margin` cho khoá đầu — dữ liệu **không** tách được (lock đúng nhỏ nhất margin 0,008; lock sai 0,005–0,007) nên **không** thêm.

---

## 5. Bảng test

### 5.1 Test mới `tests/unit/AiKeyEngineComplete01.verify.js` — **43 PASS, 0 FAIL** (+ 2 dòng `KNOWN-LIMITATION`)

| Nhóm | Nội dung | Kết quả |
|---|---|---|
| 1 | Nguyên nhân gốc: bản cũ 0 khung đạt cổng ở −35/−45/−55 dBFS, bản mới khoá C Major; −25 dBFS vẫn đúng ở cả hai | PASS |
| 2 | Im lặng, nhiễu trắng −60/−40/−25, nhiễu nâu −30: không Tone, chroma = 0 | PASS |
| 2 | Ù 60 Hz + hài (âm đơn đứng yên) | **KNOWN-LIMITATION** (mục 7) |
| 3 | 12 Tone trưởng + 12 Tone thứ @−35 dBFS | PASS 24/24 |
| 4 | Hợp âm mở đầu không phải tonic (6 Tone): khoá đầu & cuối đúng | PASS (bản `MIN_S=0` sai ở cả 6) |
| 5 | Hợp âm rỗng (thiếu quãng 3) không bị ép Major/Minor; bass x4; nghỉ im lặng 3 s; đoạn 6 s; đổi âm lượng −20→−50→−30 dBFS | PASS |
| 6 | Chuyển Tone D→D#, Am→A#m; hợp âm vay mượn thưa giữ Tone cuối | PASS (+1 KNOWN-LIMITATION: khoá tạm sai) |
| 7 | 5 trạng thái đường vào (`NO_SIGNAL`/`SIGNAL_NO_MUSIC`/`MUSIC_EVIDENCE`/`LOCKED`; `NO_DEVICE` do `audioSource`) | PASS |
| 8 | AUTO DETECT mức engine: watcher cũ không ghi đè, reset đúng, 3 lần liên tiếp mỗi lần 1 kết quả, không vòng song song | PASS |
| 9 | Công tắc hoàn nguyên, API Mod giữ nguyên, MIC không vào AI | PASS |

### 5.2 Hồi quy — toàn bộ `tests/unit/*.verify.js` (118 file), bản gốc `3c05ecc` so với bản sửa

| Kết quả | Chi tiết |
|---|---|
| Giống hệt bản gốc | Mọi test về **Key, Mod (ModEngineA03/V2, ModPipelineA03/A04, ToneStepA04), BPM (A73BpmConfidence), AUTO DETECT (A72, A75AutoDetect, A75VuIsolation, A73AiStateUi), SYSTEM_AUDIO/MIC (AudioSourceB58, AudioReconnectC62, AudioRoutingClosureC61, A71SystemAudioSetup), AiRuntimeContractA58/A59, AiKeyDetectionA60, AiKeyRuntimeClosureA61** đều PASS như bản gốc. |
| Lỗi có sẵn ở bản gốc (không do task này) | `AlwaysOnTopMenuUi01B, B38D1RuntimeIntegration, CommandRuntimeHealth, D1SpecValidation, FSP8MicVolumeDiag01, MenuFix01, MidiD1RuntimeB61, MidiDawControl01, MidiLearnDispatch, MidiRecovery01, MusicAnalysis, PortSelectionPolicy, TelemetryAnalyzer` — **FAIL ở cả bản gốc lẫn bản sửa** (13 file). |
| Artefact git-status | `AutoSongCollector`, `NowPlayingResolver`, `SetupAiPanelStructureA54` FAIL khi cây làm việc đang sửa dở (tự kiểm tra `git status`), **PASS khi cây sạch** (đã xác nhận trên commit cục bộ). |
| Test cũ phải đổi kỳ vọng | 6 file ở mục 3 (#7, #8). Sau khi đổi: PASS. |

---

## 6. Benchmark baseline vs bản mới (tín hiệu tổng hợp)

Đầy đủ: `tools/algbench/reports/AI-KEY-ENGINE-COMPLETE-01/keybench01_baseline_vs_new_tables.md`. 167 ca. **Baseline = `3c05ecc` trước khi sửa. Cùng bộ ca, cùng tín hiệu.**

### 6.1 Tập chính (104 ca, mỗi ca 24 s, −35 dBFS; Tone dùng để tổng hợp là ground truth)

| Chỉ số | Baseline | Bản mới |
|---|---|---|
| Accuracy (Tone chính xác, khoá cuối) | 0,0% (0/104) | **100% (104/104)** |
| Accuracy Major / Minor | 0/52 · 0/52 | 52/52 · 52/52 |
| Không trả kết quả | 100% | 0% |
| Sai nhưng đã khoá (tự tin sai) | 0% (vì không có kết quả) | 0% |
| Thời gian có Tone đầu tiên (trung vị / p90) | — | 8,8 s / 9,2 s |
| Confusion matrix 24 Tone | toàn cột "không kết quả" | đường chéo 104/104, 0 ô sai |

Theo điều kiện: hợp âm đầu = tonic 24/24; hợp âm đầu ≠ tonic 24/24; âm sắc organ/guitar/pad/brass 32/32; lệch tuning ±20/±35 cent 24/24 (baseline đều 0). Tiến trình pop (relative mơ hồ) 24/24 đúng chính xác. Mỗi Tone có 2–6 ca (không đều) — **mẫu nhỏ, không suy ra độ chính xác tổng quát**.

### 6.2 So sánh thuần thuật toán ở mức to (−15 dBFS, nơi baseline có chạy) — hiệu ứng của `LONG_STATIONARY_MIN_S`

| 48 ca (24 Tone × 2 kiểu mở đầu) | Khoá ĐẦU đúng | Khoá cuối đúng | Trung vị khoá đầu |
|---|---|---|---|
| Baseline, hợp âm đầu = tonic | 24/24 | 24/24 | 2,0 s |
| Bản mới, hợp âm đầu = tonic | 24/24 | 24/24 | 7,2 s |
| Baseline, hợp âm đầu ≠ tonic | **0/24** | 24/24 | 2,0 s |
| Bản mới, hợp âm đầu ≠ tonic | **24/24** | 24/24 | 9,2 s |

Trên 128 ca (main + pop, −35 dBFS): với `MIN_S=0` khoá đầu sai **71/128**; bản mới **0/128**, mỗi ca đúng 1 lần khoá (không dao động).

### 6.3 Các ca đặc biệt

| Ca | Baseline | Bản mới |
|---|---|---|
| Im lặng / nhiễu trắng −40, −25 / nhiễu nâu −30 | không Tone (PASS) | không Tone (PASS) |
| Ù 60 Hz −35 dBFS | không Tone | **khoá A# Major (không mong muốn)** — xem mục 7 |
| Nhạc −45 / −55 dBFS | không Tone | C Major đúng |
| Bass x4 (4 Tone), đoạn nghỉ 3 s (4), đoạn 6 s (4) | không Tone | đúng; đoạn 6 s: giữ LISTENING (không đoán) |
| Hợp âm rỗng (thiếu quãng 3) ×4 | không Tone | không khoá (không ép Major/Minor) |
| Đổi âm lượng −20→−50→−30 dBFS | giữ A Minor | giữ A Minor |
| Hợp âm vay mượn thưa (C, E Major) | không Tone | Tone cuối đúng nhưng **khoá tạm sai** (F Major @8,4 s margin 0,005 → C Major @13,2 s) — **FAIL (không đạt "không đổi")** |
| Hợp âm vay mượn thưa (A Minor) | không Tone | PASS |
| 8 s liên tục hợp âm ngoài thang (INFO, không tính điểm) | — | đổi tạm rồi quay lại |
| Chuyển Tone thật ×6 (+1/+2 bán cung, trưởng/thứ) | không Tone | **6/6 đúng tone mới cuối cùng**; độ trễ nhận Tone mới 7,2–9,2 s (5 ca), **24,8 s** (G→A); 2/6 ca có khoá tạm sai ở giữa (G→D→A, Am→D#m→A#m) |

---

## 7. Giới hạn và vấn đề còn lại (không giấu)

1. **Chưa xác minh trên nhạc thật / thiết bị thật** (mục 8).
2. **Ù 60 Hz (âm đơn có chuỗi hài đứng yên) bị coi là nhạc:** bản gốc cũng khoá giả ở ≥ −25 dBFS; bản mới mở rộng xuống mức nhỏ hơn. Về nguyên lý không phân biệt được với một nốt nhạc kéo dài. SYSTEM_AUDIO số thường không có ù điện lưới (MIC không vào AI). **Chưa khắc phục.**
3. **Khoá tạm sai khi có nhiều hợp âm vay mượn** (2/3 ca thưa) và **độ trễ chuyển Tone** 7–25 s: Key Engine dùng bằng chứng dài hạn (τ=20 s) nên đổi chậm; ModEngine là engine riêng phát sự kiện chuyển điệu — **chưa benchmark riêng** (chỉ chạy test hồi quy sẵn có, PASS).
3b. **Major/Minor khi chỉ có một hợp âm giữ rất lâu** (ví dụ 6 s hợp âm Am rồi mới vào C): kết quả đầu là A Minor (đúng với dữ liệu đã nghe) rồi sửa lại thành C Major ở ~17,6 s. Đây là mơ hồ nhạc lý, không phải lỗi mã.
4. **Đoạn nhạc < ~8 giây giữ `LISTENING`** thay vì đoán (đánh đổi có chủ ý).
5. **Tham số chưa hiệu chuẩn bằng nhạc thật:** `TONAL_PROMINENCE_DB=15`, `TONAL_MIN_PEAKS=4`, `CONTENT_ABS_FLOOR_RMS=1e-6`, `LONG_STATIONARY_MIN_S=4`. Dữ liệu tổng hợp không tách được 4/6/99 s.
6. Nhiễu **có cấu trúc** (giọng nói, quạt, tiếng gõ) chưa được thử; rủi ro cổng thích ứng nhận nhầm là nhạc **chưa đo**.
7. BPM: không sửa, không benchmark mới — chỉ hồi quy (PASS).

---

## 8. Phần chưa thể xác minh / cần Khói

| Mục | Trạng thái | Cần gì |
|---|---|---|
| Benchmark 20 bài thật (`20 bai hat .csv` ≡ `tools/algbench/source/songs_20_source.csv`, đã so: 2 file giống hệt) | **BLOCKED_NO_AUDIO** (20/20) — repo không chứa audio; chạy `tools/algbench/realbench/run.js` cần file audio + `ffmpeg` | Cung cấp file audio (có quyền sử dụng) hoặc chạy trên máy Khói |
| Nhãn Tone của 20 bài | Chỉ là **nhãn do người dùng cung cấp** (manifest ghi `UNVERIFIED_REFERENCE`); cột ghi "đã xác minh" nhưng chưa có kiểm chứng độc lập. 1 bài `Viên Đá nhỏ` ghi `---` → **BLOCKED_NO_GROUND_TRUTH**; 2 bài (`THƯƠNG EM`, `Yêu Lại Từ Đầu`) có chuyển Tone `D Major - Eb Major`; 1 bài thiếu link; ô `A# Minnor` gõ sai chính tả. | Xác nhận nhãn chuẩn |
| Windows/Electron + thiết bị âm thanh thật | **BLOCKED** (môi trường cloud không có) | Chạy thật, xem mục 9 |
| Chuyển Tone đo bằng ModEngine thật | Chưa benchmark | Cần nhạc có chuyển Tone thật |

Bảng **mô tả** (không phải accuracy, không do task này đo): cột "Kết quả Auto Key" người dùng đã ghi từ các lần chạy trước (bản cũ, nhạc thật), đối chiếu với nhãn của chính người dùng: 15/19 trùng, 2 nhầm relative (Đớn Đau Vô Cùng C vs Am; Anh không tha thứ E vs C#m), 2 khác (Anh Khác hay em khác D vs Am; giả vờ thương anh được Db vs Dm), 1 không có nhãn. Ghi nhận của bạn: bài *THƯƠNG EM* "chỉ hiện listening… 1p22s mới hiện Key" — **phù hợp** với cơ chế cổng ở mục 2 (bài nhỏ/ít hòa âm sát ngưỡng), nhưng chưa được chứng minh trên bài đó.

**Quyết định cần Khói:** `LONG_STATIONARY_MIN_S = 4` làm Tone đầu xuất hiện chậm hơn (≈7–9 s thay vì 2 s) để không đoán theo hợp âm mở đầu. Nếu Khói ưu tiên tốc độ hơn độ đúng ở đầu bài: đổi `4` → `0` trong `keyEngine.js` (dòng 116) — các test cũ về tốc độ 2 s sẽ PASS lại nguyên vẹn.

---

## 9. HƯỚNG DẪN CÀI ĐẶT / THAY THẾ / CHẠY

**ZIP:** `AI-KEY-ENGINE-COMPLETE-01.zip` (chỉ chứa file thay đổi, giữ nguyên đường dẫn; kèm `AI-KEY-ENGINE-COMPLETE-01.patch` và bản sao báo cáo này). Không cần cài thêm gì ngoài Node.js đang dùng cho dự án.

**Bước 1 — Sao lưu.** Trong `G:\AUTO_MENU_AI\` sao chép ra chỗ khác (ví dụ `G:\AUTO_MENU_AI_BACKUP_KEY01\`) các file sẽ bị ghi đè:
`ui\js\engines\keyEngine.js`, `ui\js\renderer.js`, `tests\helpers\keyEngineSim.js`, `tests\unit\AiKeyFast02.verify.js`, `AiKeyFast06.verify.js`, `AiNowPlayingOpt02.verify.js`, `KeyEngineFastPath.verify.js`, `MarginEngine.verify.js`, `ModalEvidenceFloorA40.verify.js`.

**Bước 2 — Giải nén.** Giải nén ZIP **thẳng vào** `G:\AUTO_MENU_AI\` (chọn "Thay thế các tệp"). Các file **thay thế**: 9 file ở Bước 1. Các file **thêm mới** (không ghi đè gì): `tests\helpers\keyEngineSignalSim.js`, `tests\unit\AiKeyEngineComplete01.verify.js`, `tools\algbench\keybench01.js`, `tools\algbench\reports\AI-KEY-ENGINE-COMPLETE-01\*`, `tools\algbench\reports\AI-KEY-ENGINE-COMPLETE-01-REPORT.md`.

**Bước 3 — Chạy test tự động.** Mở Command Prompt, gõ lần lượt:
```
cd /d G:\AUTO_MENU_AI
node tests\unit\AiKeyEngineComplete01.verify.js
```
(mất khoảng 3–5 phút). **Thành công:** dòng cuối `== KẾT QUẢ: 43 PASS, 0 FAIL ==`. Dòng `KNOWN-LIMITATION` là bình thường. Chạy thêm hồi quy: `node tests\unit\AiKeyFast02.verify.js`, `AiKeyFast06`, `A72AiLifecycle`, `A75AutoDetect`, `ModEngineV2` — mỗi cái phải kết thúc bằng PASS, 0 FAIL.
Benchmark (tuỳ chọn, ~5 phút): `node tools\algbench\keybench01.js run --engine ui\js\engines\keyEngine.js --out moi.json` rồi `node tools\algbench\keybench01.js report --base <file baseline.json> --new moi.json --md bang.md`.

**Bước 4 — Kiểm tra trên máy thật (phần tôi KHÔNG làm được).** Chạy app (`start.bat`), chọn thiết bị SYSTEM_AUDIO như bình thường, phát một bài nhạc **nhỏ** (khoảng 30–50% âm lượng). Bấm F12 → Console → gõ `JSON.stringify(window.__aiDiagStatus(), null, 2)`.
- **Thành công:** `keyInputState` = `MUSIC_EVIDENCE` rồi `LOCKED`; `keyInput.framesAccepted` tăng dần; `keyChroma` có số khác 0; Key xuất hiện sau khoảng 7–10 giây.
- Nếu `keyInputState` = `NO_SIGNAL`: kiểm tra thiết bị SYSTEM_AUDIO (`sourceInfo`). Nếu `SIGNAL_NO_MUSIC` mãi: gửi lại toàn bộ kết quả lệnh trên để phân tích.
- Tắt nhạc → `NO_SIGNAL`/`SIGNAL_NO_MUSIC`, không được hiện Tone mới.

**Bước 5 — Hoàn nguyên.** Cách nhanh (giữ code mới nhưng tắt hành vi mới): mở `ui\js\engines\keyEngine.js`, đổi `const ADAPTIVE_CONTENT_GATE_ENABLED = true;` (dòng 45) thành `false` và `const LONG_STATIONARY_MIN_S = 4;` (dòng 116) thành `0` → hành vi y hệt trước task này. Cách đầy đủ: chép lại các file đã sao lưu ở Bước 1 đè lên, xoá các file mới thêm.

---

## 10. Tiêu chí nghiệm thu

- [x] Xác định nguyên nhân gốc khiến Key Engine không tích luỹ bằng chứng (cơ chế + tái hiện bằng mô phỏng; **chưa chứng minh trên máy thật**).
- [x] Sửa và kiểm thử cổng tiếp nhận tín hiệu (PASS trên tổng hợp).
- [x] Im lặng/nhiễu không tạo Tone giả trong các test đã chạy (trắng, nâu, im lặng). **Ngoại lệ đã nêu: ù 60 Hz.**
- [~] Đủ 24 Tone trên tập có ground truth: **PASS 24/24 trên tổng hợp**; **chưa** trên nhạc thật.
- [x] Đánh giá riêng Major/Minor (52/52 · 52/52) và trường hợp chưa đủ bằng chứng (rỗng, đoạn ngắn → không ép).
- [~] Thay đổi hợp âm và chuyển Tone thật: chuyển Tone 6/6 đúng nhưng chậm (7–25 s) và có khoá tạm sai 2/6; hợp âm vay mượn 1/3 đạt.
- [x] AUTO DETECT khởi động lại đúng (mức engine + test hồi quy renderer A72/A75/AiKeyFast*).
- [x] BPM/Mod và đường MIC/SYSTEM_AUDIO không hồi quy trong phạm vi test.
- [x] Có số liệu trước/sau và danh sách PASS/FAIL/BLOCKED.
- [x] Nêu rõ phần chưa xác minh trên Windows/DAW thật (mục 8).

---

## 11. Kết quả cuối (theo mẫu bắt buộc)

**Claude A : Task A: AI-KEY-ENGINE-COMPLETE-01 — Hoàn thiện thuật toán dò Tone bài hát**

1. **File nào đã sửa.**
   Sửa: `ui/js/engines/keyEngine.js`, `ui/js/renderer.js` (1 dòng chẩn đoán), `tests/helpers/keyEngineSim.js`, `tests/unit/{AiKeyFast02,AiKeyFast06,AiNowPlayingOpt02,KeyEngineFastPath,MarginEngine,ModalEvidenceFloorA40}.verify.js`.
   Tạo mới: `tests/helpers/keyEngineSignalSim.js`, `tests/unit/AiKeyEngineComplete01.verify.js`, `tools/algbench/keybench01.js`, `tools/algbench/reports/AI-KEY-ENGINE-COMPLETE-01/*`, báo cáo này.
2. **Vì sao sửa.** Cổng nội dung tuyệt đối 0.0005 (≈ −31 dBFS) chặn nhạc nhỏ nên Key Engine không tích luỹ → `LISTENING` mãi; ngưỡng bass 0.01 cũng chặn nhạc nhỏ. Thêm bảo vệ không khoá Tone theo hợp âm mở đầu (khoá đầu sai 71/128 → 0/128). Thêm chẩn đoán 5 trạng thái.
3. **Có ảnh hưởng module nào không.** Key Engine (trực tiếp). ModEngine dùng `estimateKeyFromChroma/estimateKeyLong/outOfScaleRatio` — API không đổi, test Mod PASS; hành vi Mod có thể thay đổi nhẹ vì chroma nay được tích luỹ ở nhạc nhỏ. BPM/audioSource/giao diện/MIDI/preset: không sửa. Tone đầu tiên xuất hiện chậm hơn (~7–9 s so với 2 s) — cần Khói xác nhận.
4. **Còn việc gì chưa làm.** Benchmark 20 bài thật (BLOCKED_NO_AUDIO; nhãn chưa xác minh độc lập; 1 bài chưa có nhãn); kiểm tra trên Windows/Electron với thiết bị thật; ù 60 Hz bị coi là nhạc; khoá tạm sai khi nhiều hợp âm vay mượn; độ trễ chuyển Tone 7–25 s; chưa hiệu chuẩn tham số bằng nhạc thật; ModEngine chưa benchmark riêng; Khói quyết định giữ `LONG_STATIONARY_MIN_S = 4` hay trả về `0`.

*Commit hash cuối (cục bộ, không push, nền `3c05ecc`): `d461bbd0ef8b55b456435bb962b7b2718d070d29`.*
