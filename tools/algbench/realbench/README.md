# realbench — kiểm chứng Key/Mod trên nhạc thật (AI-ALG-08)

Không sửa runtime. Chỉ đọc `ui/js/engines/*` qua vm (đồng hồ ảo). Số liệu synthetic KHÔNG được trộn vào đây.

## Thêm một bài nhạc
1. Đặt file audio (do bạn có quyền sử dụng) vào một thư mục, ví dụ `G:\AUTO_MENU_AI_AUDIO\`.
2. Tính sha256 của file (PowerShell: `Get-FileHash file.wav -Algorithm SHA256`), ghi vào `audio_hash` (chữ thường).
3. Thêm một mục vào `tools/algbench/manifest/real_music_manifest.json` → `tracks[]`:
   `track_id, audio_reference{path,source_url,license_note}, audio_hash, reference_status, annotator, segments[], modulations[], annotation_notes, split`.
   - `reference_status`: `VERIFIED_INDEPENDENT` (đã kiểm chứng độc lập: bản nhạc/lead sheet/người chú thích thứ hai) hoặc `UNVERIFIED_REFERENCE` (chỉ nghe/ghi nhớ — KHÔNG vào số liệu chính).
   - `segments[]`: `{start_time,end_time,tonic,mode}` (giây; `end_time:null` = đến hết bài). Đoạn không chắc: `mode:"undetermined", tonic:null` → bị loại khỏi mẫu số, không ép nhãn.
   - `modulations[]`: `{time,from_key,to_key}`. Bài đối chứng không chuyển tông: `[]`.
   - `split`: `dev` hoặc `test` theo BÀI. Một `audio_hash` không được ở cả hai tập (validator báo lỗi).
4. Chạy: `node tools/algbench/realbench/run.js --audio-root <thư mục audio> [--split dev] [--out report.json]`.
   Tập test chỉ chạy với `--final-test` (không dùng để chỉnh tham số). `--tol` (mặc định 10 s) và `--tols` (độ nhạy) do người chạy chọn và được ghi vào báo cáo.
   Cần `ffmpeg` trong PATH. Có thể đưa dự đoán sẵn: `--predictions <dir>` với `<track_id>.json = {key_timeline:[{t,pc,mode}], mod_events:[{t,kind,semitone_delta}], duration_s}`.

## Định nghĩa metric (metrics.js)
- **Key**: lấy mẫu mỗi 1 s trong đoạn có key xác định. Mẫu số = số mốc đó. Engine chưa báo key (null) tính SAI và vào `unknown_rate`. Đoạn undetermined/không biết độ dài bị loại và đếm riêng.
  Exact = đúng tonic+mode; tonic = đúng tonic; mode = đúng mode. Lỗi: `relative` (khác mode, cùng thang), `parallel` (cùng tonic khác mode), `other`, `none`. Ma trận nhầm 24 lớp + cột "không báo". Accuracy theo cửa sổ W (5,10,20,40,60 s): key engine báo tại `start+W` của mỗi đoạn dài ≥ W. Tổng hợp: micro (cộng mốc) và macro (TB theo bài).
- **Mod**: chỉ tính sự kiện `kind="MODULATION"`. Ghép 1-1 tham lam theo |Δt| nhỏ nhất, p khớp g nếu `g.t - 2 s ≤ p.t ≤ g.t + tol`. Latency = p.t − g.t. TP/FP/FN → precision/recall/F1; *strict* = cần thêm đúng độ lệch bán cung (so mod 12). FP vùng không modulation: sự kiện chưa ghép nằm ngoài mọi cửa sổ; quy ra FP/phút. Phân loại theo độ lệch có dấu (+1, +2, …). Phân tích độ nhạy theo nhiều tol.
- `reference_status=UNVERIFIED_REFERENCE` hoặc audio thiếu/hash lệch ⇒ không được chấm vào số liệu chính.

Test: `node tests/unit/RealBenchA08.verify.js` (dữ liệu TEST_FIXTURE, không phải nhạc thật).
