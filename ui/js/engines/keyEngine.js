/* ==========================================================
   KEY ENGINE — tự quản lý toàn bộ việc dò Key (NNLS-style harmonic-template
   chroma + Bayesian-flavored cosine scoring, baseline V6_TOAN_PRO)
   -----------------------------------------------------------
   TASK A25 — thay THUẬT TOÁN trích/chấm điểm chroma (đã CHỨNG MINH BẰNG SỐ
   là nguyên nhân trực tiếp khiến Key=null/Mod=null: cách cũ "peak-picking +
   spectral whitening" + Musical Content Gate chặn đứng cả hợp âm sạch).
   TASK A34 — MARGIN_NORM_RANGE=0.10, Fast Path dùng confidenceV2.combined
   TASK A35 — Bass có điều kiện, Modal Evidence, Stability Lock, Modulation Detector
   ========================================================== */
const KeyEngine = (() => {
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    const KS_MAJOR_PROFILE = [1.000, 0.065, 0.630, 0.088, 0.710, 0.568, 0.095, 0.851, 0.075, 0.688, 0.098, 0.425];
    const KS_MINOR_PROFILE = [1.000, 0.072, 0.573, 0.782, 0.082, 0.571, 0.082, 0.851, 0.608, 0.082, 0.629, 0.082];

    // === TASK AI-KEY-SCORING-A-01 — CHẤM ĐIỂM 24 KEY BẰNG TƯƠNG QUAN PEARSON (thay "(cosine+1)/2") ===
    // Vấn đề đã đo (xem báo cáo AI-KEY-SCORING-A-01): thang cũ "(cosine+1)/2 + bass(0.5) + modal(0.08)" có 3 lỗi:
    //  (1) cosine KHÔNG trừ trung bình: mọi vector chroma dương đều "giống" mọi hồ sơ Key => 24 điểm dồn trong ~0.1 => biên top1-top2 rất nhỏ, dễ bị bass/modal lấn át;
    //  (2) bass 0.5 + modal 0.08 CỘNG THẲNG vào điểm => điểm tối đa ~1.58 => confidence > 1 (vi phạm hợp đồng AIContext: confidence ∈ [0,1], ngoài khoảng bị TỪ CHỐI);
    //  (3) bass chiếm 20% điểm quyết định LOCK (bassNorm trong confidenceV2) => nhạc bass nặng khoá theo gốc bass thay vì theo hòa âm.
    // Thuật toán mới (công khai, KHÔNG phải công thức nội bộ của PDL): điểm ứng viên = trung bình CỘNG của 2 tương quan Pearson có trừ trung bình
    //   r = 0.5·pearson(chroma, Krumhansl–Kessler[root,mode]) + 0.5·pearson(chroma, Temperley[root,mode])   (r ∈ [-1,1]; 24 ứng viên cùng 1 công thức)
    // cộng 2 bằng chứng PHỤ nhỏ có trần cứng (bass ≤ BASS_ROOT_BOOST_WEIGHT ≤ 0.05; modal ≤ MODAL_BOOST). Hồ sơ KK/Temperley là BẢN SAO đúng giá trị của
    // ui/js/engines/musicAnalysis.js (file đó không được nạp trong index.html nên không thể phụ thuộc; test KeyScoringPearson01 bảo đảm hai bản không lệch nhau).
    // Tắt/hoàn nguyên: KEY_SCORING_PEARSON_ENABLED = false => thang điểm, bass, modal, confidence và MỌI ngưỡng trở về đúng như trước task này.
    const KEY_SCORING_PEARSON_ENABLED = true;
    // D: engine không báo lại cùng 1 Key đã báo (xem runVoteLoop). false => như cũ (mỗi vòng detectOnce của renderer báo lại Key đang khoá => ai-result trùng).
    const DEDUP_KEY_REPORT_ENABLED = true;
    const PEARSON_ON = KEY_SCORING_PEARSON_ENABLED;
    const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    const TEMPERLEY_MAJ = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
    const TEMPERLEY_MIN = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];
    const PEARSON_W_KK = 0.5, PEARSON_W_TEMPERLEY = 0.5; // 2 hồ sơ, mỗi hồ sơ 1 phiếu bằng nhau (kiểm thử được: r = 0.5·rKK + 0.5·rT)
    // Dữ liệu chroma không đủ thông tin => KHÔNG tạo Key (key=null, confidence=0, valid=false):
    const MIN_ACTIVE_PITCH_CLASSES = 3;   // cần ≥ 3 cao độ có năng lượng đáng kể (1 nốt đơn/1 cao độ không đủ để nói Key)
    const ACTIVE_PC_REL = 0.10;           // "đáng kể" = ≥ 10% cao độ mạnh nhất (sau chuẩn hoá power-law, L2)
    const MODAL_BOOST = PEARSON_ON ? 0.02 : 0.08; // AI-KEY-SCORING-A-01: bằng chứng quãng 3 (phụ). Pearson+KK/Temperley ĐÃ mã hoá quãng 3 nên cộng thêm 0.08 là đếm đôi (xem báo cáo)
    // Nén bổ sung TRƯỚC Pearson (chỉ trong khâu chấm điểm; bộ tích luỹ chroma KHÔNG đổi). Đo trên 126 ca (phụ lục báo cáo): hệ số 0.4–0.5 là vùng phẳng cho nhóm bass mạnh
    // (đúng 16/16 tại 12 s và 20 s; 0.67→0.7 chỉ 9–11/16; 1.0 chỉ 5–6/16) — nén mạnh hơn làm 1 đỉnh bass/hài lớn bớt lấn át các cao độ hòa âm còn lại. Chọn 0.5 (giữa vùng phẳng).
    const PEARSON_EXTRA_POWER = 0.5;
    const MIN_PROFILE_SPREAD = 1e-6;      // độ lệch chuẩn tối thiểu của chroma (phẳng/hằng số => Pearson không xác định)
    // Quy đổi MỌI ngưỡng "biên điểm" cũ sang thang Pearson. Thang mới giãn biên top1-top2 gấp nhiều lần (đo: xem báo cáo) nên ngưỡng giữ nguyên số CŨ sẽ mất ý nghĩa.
    // MARGIN_SCALE: hệ số đổi đơn vị biên. Đo trên 110 ca: biên trung vị @12 s tăng 0.022 → 0.180 (~8 lần); chọn 5 (thận trọng, thấp hơn tỷ lệ đo) — CHỈ là đổi đơn vị.
    // Biên tăng KHÔNG chứng minh accuracy tăng; độ đúng của các ngưỡng đã quy đổi được kiểm chứng riêng bằng benchmark (ca đúng vs ca sai).
    const MARGIN_SCALE = PEARSON_ON ? 5 : 1;
    // confidence (bằng chứng cho Key đứng đầu) = 0.5·fit + 0.5·separation, mỗi vế ∈ [0,1] (xem estimateKeyFromChroma):
    //   fit        = (r1 − FIT_FLOOR)/(FIT_FULL − FIT_FLOOR), r1 = tương quan Pearson thuần của Key đứng đầu  — "chroma có giống một Key không"
    //   separation = margin / SEPARATION_FULL, margin = điểm top1 − điểm top2                                   — "Key này hơn Key sát nhất bao nhiêu"
    const FIT_FLOOR = 0.30, FIT_FULL = 0.85;
    const SEPARATION_FULL = 0.10 * MARGIN_SCALE;

    const A4_HZ = 440.0;
    const HARMONIC_AMP = [1.0, 0.60, 0.42, 0.30, 0.20, 0.15, 0.10, 0.07];

    const CHROMA_SMOOTHING = 0.96;
    const CHROMA_SMOOTHING_FAST = 0.80;

    // AI-KEY-SCORING-A-01: ngưỡng tối thiểu để một ước lượng được coi là "có Key". Thang cũ (điểm cosine+bass, có thể >1) dùng 0.35; thang mới confidence=0.5·fit+0.5·separation ∈ [0,1].
    // Đo (126 ca, xem báo cáo): ca KHÔNG có Key (nhiễu/ù/hợp âm rỗng) có confidence tối đa 0.52 (p90 0.50); ca đúng p10=0.69. 0.35 không còn ý nghĩa (để lọt ù 60 Hz) => 0.55.
    // ModEngine dùng chung hằng này qua KeyEngine.MIN_CONFIDENCE (không sửa modEngine.js).
    const MIN_CONFIDENCE = KEY_SCORING_PEARSON_ENABLED ? 0.55 : 0.35;
    const STABLE_CHECKS = 4;
    const CHECK_INTERVAL_MS = 1500;
    const VOTE_WINDOW = 8;
    const VOTE_MIN_AGREE = 5;
    const BASS_MAX_HZ = 260;
    const BASS_WEIGHT = 4;

    // === TASK A35 — Bass Boost có điều kiện: chỉ cộng khi chroma hỗ trợ tối thiểu ===
    const MIN_CHROMA_EVIDENCE = 0.05; // chroma[root] phải đạt mức này mới được cộng bassBoost

    const MUSICAL_CONTENT_MIN_ENERGY = 0.08;
    let hasMusicalContent = false;

    // === TASK AI-KEY-ENGINE-COMPLETE-01 — CỔNG NỘI DUNG THÍCH ỨNG (sửa nguyên nhân "VU có tín hiệu nhưng Key luôn LISTENING") ===
    // Nguyên nhân gốc (đo bằng mô phỏng FFT thật, xem REPORT): cổng cũ so contentRms (căn trung bình bình phương biên độ của ~1000 bin 50–6000 Hz,
    // đơn vị |X|/N của getFloatFrequencyData) với hằng số tuyệt đối 0.0005. Với cửa sổ Blackman/FFT 8192, ngưỡng đó tương đương nhạc ≈ -31 dBFS RMS:
    // nhạc loopback ≤ -35 dBFS (rất phổ biến) có contentRms ≈ 0.00035 → 0 khung đạt → hasMusicalContent=false mãi mãi → chroma không tích luỹ.
    // (log thật: maxContentRms≈0.000496 — ngay sát ngưỡng.) Hạ ngưỡng tuyệt đối đơn thuần sẽ cho nhiễu nền/âm trầm lọt vào => KHÔNG làm vậy.
    // Thay bằng bằng chứng "âm nhạc" không phụ thuộc âm lượng: số ĐỈNH HÒA ÂM NỔI BẬT (đỉnh cục bộ cao hơn trung bình dB của các bin lân cận ≥ TONAL_PROMINENCE_DB).
    // Nhiễu trắng/hồng/nâu và im lặng không có đỉnh như vậy; nhạc có hợp âm có nhiều đỉnh ở MỌI mức âm lượng. Sàn tuyệt đối chỉ để loại tín hiệu "gần số 0".
    // Tắt/hoàn nguyên: ADAPTIVE_CONTENT_GATE_ENABLED = false (cổng 0.0005 + ngưỡng bass 0.01 trở về y hệt trước task này).
    const ADAPTIVE_CONTENT_GATE_ENABLED = true;
    const CONTENT_ABS_FLOOR_RMS = 1e-6;     // sàn tuyệt đối (≈ -85 dBFS nhạc) — chỉ loại số 0 / dither cực nhỏ
    const TONAL_PROMINENCE_DB = 15;         // đỉnh phải cao hơn trung bình dB của bin lân cận ≥ 15 dB (nhiễu Rayleigh: xác suất ~0)
    const TONAL_MIN_PEAKS = 4;              // cần ≥ 4 đỉnh nổi bật trong khung (hợp âm 3 nốt + hài đã cho ≥ 10)
    const TONAL_NEIGHBOR_NEAR = 7;          // lân cận tính từ ±7 .. ±11 bin (ngoài thuỳ chính Blackman ±3)
    const TONAL_NEIGHBOR_FAR = 11;
    const BASS_MIN_ENERGY_LEGACY = 0.01;    // ngưỡng bass tuyệt đối cũ (chỉ dùng khi tắt cổng thích ứng)
    const BASS_MIN_ENERGY_ADAPTIVE = 1e-5;  // bản thích ứng: nhạc nhỏ vẫn bỏ phiếu bass (hasMusicalContent đã chặn nhiễu)

    let frameCounter = 0;
    let firstEvidenceAt = null;
    let firstEvidenceFrame = null;
    let firstProvisionalAt = null;
    let firstProvisionalFrame = null;

    let chromaAnalyser = null;
    let chromaDataArray = null;
    let audioCtxRef = null;
    let chromaVector = new Array(12).fill(0);
    let chromaVectorFast = new Array(12).fill(0);
    let contentEnergyEMA = 0;

    let bassRootVotes = new Array(12).fill(0);

    // === TASK AI-ALG-03 (D1) — BÙ TUNING: ước lượng độ lệch tuning (cent) rồi dời lưới tần số nốt tương ứng. ===
    // Vấn đề đã đo (AI-ALG-02/03, nhạc tổng hợp): lưới nốt cố định A4=440 Hz + nội suy ±1 bin làm mất đỉnh khi nhạc lệch tuning
    // -> Key sai Major/Minor (baseline chỉ 3–5/8 đúng ở lệch 10–45 cent). Phương pháp: chọn offset (cent) làm CỰC ĐẠI năng lượng đỉnh
    // tại lưới nốt (hài 1–3, MIDI 45–84), có thiên lệch về 0 (chỉ đổi khi tốt hơn offset 0 ≥12%), bỏ phiếu theo thời gian.
    // CHỈ dùng ứng viên -40..+40: ±50 cent là biên mơ hồ (lưới +50 và -50 khác nhau đúng 1 bán cung -> nhận nhầm Key lệch nửa cung,
    // lỗi đã tái hiện ở prototype AI-ALG-02 và đã giải thích).
    // Tắt nhanh/hoàn nguyên: đặt TUNING_COMPENSATION_ENABLED = false (hành vi trở về đúng như trước AI-ALG-03).
    const TUNING_COMPENSATION_ENABLED = true;
    const TUNING_CANDIDATES_CENTS = [-40, -30, -20, -10, 0, 10, 20, 30, 40];
    const TUNING_ESTIMATE_EVERY_FRAMES = 30;
    const TUNING_MIN_MIDI = 45; // bỏ nốt trầm (độ phân giải bin quá thô)
    const TUNING_ZERO_BIAS = 1.12; // AI-ALG-03: 1.05 làm test A32 (phổ đỉnh-đơn) chọn nhầm -10 cent -> nâng lên 1.12
    const TUNING_VOTE_DECAY = 0.9;
    const TUNING_VOTE_MIN = 3;
    let tuningCents = 0;
    let tuningVotes = {};
    let tuningFrame = 0;

    // === TASK AI-ALG-05 — BẰNG CHỨNG KEY DÀI HẠN (chống "nghe theo hợp âm thay vì theo giọng") ===
    // Nguyên nhân gốc (đo trên log nhạc thật 07–10/2026 + benchmark pop tổng hợp): chromaVector(Fast) chỉ nhớ ~0.1–0.4 s nên top1 BÁM THEO HỢP ÂM
    // đang chơi (Am→F→C→G ... => khoá đổi liên tục, Major/Minor margin ~0.01); fast-path khoá chỉ sau 3 tick x 400 ms. Key là thuộc tính của CẢ đoạn nhạc
    // => cần tích luỹ chroma ~10–30 s. Hai bộ tích luỹ (chuẩn hoá TỪNG KHUNG để đoạn ồn không lấn át): Long (τ=LONG_TAU_S) dùng để khoá Key,
    // Mid (τ=MID_TAU_S) dùng cho ModEngine (phát hiện chuyển điệu thật, không báo giả theo hợp âm).
    // Tắt/hoàn nguyên: LONG_EVIDENCE_ENABLED = false (hành vi trở về như trước AI-ALG-05).
    const LONG_EVIDENCE_ENABLED = true;
    const LONG_TAU_S = 20;
    const MID_TAU_S = 6;
    const LONG_WARM_S = 1.0;          // chưa tích luỹ đủ thì không chặn (giữ hành vi cũ ở giây đầu)
    const LONG_CHANGE_TICKS = 3;      // đổi Key đã khoá: Key dài hạn mới phải dẫn đầu liên tục ≥ 3 tick (400 ms)
    const LONG_REL_FACTOR = 3;        // đổi giữa 2 Key relative (cùng bộ nốt): gấp 3 biên/thời gian
    const LONG_CHANGE_GAP = 0.01 * MARGIN_SCALE; // ... và hơn điểm của Key đang khoá ≥ 0.01 (thang CŨ cosine 0..1; thang Pearson: quy đổi bằng MARGIN_SCALE)
    const LONG_LOCK_TICKS = 10;       // khoá thẳng theo Key dài hạn khi nó dẫn đầu liên tục ≥ 10 tick (4 s) ...
    const LONG_LOCK_MIN_S = 4;        // ... và đã tích luỹ ≥ 4 s nhạc
    const SHORT_TAU_S = 1.5;          // bộ tích luỹ ngắn: đo "năng lượng ngoài thang của Key dài hạn" + làm điểm neo khi Key thật sự đổi
    const OOK_RATIO = 0.25;           // ≥ 25% năng lượng ngoài thang âm của Key dài hạn ...
    const OOK_NEWKEY_MAX_OUT = 0.12;  // AI-FIX-06: Key mới phải giải thích đoạn ngắn: ngoài-thang của Key mới ≤ 12%
    const OOK_EXPLAIN_GAP = 0.15;     // ... và ngoài-thang của Key cũ phải lớn hơn Key mới ≥ 15 điểm %
    const OOK_COOLDOWN_S = 12;        // ... tối thiểu 12 s giữa 2 lần neo lại
    let lastReanchorAtS = -1e9;
    const OOK_TICKS = 4;              // ... liên tục ≥ 4 tick (1.6 s) => nghi chuyển điệu thật: neo lại bộ tích luỹ dài hạn vào đoạn ngắn
    const LONG_ANCHOR_MASS_S = 2;     // "khối lượng" bằng chứng của điểm neo (giây tương đương) — dữ liệu mới lấn át điểm neo sau vài giây
    const LONG_LOCK_MIN_MODAL = 0.2;  // khoá thẳng theo dài hạn chỉ khi có bằng chứng quãng 3 rõ (hợp âm thiếu quãng 3 = mập mờ Major/Minor, không khoá)
    const LONG_FIRST_LOCK_S = 8;      // khoá LẦN ĐẦU: chờ ≥ 8 s nhạc, trừ khi tín hiệu "đứng yên" (1 hợp âm giữ lâu: ngắn ≈ dài)
    const LONG_STATIONARY_COS = 0.97; // cosine(ngắn, dài) ≥ 0.97 => không có gì để lấy trung bình, khoá sớm vẫn đúng
    // TASK AI-KEY-ENGINE-COMPLETE-01 — lối tắt "đứng yên" (1 hợp âm giữ lâu) CHỈ hợp lệ sau LONG_STATIONARY_MIN_S giây nhạc tích luỹ.
    // Đo (benchmark keybench01): với 0 s, hợp âm mở đầu được giữ 2 s => khoá Tone của HỢP ÂM đó ngay tại 2,0 s (sai ở ~55% ca có hợp âm đầu ≠ tonic), sau đó mới tự sửa.
    // Đặt 0 = hành vi cũ (như trước task này). A/B đo được (27 ca nhạy cảm): 0 s → khoá đầu sai 10/27, trung vị khoá đầu 2,0 s; ≥4 s → khoá đầu sai 2/27, trung vị 8,8 s (đoạn <8 s giữ LISTENING).
    const LONG_STATIONARY_MIN_S = 4;
    const LONG_BASS_WEIGHT = PEARSON_ON ? 0.03 : 0.05;    // trọng số bass khi xếp hạng Key dài hạn/trung hạn/ngắn hạn (AI-KEY-SCORING-A-01: 0.03 ≤ 0.05; cũ 0.05)
    let chromaVectorLong = new Array(12).fill(0); // = longSum/longMass (hướng chroma dài hạn)
    let longSum = new Array(12).fill(0), longMass = 0;
    let chromaVectorShort = new Array(12).fill(0);
    let ookStreak = 0;
    let chromaVectorMid = new Array(12).fill(0);
    let longSeconds = 0;
    let lastLongAt = null;
    const longState = { key: null, streak: 0, result: null, stationary: false };

    let lastTop1Key = null;
    let lastTop1Label = null;
    let lastTop1ChangedAt = null;
    let lastLockedKey = null; // A35 — theo dõi Key đã khóa cuối cùng
    let candidateHistory = {}; // A35 — lưu lịch sử candidate để kiểm tra ổn định

    const BASS_VOTE_DECAY = 0.999;
    // AI-KEY-SCORING-A-01: bass chỉ là bằng chứng PHỤ. Trần cứng 0.03 điểm (≤ 0.05 theo yêu cầu) áp cho MỌI đường (nhanh/chậm/dài hạn); cũ 0.5 (= lớn hơn cả biên giữa 2 Key). Cộng GIỐNG HỆT cho Major và Minor của cùng 1 gốc nên bass không tự quyết Major/Minor.
    const BASS_ROOT_BOOST_WEIGHT = PEARSON_ON ? 0.03 : 0.5;

    // === TASK A35 — Stability Lock & Modulation Detector ===
    const STABILITY_REQUIRED_TICKS = 2; // candidate mới phải ổn định bao nhiêu tick trước khi đổi Key
    const MODULATION_MARGIN_GAIN = 1.0; // TASK A40 — hạ từ 1.5 xuống 1.0 (đã đo bằng trace thật: yêu
    // cầu margin mới PHẢI CAO HƠN margin cũ 50% là quá khắt khe cho 1 modulation thật giữa 2 hợp âm
    // rõ ràng như nhau — D#m thật có margin=0.143 so với baseline D Minor cũ ~0.12 (chỉ cao hơn ~19%,
    // không tới 50%) vẫn bị từ chối vĩnh viễn nếu giữ 1.5. Hạ xuống 1.0 nghĩa là chỉ còn yêu cầu margin
    // mới KHÔNG YẾU HƠN baseline cũ (không còn đòi hỏi phải "vượt trội"), vẫn là 1 sàn thật (không phải
    // bỏ hẳn kiểm tra). Bảo vệ chống flicker/dao động thoáng qua (Test E phần 2) vốn đã do CÁC CƠ CHẾ
    // KHÁC đảm nhiệm độc lập (vote count/elapsed/stability streak — flicker quá ngắn không đủ tích luỹ
    // đủ vote/streak để tới được bước kiểm tra này), không phụ thuộc chính vào hệ số 1.5 này.

    // === TASK A40 — Modal Evidence Floor (hiệu chỉnh bằng dữ liệu thật ở A39, ĐÃ SỬA LẠI cho đúng
    // đơn vị) ===
    // A38 chứng minh computeModalEvidence() là công thức TỶ LỆ không sàn tuyệt đối — rò rỉ harmonic
    // cực nhỏ vẫn cho ra modalConfidence=1.0 (tối đa), y hệt khi có quãng 3 THẬT.
    // QUAN TRỌNG: A39 hiệu chỉnh floor ban đầu (0.05) dựa trên chromaVector THÔ (trước
    // powerLawNormalize) — nhưng computeModalEvidence() thực ra nhận `chromaNorm` (đã qua
    // powerLawNormalize, luỹ thừa 0.67) làm tham số, KHÔNG PHẢI vector thô. Luỹ thừa 0.67 khuếch đại
    // bất cân xứng các giá trị nhỏ (vd 0.0058³·⁶⁷≈0.057 → sau normalize còn lớn hơn nhiều so với tỷ lệ
    // gốc) — nên floor 0.05 đo sai đơn vị, KHÔNG đủ cao cho 1 số root (đo thực tế thấy root F vẫn lọt
    // qua với modalConfidence=0.52 dù chưa hề có quãng 3 thật). Đã đo lại ĐÚNG đơn vị (chromaNorm,
    // đủ 12 root, cả 2 chroma vector Fast/Slow): No-Third tối đa = 0.0655 (root C); Major/Minor rõ tối
    // thiểu = 0.4929 (root G#) — khoảng cách ~7.5 lần, vẫn rõ ràng dù hẹp hơn số liệu sai đơn vị trước
    // đó. Chọn 0.18 — nằm giữa, cách đều cả 2 phía theo tỷ lệ (~2.75× so với No-Third max, ~2.74× dưới
    // Major/Minor min).
    const MODAL_EVIDENCE_FLOOR = 0.18;

    let running = false;
    let rafId = null;

    const levelListeners = [];
    const PROVISIONAL_INTERVAL_MS = 400;
    const provisionalListeners = [];
    let provisionalTimerId = null;

    // TASK AI-KEY-FAST-05 — PROBE tín hiệu tại ĐÚNG điểm KeyEngine đọc phổ (chỉ ghi số để chẩn đoán; KHÔNG tham gia
    // quyết định Key). Đọc qua getDebugSnapshot().inputProbe.
    // TASK AI-KEY-FAST-06 — đếm vòng runVoteLoop (chỉ để chẩn đoán lifecycle; không tham gia quyết định): active>1 = có vòng chạy song song.
    const loopStats = { started: 0, stopped: 0, active: 0, maxActive: 0 };
    const inputProbe = { frames: 0, framesAccepted: 0, tonalPeaks: 0, maxTonalPeaks: 0, lastLevelDb: null, framesWithContent: 0, lastContentRms: 0, maxContentRms: 0, lastMaxDb: null, maxDbEver: null, finiteBins: 0, sampleRate: null, fftSize: null, binCount: null, lastFrameAt: null };

    function init(audioContext, sourceNode) {
        audioCtxRef = audioContext;
        chromaAnalyser = audioContext.createAnalyser();
        chromaAnalyser.fftSize = 8192;
        chromaAnalyser.smoothingTimeConstant = 0;
        sourceNode.connect(chromaAnalyser);
        chromaDataArray = new Float32Array(chromaAnalyser.frequencyBinCount);
        chromaVector = new Array(12).fill(0);
        chromaVectorFast = new Array(12).fill(0);
        contentEnergyEMA = 0;
        hasMusicalContent = false;
        bassRootVotes = new Array(12).fill(0);
        tuningCents = 0; tuningVotes = {}; tuningFrame = 0; // AI-ALG-03: reset theo nguồn mới
        chromaVectorLong = new Array(12).fill(0); longSum = new Array(12).fill(0); longMass = 0; chromaVectorShort = new Array(12).fill(0); ookStreak = 0; chromaVectorMid = new Array(12).fill(0); longSeconds = 0; lastReanchorAtS = -1e9; lastLongAt = null; longState.key = null; longState.streak = 0; longState.result = null; // AI-ALG-05
        lastTop1Key = null;
        lastTop1Label = null;
        lastTop1ChangedAt = null;
        lastLockedKey = null;
        candidateHistory = {};

        frameCounter = 0;
        inputProbe.frames = 0; inputProbe.framesAccepted = 0; inputProbe.tonalPeaks = 0; inputProbe.maxTonalPeaks = 0; inputProbe.lastLevelDb = null; inputProbe.framesWithContent = 0; inputProbe.lastContentRms = 0; inputProbe.maxContentRms = 0; inputProbe.lastMaxDb = null; inputProbe.maxDbEver = null; inputProbe.finiteBins = 0; // TASK AI-KEY-FAST-05
        firstEvidenceAt = null;
        firstEvidenceFrame = null;
        firstProvisionalAt = null;
        firstProvisionalFrame = null;

        running = true;
        loop();
        startProvisionalTicker();
    }

    function frequencyToPitchClass(freq) {
        if (freq <= 0) return -1;
        const midi = 69 + 12 * Math.log2(freq / 440);
        return (((Math.round(midi) % 12) + 12) % 12);
    }

    function estimateTuningCents(binHz, binCount) {
        // Năng lượng tại ĐÚNG tần số (nội suy tuyến tính giữa 2 bin, cùng cách chroma đang tính) — KHÔNG dùng max ±1 bin vì
        // cửa sổ đó rộng ~±6 Hz (48 kHz/FFT 8192) nên không phân biệt nổi vài chục cent ở nốt trầm (đã đo: chọn nhầm trên phổ thưa).
        let bestOff = 0, bestE = -1, zeroE = 0;
        for (const off of TUNING_CANDIDATES_CENTS) {
            let e = 0;
            for (let midi = TUNING_MIN_MIDI; midi <= 84; midi++) {
                for (let h = 1; h <= 3; h++) {
                    const x = (A4_HZ * Math.pow(2, (midi - 69) / 12 + off / 1200) * h) / binHz;
                    const b0 = Math.floor(x);
                    if (b0 < 1 || b0 + 1 >= binCount) continue;
                    const frac = x - b0;
                    const amp0 = Math.pow(10, Math.max(-100, chromaDataArray[b0]) / 20);
                    const amp1 = Math.pow(10, Math.max(-100, chromaDataArray[b0 + 1]) / 20);
                    e += (amp0 * (1 - frac) + amp1 * frac) / h;
                }
            }
            if (off === 0) zeroE = e;
            if (e > bestE) { bestE = e; bestOff = off; }
        }
        if (bestOff !== 0 && bestE < zeroE * TUNING_ZERO_BIAS) bestOff = 0;
        return bestOff;
    }

    function updateChromaVector() {
        if (!chromaAnalyser || !chromaDataArray) return;
        chromaAnalyser.getFloatFrequencyData(chromaDataArray);

        const sampleRate = audioCtxRef?.sampleRate || 48000;
        const binHz = sampleRate / chromaAnalyser.fftSize;
        const binCount = chromaDataArray.length;
        if (TUNING_COMPENSATION_ENABLED && (tuningFrame++ % TUNING_ESTIMATE_EVERY_FRAMES) === 0) {
            const off = estimateTuningCents(binHz, binCount);
            tuningVotes[off] = (tuningVotes[off] || 0) * TUNING_VOTE_DECAY + 1;
            for (const k in tuningVotes) if (+k !== off) tuningVotes[k] *= TUNING_VOTE_DECAY;
            let bk = 0, bv = -1;
            for (const k in tuningVotes) if (tuningVotes[k] > bv) { bv = tuningVotes[k]; bk = +k; }
            if (bv >= TUNING_VOTE_MIN) tuningCents = bk;
        }
        const frame = new Array(12).fill(0);
        const bassFrame = new Array(12).fill(0);

        for (let midi = 21; midi <= 108; midi++) {
            const pc = ((midi % 12) + 12) % 12;
            const fFun = A4_HZ * Math.pow(2, (midi - 69) / 12 + tuningCents / 1200);
            if (fFun < 27 || fFun > 6000) continue;
            let energy = 0;
            for (let h = 0; h < HARMONIC_AMP.length; h++) {
                const fH = fFun * (h + 1);
                if (fH > sampleRate / 2) break;
                const bin = fH / binHz;
                const b0 = Math.floor(bin);
                const b1 = b0 + 1;
                if (b1 >= binCount) break;
                const frac = bin - b0;
                const db0 = chromaDataArray[b0];
                const db1 = chromaDataArray[b1];
                if (db0 <= -100 && db1 <= -100) continue;
                const amp0 = Math.pow(10, Math.max(-100, db0) / 20);
                const amp1 = Math.pow(10, Math.max(-100, db1) / 20);
                const amp = amp0 * (1 - frac) + amp1 * frac;
                energy += amp * HARMONIC_AMP[h];
            }
            frame[pc] += energy * energy;
            if (fFun <= BASS_MAX_HZ) bassFrame[pc] += energy;
        }

        const BIN_LO = Math.max(1, Math.ceil(50 / binHz));
        const BIN_HI = Math.min(binCount - 1, Math.floor(6000 / binHz));
        let contentRms = 0;
        const contentCount = BIN_HI - BIN_LO + 1;
        for (let b = BIN_LO; b <= BIN_HI; b++) {
            const amp = Math.pow(10, chromaDataArray[b] / 20);
            contentRms += amp * amp;
        }
        const frameHasContent = contentCount > 0 && Math.sqrt(contentRms / contentCount) > 0.0005;
        // TASK AI-KEY-FAST-05 — chỉ ghi probe (không dùng cho quyết định). maxDb = bin lớn nhất trong 50–6000 Hz;
        // -Infinity/null = buffer toàn "không có tín hiệu"; finiteBins = số bin > -100 dB.
        try {
            let maxDb = -Infinity, finite = 0;
            for (let b = BIN_LO; b <= BIN_HI; b++) { const d = chromaDataArray[b]; if (d > maxDb) maxDb = d; if (d > -100) finite++; }
            const rmsVal = contentCount > 0 ? Math.sqrt(contentRms / contentCount) : 0;
            inputProbe.frames++; if (frameHasContent) inputProbe.framesWithContent++;
            inputProbe.lastContentRms = rmsVal; if (rmsVal > inputProbe.maxContentRms) inputProbe.maxContentRms = rmsVal;
            inputProbe.lastMaxDb = Number.isFinite(maxDb) ? maxDb : null;
            if (inputProbe.lastMaxDb !== null && (inputProbe.maxDbEver === null || inputProbe.lastMaxDb > inputProbe.maxDbEver)) inputProbe.maxDbEver = inputProbe.lastMaxDb;
            inputProbe.finiteBins = finite; inputProbe.sampleRate = sampleRate; inputProbe.fftSize = chromaAnalyser.fftSize; inputProbe.binCount = binCount; inputProbe.lastFrameAt = Date.now();
        } catch (e) { /* probe không bao giờ được làm hỏng vòng phân tích */ }

        // TASK AI-KEY-ENGINE-COMPLETE-01 — cổng thích ứng (xem khối chú thích ở đầu file). frameHasContent (cổng cũ 0.0005) GIỮ NGUYÊN làm số đo chẩn đoán.
        let frameAccepted = frameHasContent;
        if (ADAPTIVE_CONTENT_GATE_ENABLED) {
            const rmsNow = contentCount > 0 ? Math.sqrt(contentRms / contentCount) : 0;
            let peaks = 0;
            if (rmsNow > CONTENT_ABS_FLOOR_RMS) {
                const lo = BIN_LO + TONAL_NEIGHBOR_FAR, hi = BIN_HI - TONAL_NEIGHBOR_FAR;
                for (let b = lo; b <= hi; b++) {
                    const d = chromaDataArray[b];
                    if (!(d > -140) || d < chromaDataArray[b - 1] || d < chromaDataArray[b + 1]) continue; // chỉ xét đỉnh cục bộ (bỏ -Infinity/NaN)
                    let sum = 0;
                    for (let k = TONAL_NEIGHBOR_NEAR; k <= TONAL_NEIGHBOR_FAR; k++) {
                        const l = chromaDataArray[b - k], r = chromaDataArray[b + k];
                        sum += (l > -140 ? l : -140) + (r > -140 ? r : -140);
                    }
                    if (d - sum / (2 * (TONAL_NEIGHBOR_FAR - TONAL_NEIGHBOR_NEAR + 1)) >= TONAL_PROMINENCE_DB) peaks++;
                }
            }
            frameAccepted = rmsNow > CONTENT_ABS_FLOOR_RMS && peaks >= TONAL_MIN_PEAKS;
            try {
                inputProbe.tonalPeaks = peaks; if (peaks > inputProbe.maxTonalPeaks) inputProbe.maxTonalPeaks = peaks;
                inputProbe.lastLevelDb = rmsNow > 0 ? 20 * Math.log10(rmsNow) : null; if (frameAccepted) inputProbe.framesAccepted++;
            } catch (e) { /* probe không được làm hỏng vòng phân tích */ }
        }

        contentEnergyEMA = contentEnergyEMA * 0.9 + (frameAccepted ? 1 : 0) * 0.1;
        hasMusicalContent = contentEnergyEMA >= 0.5;
        frameCounter++;

        if (hasMusicalContent && firstEvidenceAt === null) {
            firstEvidenceAt = Date.now();
            firstEvidenceFrame = frameCounter;
            sendTelemetry({ event: "FIRST_EVIDENCE", frame: firstEvidenceFrame });
        }

        if (hasMusicalContent) {
            for (let i = 0; i < 12; i++) {
                chromaVector[i] = chromaVector[i] * CHROMA_SMOOTHING + frame[i] * (1 - CHROMA_SMOOTHING);
                chromaVectorFast[i] = chromaVectorFast[i] * CHROMA_SMOOTHING_FAST + frame[i] * (1 - CHROMA_SMOOTHING_FAST);
            }
        }

        // TASK AI-ALG-05 — tích luỹ dài hạn theo THỜI GIAN THỰC (dt), chuẩn hoá từng khung (power-law 0.67 + L2) rồi EMA.
        {
            const nowMs = Date.now();
            const dtS = lastLongAt === null ? 0 : Math.min(0.25, Math.max(0.005, (nowMs - lastLongAt) / 1000));
            lastLongAt = nowMs;
            if (LONG_EVIDENCE_ENABLED && hasMusicalContent && dtS > 0) {
                const fn = powerLawNormalize(frame);
                const dL = Math.exp(-dtS / LONG_TAU_S), dM = Math.exp(-dtS / MID_TAU_S), dS = Math.exp(-dtS / SHORT_TAU_S);
                longMass = longMass * dL + dtS;
                for (let i = 0; i < 12; i++) {
                    longSum[i] = longSum[i] * dL + fn[i] * dtS;
                    chromaVectorLong[i] = longSum[i] / longMass;
                    chromaVectorMid[i] = chromaVectorMid[i] * dM + fn[i] * (1 - dM);
                    chromaVectorShort[i] = chromaVectorShort[i] * dS + fn[i] * (1 - dS);
                }
                longSeconds += dtS;
            }
        }

        let winnerPc = -1, winnerVal = 0;
        for (let i = 0; i < 12; i++) {
            if (bassFrame[i] > winnerVal) { winnerVal = bassFrame[i]; winnerPc = i; }
        }
        for (let i = 0; i < 12; i++) bassRootVotes[i] *= BASS_VOTE_DECAY;
        if (hasMusicalContent && winnerPc >= 0 && winnerVal > (ADAPTIVE_CONTENT_GATE_ENABLED ? BASS_MIN_ENERGY_ADAPTIVE : BASS_MIN_ENERGY_LEGACY)) bassRootVotes[winnerPc] += 1; // AI-KEY-ENGINE-COMPLETE-01: 0.01 tuyệt đối làm bass không bao giờ bỏ phiếu khi nhạc nhỏ

        levelListeners.forEach((cb) => cb(chromaVector));
    }

    function pearsonCorrelation(a, b) {
        const meanA = a.reduce((s, v) => s + v, 0) / a.length;
        const meanB = b.reduce((s, v) => s + v, 0) / b.length;
        let num = 0, denomA = 0, denomB = 0;
        for (let i = 0; i < a.length; i++) {
            const da = a[i] - meanA;
            const db = b[i] - meanB;
            num += da * db;
            denomA += da * da;
            denomB += db * db;
        }
        const denom = Math.sqrt(denomA * denomB);
        return denom === 0 ? 0 : num / denom;
    }

    function powerLawNormalize(vector) {
        const out = new Array(12).fill(0);
        let norm = 0;
        for (let i = 0; i < 12; i++) out[i] = Math.pow(Math.max(0, vector[i]), 0.67);
        for (let i = 0; i < 12; i++) norm += out[i] * out[i];
        norm = Math.sqrt(norm);
        if (norm > 0) for (let i = 0; i < 12; i++) out[i] /= norm;
        return out;
    }

    function powerLawNormalizeExp(vector, exp) {
        const out = new Array(12).fill(0);
        let norm = 0;
        for (let i = 0; i < 12; i++) out[i] = Math.pow(Math.max(0, vector[i]), exp);
        for (let i = 0; i < 12; i++) norm += out[i] * out[i];
        norm = Math.sqrt(norm);
        if (norm > 0) for (let i = 0; i < 12; i++) out[i] /= norm;
        return out;
    }

    function cosineSimilarity12(a, b) {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < 12; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
        return (na > 0 && nb > 0) ? dot / Math.sqrt(na * nb) : 0;
    }

    function rotateProfile(profile, steps) {
        const s = ((steps % 12) + 12) % 12;
        return profile.slice(12 - s).concat(profile.slice(0, 12 - s));
    }

    // === TASK A35 — Modal Evidence: đo khoảng cách 3rd để phân biệt Major/Minor ===
    function computeModalEvidence(chromaNorm, rootIndex) {
        // 3rd Minor = +3 bán âm từ Root; 3rd Major = +4 bán âm
        const min3rdIdx = (rootIndex + 3) % 12;
        const maj3rdIdx = (rootIndex + 4) % 12;
        const minorStrength = chromaNorm[min3rdIdx];
        const majorStrength = chromaNorm[maj3rdIdx];
        const total = minorStrength + majorStrength;
        // TASK A40 — sàn năng lượng tuyệt đối (A39 calibration). Trước bản vá này, "total" chỉ được
        // kiểm tra === 0 tuyệt đối (gần như không bao giờ đúng trong thực tế vì rò rỉ harmonic luôn
        // để lại 1 lượng cực nhỏ) — nên nhánh phòng thủ 0.5/0.5 gần như không bao giờ kích hoạt. Mở
        // rộng điều kiện sang "total < MODAL_EVIDENCE_FLOOR" để nhánh phòng thủ này hoạt động đúng ý
        // định ban đầu: khi KHÔNG đủ bằng chứng (total quá nhỏ), coi Major/Minor ngang nhau
        // (modalConfidence=0) thay vì để tỷ lệ khuếch đại nhiễu thành "tự tin tuyệt đối".
        if (total === 0 || total < MODAL_EVIDENCE_FLOOR) return { minorStrength: 0.5, majorStrength: 0.5, modalConfidence: 0 };
        return {
            minorStrength: minorStrength / total,
            majorStrength: majorStrength / total,
            modalConfidence: Math.abs(majorStrength - minorStrength) / total
        };
    }

    // === TASK A35 — Stability Check: candidate đã xuất hiện đủ số tick liên tiếp chưa? ===
    function updateCandidateHistory(candidateKey) {
        if (!candidateHistory[candidateKey]) {
            candidateHistory = {};
            candidateHistory[candidateKey] = 1;
        } else {
            candidateHistory[candidateKey]++;
        }
        // Xóa các candidate khác không còn xuất hiện
        for (const key in candidateHistory) {
            if (key !== candidateKey) candidateHistory[key] = Math.max(0, candidateHistory[key] - 1);
        }
        return candidateHistory[candidateKey] >= STABILITY_REQUIRED_TICKS;
    }

    // === TASK A35 — Modulation Check: có phải thay đổi thật hay chỉ dao động? ===
    function isTrueModulation(oldKey, newKey, newMargin, avgMarginHistory) {
        if (!oldKey || oldKey === newKey) return true;
        // Margin mới phải rõ ràng hơn trung bình cũ
        return newMargin > avgMarginHistory * MODULATION_MARGIN_GAIN;
    }

    // === TASK AI-KEY-SCORING-A-01 — hồ sơ KK/Temperley đã xoay sẵn cho 24 ứng viên (tính 1 lần) ===
    const ROT_PROFILES = (() => {
        const out = [];
        for (let root = 0; root < 12; root++) {
            out.push({ root, mode: "Major", kk: rotateProfile(KK_MAJOR, root), tp: rotateProfile(TEMPERLEY_MAJ, root) });
            out.push({ root, mode: "Minor", kk: rotateProfile(KK_MINOR, root), tp: rotateProfile(TEMPERLEY_MIN, root) });
        }
        return out;
    })();
    const PEARSON_MIN_EVIDENCE_REASON = { NOT_FINITE: "not-finite", EMPTY: "empty", FLAT: "flat", FEW_PITCH_CLASSES: "few-pitch-classes" };

    // Kiểm tra vector chroma có đủ thông tin để xếp hạng Key không. Trả { ok, reason }. KHÔNG dựa vào mức âm lượng tuyệt đối (đơn vị phụ thuộc đường vào) —
    // cổng "có nhạc không" thuộc hasMusicalContent; ở đây chỉ xét HÌNH DẠNG vector.
    function chromaHasKeyInformation(vector, chromaNorm) {
        if (!vector || vector.length !== 12) return { ok: false, reason: PEARSON_MIN_EVIDENCE_REASON.NOT_FINITE };
        for (let i = 0; i < 12; i++) if (typeof vector[i] !== "number" || !Number.isFinite(vector[i])) return { ok: false, reason: PEARSON_MIN_EVIDENCE_REASON.NOT_FINITE };
        let mx = 0, mean = 0;
        for (let i = 0; i < 12; i++) { if (chromaNorm[i] > mx) mx = chromaNorm[i]; mean += chromaNorm[i]; }
        if (!(mx > 0)) return { ok: false, reason: PEARSON_MIN_EVIDENCE_REASON.EMPTY };
        mean /= 12;
        let v = 0; for (let i = 0; i < 12; i++) v += (chromaNorm[i] - mean) * (chromaNorm[i] - mean);
        if (Math.sqrt(v / 12) < MIN_PROFILE_SPREAD) return { ok: false, reason: PEARSON_MIN_EVIDENCE_REASON.FLAT };
        let active = 0; for (let i = 0; i < 12; i++) if (chromaNorm[i] >= mx * ACTIVE_PC_REL) active++;
        if (active < MIN_ACTIVE_PITCH_CLASSES) return { ok: false, reason: PEARSON_MIN_EVIDENCE_REASON.FEW_PITCH_CLASSES };
        return { ok: true, reason: null };
    }

    function invalidKeyResult(reason, opts) {
        return {
            key: null, rootIndex: -1, mode: null, valid: false, invalidReason: reason, scoring: "pearson",
            confidence: 0, confidencePercent: 0, correlation: 0, fit: 0, separation: 0, hasMusicalContent,
            top1: null, top2: null, all: opts && opts.withAll ? [] : undefined, margin: 0, bassAgreement: 0, modalEvidence: null
        };
    }

    // Xếp hạng 24 ứng viên bằng Pearson (KK + Temperley) + bass phụ (≤ bassW) + modal phụ (≤ MODAL_BOOST). Thuần hàm của (vector, bassRootVotes, bassW).
    function estimateKeyPearson(vector, bassW, opts) {
        const chromaNorm = powerLawNormalize(vector);
        const info = chromaHasKeyInformation(vector, chromaNorm);
        if (!info.ok) return invalidKeyResult(info.reason, opts);
        const maxBassVotes = Math.max(...bassRootVotes, 1e-9);
        const corrVec = powerLawNormalizeExp(chromaNorm, PEARSON_EXTRA_POWER); // vector đưa vào Pearson
        const bw = Math.max(0, Math.min(bassW, 0.05)); // trần cứng: bass không bao giờ > 0.05 điểm dù tham số truyền vào là gì
        const allScores = [];
        for (const c of ROT_PROFILES) {
            const rKK = pearsonCorrelation(corrVec, c.kk), rT = pearsonCorrelation(corrVec, c.tp);
            const correlation = PEARSON_W_KK * rKK + PEARSON_W_TEMPERLEY * rT; // ∈ [-1,1]
            const bassAgreement = bassRootVotes[c.root] / maxBassVotes;
            const bassBoost = chromaNorm[c.root] >= MIN_CHROMA_EVIDENCE ? bassAgreement * bw : 0; // như A35: không có chroma ở gốc thì không được cộng bass
            const modalEv = computeModalEvidence(chromaNorm, c.root);
            const modalBoost = (c.mode === "Major" ? modalEv.majorStrength : modalEv.minorStrength) * MODAL_BOOST;
            allScores.push({ score: correlation + bassBoost + modalBoost, correlation, rKK, rT, bassBoost, modalBoost, root: c.root, mode: c.mode, bassAgreement, modalEvidence: modalEv });
        }
        allScores.sort((a, b) => b.score - a.score || a.root - b.root || (a.mode === "Major" ? -1 : 1)); // thứ tự xác định khi hoà điểm
        const top1 = allScores[0], top2 = allScores[1];
        const margin = top1.score - top2.score;
        const fit = clamp01((top1.correlation - FIT_FLOOR) / (FIT_FULL - FIT_FLOOR));
        const separation = clamp01(margin / SEPARATION_FULL);
        const confidence = clamp01(0.5 * fit + 0.5 * separation);
        const gated = hasMusicalContent ? confidence : 0;
        return {
            key: `${NOTE_NAMES[top1.root]} ${top1.mode}`, rootIndex: top1.root, mode: top1.mode, valid: true, invalidReason: null, scoring: "pearson",
            confidence: gated, confidencePercent: Math.round(clamp01(gated) * 100),
            correlation: top1.correlation, fit, separation, hasMusicalContent,
            top1, top2, all: opts && opts.withAll ? allScores : undefined, margin,
            bassAgreement: top1.bassAgreement, modalEvidence: top1.modalEvidence
        };
    }

    function estimateKeyFromChroma(sourceVector, opts) {
        const vector = sourceVector || chromaVector;
        const bassW = opts && typeof opts.bassWeight === "number" ? opts.bassWeight : BASS_ROOT_BOOST_WEIGHT; // AI-ALG-05: mặc định = cũ
        if (PEARSON_ON) return estimateKeyPearson(vector, bassW, opts);
        // ---------- CHẾ ĐỘ CŨ (KEY_SCORING_PEARSON_ENABLED = false): giữ NGUYÊN VĂN logic trước AI-KEY-SCORING-A-01 ----------
        const maxBassVotes = Math.max(...bassRootVotes, 1e-9);
        const chromaNorm = powerLawNormalize(vector);

        let best = { score: -Infinity, root: 0, mode: "Major", modalEvidence: null };
        const allScores = [];

        for (let root = 0; root < 12; root++) {
            const bassAgreement = bassRootVotes[root] / maxBassVotes;
            // === TASK A35 — Bass Boost có điều kiện ===
            const bassSupport = chromaNorm[root];
            const bassBoost = bassSupport >= MIN_CHROMA_EVIDENCE
                ? bassAgreement * bassW
                : 0; // Không hỗ trợ chroma → không được cộng điểm bass

            // === TASK A35 — Modal Evidence tính và điều chỉnh điểm ===
            const modalEv = computeModalEvidence(chromaNorm, root);

            let majorScore = (cosineSimilarity12(chromaNorm, rotateProfile(KS_MAJOR_PROFILE, root)) + 1) / 2 + bassBoost;
            let minorScore = (cosineSimilarity12(chromaNorm, rotateProfile(KS_MINOR_PROFILE, root)) + 1) / 2 + bassBoost;

            // === TASK A35 — Tăng điểm theo bằng chứng 3rd phù hợp ===
            majorScore += modalEv.majorStrength * MODAL_BOOST;
            minorScore += modalEv.minorStrength * MODAL_BOOST;

            if (majorScore > best.score) best = { score: majorScore, root, mode: "Major", modalEvidence: modalEv };
            if (minorScore > best.score) best = { score: minorScore, root, mode: "Minor", modalEvidence: modalEv };

            allScores.push({ score: majorScore, root, mode: "Major", bassAgreement });
            allScores.push({ score: minorScore, root, mode: "Minor", bassAgreement });
        }

        allScores.sort((a, b) => b.score - a.score);
        const top1 = allScores[0];
        const top2 = allScores[1];
        const margin = top1.score - top2.score;

        const gatedConfidence = hasMusicalContent ? best.score : 0;

        return {
            key: `${NOTE_NAMES[best.root]} ${best.mode}`,
            rootIndex: best.root,
            mode: best.mode,
            confidence: gatedConfidence,
            confidencePercent: Math.round(Math.max(0, Math.min(1, gatedConfidence)) * 100),
            hasMusicalContent,
            top1,
            top2,
            all: opts && opts.withAll ? allScores : undefined, // AI-ALG-05: 24 điểm (chỉ khi yêu cầu)
            margin,
            bassAgreement: top1.bassAgreement,
            modalEvidence: best.modalEvidence // Thêm bằng chứng modal vào kết quả
        };
    }

    function shortestSemitoneDelta(fromIndex, toIndex) {
        let delta = (toIndex - fromIndex + 12) % 12;
        if (delta > 6) delta -= 12;
        return delta;
    }

    const MIN_ELAPSED_BEFORE_LOCK_MS = 15000;
    const FAST_LOCK_MIN_ELAPSED_MS = 3000;
    const ADAPTIVE_LOCK_CONFIDENCE = PEARSON_ON ? 0.80 : 0.80; // AI-KEY-SCORING-A-01: ngưỡng trên decisionScore (confidenceV2.combined) — định nghĩa lại ở thang mới, xem hiệu chỉnh trong báo cáo
    const ADAPTIVE_LOCK_STREAK_REQUIRED = 3;

    const FAST_PATH_INTERVAL_MS = PROVISIONAL_INTERVAL_MS;
    const FAST_PATH_MIN_ELAPSED_MS = 1200;
    const FAST_PATH_STREAK_REQUIRED = 3;
    const FAST_PATH_MIN_CONFIDENCE = ADAPTIVE_LOCK_CONFIDENCE;

    // === TASK AI-ALG-05 — ước lượng Key dài hạn + cổng đồng thuận ===
    function estimateKeyLong() { return estimateKeyFromChroma(chromaVectorLong, { bassWeight: LONG_BASS_WEIGHT, withAll: true }); }
    function estimateKeyMid() { return estimateKeyFromChroma(chromaVectorMid, { bassWeight: LONG_BASS_WEIGHT }); }
    // Tỷ lệ năng lượng (bộ tích luỹ ngắn τ≈1.5 s) nằm NGOÀI thang âm của Key (root, mode). Trưởng = 7 nốt trưởng; thứ = 7 nốt thứ tự nhiên + âm dẫn.
    function outOfScaleRatio(rootIndex, mode, window) {
        const src = window === "mid" ? chromaVectorMid : chromaVectorShort;
        if (!Number.isInteger(rootIndex) || rootIndex < 0 || rootIndex > 11) return null;
        const offs = mode === "Major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11];
        const inScale = new Array(12).fill(false);
        for (const o of offs) inScale[(rootIndex + o) % 12] = true;
        let tot = 0, out = 0;
        for (let i = 0; i < 12; i++) { const e = src[i] * src[i]; tot += e; if (!inScale[i]) out += e; }
        return tot > 0 ? out / tot : null;
    }
    function updateLongState() {
        if (!LONG_EVIDENCE_ENABLED || longSeconds < LONG_WARM_S) { longState.key = null; longState.streak = 0; longState.result = null; return; }
        const r = estimateKeyLong();
        if (!r || r.rootIndex < 0 || !r.mode) { longState.key = null; longState.streak = 0; longState.result = null; return; } // AI-KEY-SCORING-A-01: chroma dài hạn chưa đủ thông tin => không tạo Key giả
        const k = `${r.rootIndex}-${r.mode}`;
        { let d = 0, na = 0, nb = 0; for (let i = 0; i < 12; i++) { d += chromaVectorShort[i] * chromaVectorLong[i]; na += chromaVectorShort[i] ** 2; nb += chromaVectorLong[i] ** 2; } longState.stationary = na > 0 && nb > 0 && d / Math.sqrt(na * nb) >= LONG_STATIONARY_COS; }
        longState.streak = (k === longState.key) ? longState.streak + 1 : 1;
        longState.key = k; longState.result = r;

        // Phát hiện chuyển điệu THẬT: năng lượng ngắn hạn nằm NGOÀI thang âm của Key dài hạn kéo dài (hợp âm đổi TRONG cùng giọng thì vẫn nằm trong thang).
        // Thang: trưởng = 7 nốt trưởng; thứ = 7 nốt thứ tự nhiên + âm dẫn (nốt 7 nâng, hoà âm thứ phổ biến).
        const scaleOffsets = r.mode === "Major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11];
        const inScale = new Array(12).fill(false);
        for (const o of scaleOffsets) inScale[(r.rootIndex + o) % 12] = true;
        let tot = 0, out = 0;
        for (let i = 0; i < 12; i++) { const e = chromaVectorShort[i] * chromaVectorShort[i]; tot += e; if (!inScale[i]) out += e; }
        // AI-FIX-06: chroma "loãng" (nhiễu/bộ gõ/giọng hát trải đều 12 nốt) LUÔN có ≥33–42% năng lượng nằm ngoài bất kỳ thang nào => điều kiện cũ
        // (≥25%) thoả liên tục, neo lại hàng trăm lần trên nhạc thật (log 15/10: 262 LONG_REANCHOR/292 s) và vô hiệu bộ nhớ dài hạn.
        // Chuyển điệu THẬT phải có 1 Key MỚI giải thích tốt đoạn ngắn (ngoài-thang của Key mới thấp) và Key cũ giải thích kém hơn rõ rệt.
        let ookOk = tot > 0 && out / tot >= OOK_RATIO;
        if (ookOk) {
            const ns = estimateKeyFromChroma(chromaVectorShort, { bassWeight: LONG_BASS_WEIGHT });
            const nk = ns && Number.isInteger(ns.rootIndex) ? outOfScaleRatio(ns.rootIndex, ns.mode, "short") : null;
            const sameSet = ns && (ns.rootIndex === r.rootIndex && ns.mode === r.mode);
            ookOk = !sameSet && nk !== null && nk <= OOK_NEWKEY_MAX_OUT && (out / tot) - nk >= OOK_EXPLAIN_GAP && (longSeconds - lastReanchorAtS) >= OOK_COOLDOWN_S;
        }
        ookStreak = ookOk ? ookStreak + 1 : 0;
        if (ookStreak >= OOK_TICKS) {
            lastReanchorAtS = longSeconds;
            // neo lại: bằng chứng dài hạn = đoạn ngắn hiện tại (khối lượng nhỏ để dữ liệu mới lấn át nhanh)
            let mag = Math.sqrt(chromaVectorShort.reduce((a, v) => a + v * v, 0)) || 1;
            for (let i = 0; i < 12; i++) { longSum[i] = (chromaVectorShort[i] / mag) * LONG_ANCHOR_MASS_S; chromaVectorLong[i] = longSum[i] / LONG_ANCHOR_MASS_S; }
            longMass = LONG_ANCHOR_MASS_S; ookStreak = 0;
            sendTelemetry({ event: "LONG_REANCHOR", from: `${NOTE_NAMES[r.rootIndex]} ${r.mode}`, longSeconds: +longSeconds.toFixed(1) });
            const r2 = estimateKeyLong(); longState.key = `${r2.rootIndex}-${r2.mode}`; longState.result = r2; longState.streak = 1;
        }
    }
    function longScoreOf(fullKey) {
        const r = longState.result; if (!r || !r.all) return null;
        const e = r.all.find((x) => `${x.root}-${x.mode}` === fullKey); return e ? e.score : null;
    }
    // Cho phép khoá candidate (Key đang xét, dạng "root-mode") không? lockedKey = Key đang khoá hoặc null.
    function longEvidenceAllows(candidateFullKey, lockedKey) {
        if (!LONG_EVIDENCE_ENABLED || longSeconds < LONG_WARM_S || !longState.key) return { ok: true, reason: "long-not-warm" };
        if (longState.key !== candidateFullKey) return { ok: false, reason: "long-disagrees" };
        if (!lockedKey && longSeconds < LONG_FIRST_LOCK_S && !(longState.stationary && longSeconds >= LONG_STATIONARY_MIN_S)) return { ok: false, reason: "long-first-lock-wait" }; // nhạc đang thay đổi hợp âm: chưa đủ để nói Key của cả đoạn
        if (lockedKey && lockedKey !== candidateFullKey) {
            // ĐỔI Key đã khoá: cần Key dài hạn dẫn đầu ổn định + hơn Key đang khoá đủ biên (chống dao động theo hợp âm)
            // Cặp relative (vd C Major <-> A Minor) có cùng bộ nốt: bằng chứng rất sát nhau nên cần biên + thời gian lớn hơn để không dao động.
            const isRel = (() => { const [ra, ma] = String(candidateFullKey).split("-"), [rb, mb] = String(lockedKey).split("-"); if (ma === mb) return false; const maj = ma === "Major" ? +ra : +rb, min = ma === "Major" ? +rb : +ra; return (maj + 9) % 12 === min; })();
            if (longState.streak < LONG_CHANGE_TICKS * (isRel ? LONG_REL_FACTOR : 1)) return { ok: false, reason: "long-streak" };
            const sNew = longScoreOf(candidateFullKey), sOld = longScoreOf(lockedKey);
            if (sNew !== null && sOld !== null && sNew - sOld < LONG_CHANGE_GAP * (isRel ? LONG_REL_FACTOR : 1)) return { ok: false, reason: "long-gap" };
        }
        return { ok: true, reason: "long-agrees" };
    }

    function formatElapsedSeconds(ms) {
        return (ms / 1000).toFixed(1);
    }

    function formatCandidate(candidate) {
        if (!candidate) return "?";
        return `${NOTE_NAMES[candidate.root]} ${candidate.mode} (${candidate.score.toFixed(2)})`;
    }

    function candidateLabel(candidate) {
        if (!candidate) return null;
        return `${NOTE_NAMES[candidate.root]} ${candidate.mode}`;
    }

    function sendTelemetry(record) {
        if (typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.sendTelemetry === "function") {
            window.electronAPI.sendTelemetry(record);
        }
    }

    function logMarginSnapshot(result, startedAt, bestCount, locked, stability, confidenceV2, top1StableMs, note) {
        const lines = [
            `[KeyEngine] Time: ${formatElapsedSeconds(Date.now() - startedAt)}s`,
            `  Top1: ${formatCandidate(result.top1)}`,
            `  Top2: ${formatCandidate(result.top2)}`,
            `  Margin: ${typeof result.margin === "number" ? result.margin.toFixed(2) : "?"}`,
            `  Stability: ${typeof stability === "number" ? stability.toFixed(2) : "?"}`,
            `  Top1 Stable: ${formatElapsedSeconds(top1StableMs)}s`,
            `  Confidence: ${result.confidence.toFixed(2)}`,
            `  DecisionScore: ${confidenceV2.combined.toFixed(2)}`,
            `  Key: ${result.key}`,
            `  Votes: ${bestCount}/${VOTE_MIN_AGREE}`,
            `  Locked: ${locked ? "Yes" : "No"}${note ? ` (${note})` : ""}`,
            `  ConfidenceV2: ${JSON.stringify(confidenceV2)}`
        ];
        console.log(lines.join("\n"));
    }

    function computeStability(bestCount, windowSize) {
        if (!windowSize) return 0;
        const agreement = bestCount / windowSize;
        return agreement * agreement;
    }

    function updateTop1StabilityTimer(top1) {
        if (!top1) return { stableMs: lastTop1ChangedAt === null ? 0 : Date.now() - lastTop1ChangedAt, changed: false, from: null, to: null }; // AI-KEY-SCORING-A-01: vector không đủ thông tin => không có top1, không đổi bộ đếm
        const currentKey = `${top1.root}-${top1.mode}`;
        const currentLabel = candidateLabel(top1);
        const now = Date.now();

        let changed = false;
        let previousLabel = null;

        if (currentKey !== lastTop1Key) {
            previousLabel = lastTop1Label;
            changed = lastTop1Key !== null;
            lastTop1Key = currentKey;
            lastTop1Label = currentLabel;
            lastTop1ChangedAt = now;
        }

        return { stableMs: now - lastTop1ChangedAt, changed, from: previousLabel, to: currentLabel };
    }

    function clamp01(x) {
        return Math.max(0, Math.min(1, x));
    }

    const PEARSON_NORM_MAX = 1 + BASS_ROOT_BOOST_WEIGHT; // CHỈ dùng ở chế độ cũ (legacy)
    const MARGIN_NORM_RANGE = 0.10 * MARGIN_SCALE; // A34 — đã hiệu chỉnh bằng dữ liệu thật (thang cũ); AI-KEY-SCORING-A-01: quy đổi sang thang Pearson

    // === TASK AI-KEY-SCORING-A-01 — 3 khái niệm TÁCH BẠCH (trước đây gộp vào 1 con số "confidence" > 1) ===
    //   (1) ĐIỂM ỨNG VIÊN  : top1.score = tương quan Pearson (KK+Temperley) + bass phụ (≤0.03) + modal phụ (≤0.02); r thuần ở result.correlation.
    //   (2) BIÊN           : margin = top1.score − top2.score (Key đứng đầu hơn Key sát nhất bao nhiêu).
    //   (3) CONFIDENCE     : result.confidence ∈ [0,1] = 0.5·fit + 0.5·separation (bằng chứng cho Key đứng đầu; đây là số gửi sang AIContext & hiển thị %).
    //   (4) DECISIONSCORE  : confidenceV2.combined ∈ [0,1] = trung bình (fit, separation, stability, modal) — số DUY NHẤT quyết định LOCK (ngưỡng ADAPTIVE_LOCK_CONFIDENCE).
    // Bass KHÔNG còn là thành phần của decisionScore (cũ: bassNorm = 20% điểm quyết định => nhạc bass nặng khoá theo gốc bass). bassNorm vẫn xuất ra để chẩn đoán.
    function buildConfidenceV2(result, stability) {
        if (PEARSON_ON) {
            const fit = result && result.valid !== false && typeof result.fit === "number" ? clamp01(result.fit) : 0;
            const sep = result && result.valid !== false && typeof result.separation === "number" ? clamp01(result.separation) : 0;
            const stabilityNorm = clamp01(stability);
            const bassNorm = clamp01(result && typeof result.bassAgreement === "number" ? result.bassAgreement : 0);
            const modalNorm = clamp01(result && result.modalEvidence ? result.modalEvidence.modalConfidence : 0);
            const combined = clamp01((fit + sep + stabilityNorm + modalNorm) / 4); // 4 thành phần HARMONIC-evidence, trọng số bằng nhau; KHÔNG có bass
            return { pearson: result ? result.correlation : 0, pearsonNorm: fit, margin: result ? result.margin : 0, marginNorm: sep, stability, stabilityNorm,
                bassAgreement: result ? result.bassAgreement : 0, bassNorm, modalNorm, combined, ambiguity: 1 - sep };
        }
        const pearson = result.confidence;
        const pearsonNorm = clamp01(pearson / PEARSON_NORM_MAX);

        const margin = result.margin;
        const marginNorm = clamp01(margin / MARGIN_NORM_RANGE);

        const stabilityNorm = clamp01(stability);

        const bassAgreement = result.bassAgreement;
        const bassNorm = clamp01(bassAgreement);

        // === A35 — Thêm bằng chứng Modal vào confidenceV2 ===
        const modalStrength = result.modalEvidence ? result.modalEvidence.modalConfidence : 0;
        const modalNorm = clamp01(modalStrength);

        // 5 thành phần: pearson, margin, stability, bass, modal — trọng số bằng nhau
        const combined = (pearsonNorm + marginNorm + stabilityNorm + bassNorm + modalNorm) / 5;

        const ambiguity = 1 - marginNorm;

        return { pearson, pearsonNorm, margin, marginNorm, stability, stabilityNorm, bassAgreement, bassNorm, modalNorm, combined, ambiguity };
    }

    function runVoteLoop(onWinner) {
        const voteWindow = [];
        const startedAt = Date.now();
        let highConfidenceStreak = 0;
        let marginHistory = []; // A35 — theo dõi margin trung bình để phát hiện modulation thật

        let fastPathStreak = 0;
        let fastPathStreakKey = null;
        let fastPathLastFiredKey = null;

        // TASK AI-KEY-FAST-06 — đếm vòng (idempotent: clearInterval gọi lặp vẫn vô hại như cũ; chỉ đếm 1 lần/vòng).
        let loopStopped = false;
        loopStats.started++; loopStats.active++; if (loopStats.active > loopStats.maxActive) loopStats.maxActive = loopStats.active;
        function stopBoth() {
            clearInterval(timer);
            clearInterval(fastTimer);
            if (!loopStopped) { loopStopped = true; loopStats.stopped++; loopStats.active--; }
        }

        let longLockFiredKey = null;
        const fastTimer = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            if (elapsed < FAST_PATH_MIN_ELAPSED_MS) return;

            // TASK AI-ALG-05 — cập nhật Key dài hạn; nếu nó dẫn đầu ổn định mà Key chưa khoá/khác Key đang khoá -> khoá theo bằng chứng dài hạn
            // (cần khi hợp âm đang chơi không bao giờ trùng Key của cả đoạn — nếu không sẽ không bao giờ khoá được).
            updateLongState();
            if (LONG_EVIDENCE_ENABLED && hasMusicalContent && longState.key && longState.streak >= LONG_LOCK_TICKS && longSeconds >= LONG_LOCK_MIN_S
                && longState.key !== lastLockedKey && longState.key !== longLockFiredKey && longState.result.confidence >= MIN_CONFIDENCE
                && longState.result.modalEvidence && longState.result.modalEvidence.modalConfidence >= LONG_LOCK_MIN_MODAL) {
                const gate = longEvidenceAllows(longState.key, lastLockedKey);
                if (gate.ok) {
                    const lr = longState.result;
                    longLockFiredKey = longState.key; fastPathLastFiredKey = longState.key; lastLockedKey = longState.key;
                    sendTelemetry({
                        event: "LOCK", time: parseFloat(formatElapsedSeconds(elapsed)), key: lr.key, decisionScore: lr.confidence, reason: "long-term",
                        longSeconds: +longSeconds.toFixed(1), margin: lr.margin, frame: frameCounter, framesToStable: frameCounter,
                        firstEvidenceAt, firstEvidenceFrame, firstProvisionalAt, firstProvisionalFrame
                    });
                    onWinner(lr, longState.streak, stopBoth);
                    return;
                }
            }

            const result = estimateKeyFromChroma(chromaVectorFast);

            if (!hasMusicalContent || result.confidence < MIN_CONFIDENCE) {
                fastPathStreak = 0;
                fastPathStreakKey = null;
                fastPathLastFiredKey = null;
                return;
            }

            const candidateKey = `${result.rootIndex}-${result.mode}`;

            // === A35 — Stability Check: candidate phải ổn định đủ tick ===
            const candidateStable = updateCandidateHistory(candidateKey);

            if (candidateKey === fastPathStreakKey) {
                fastPathStreak++;
            } else {
                fastPathStreakKey = candidateKey;
                fastPathStreak = 1;
            }

            if (fastPathStreak < FAST_PATH_STREAK_REQUIRED) return;

            const fastStability = computeStability(Math.min(fastPathStreak, FAST_PATH_STREAK_REQUIRED), FAST_PATH_STREAK_REQUIRED);
            const fastConfidenceV2 = buildConfidenceV2(result, fastStability);

            // === A35 + A34: confidenceV2.combined làm gate thật ===
            if (fastConfidenceV2.combined < FAST_PATH_MIN_CONFIDENCE) {
                return;
            }

            // === A35: Modulation Check trước khi khóa Key mới ===
            const avgMargin = marginHistory.length > 0 ? marginHistory.reduce((a, b) => a + b, 0) / marginHistory.length : 0.05 * MARGIN_SCALE;
            const currentFullKey = `${result.rootIndex}-${result.mode}`;
            const isNewKey = lastLockedKey !== currentFullKey;
            const modulationOk = !isNewKey || (candidateStable && isTrueModulation(lastLockedKey, currentFullKey, result.margin, avgMargin));

            if (!modulationOk) {
                return; // Coi là dao động, không đổi Key
            }

            // TASK AI-ALG-05 — cổng bằng chứng dài hạn: chỉ khoá khi Key dài hạn ĐỒNG THUẬN (+ hysteresis khi đổi Key đã khoá)
            if (!longEvidenceAllows(currentFullKey, lastLockedKey).ok) return;

            if (candidateKey === fastPathLastFiredKey) return;
            // AI-KEY-SCORING-A-01 (D): Key này ĐÃ được báo và vẫn là Key đang khoá => không báo lại. (fastPathLastFiredKey chỉ sống trong 1 vòng; renderer gọi lại
            // detectOnce() sau MỖI kết quả nên vòng mới luôn khởi tạo lại biến đó => trước đây cùng 1 Key bị báo lại sau ~1.6 s => ai-result lặp.) Key ĐỔI thật vẫn được báo.
            if (DEDUP_KEY_REPORT_ENABLED && lastLockedKey === currentFullKey) return;
            fastPathLastFiredKey = candidateKey;
            lastLockedKey = currentFullKey; // Cập nhật Key đã khóa

            logMarginSnapshot(result, startedAt, fastPathStreak, true, fastStability, fastConfidenceV2, fastPathStreak * FAST_PATH_INTERVAL_MS, "khoá qua đường: fast-path (A35+modal+stability)");

            sendTelemetry({
                event: "LOCK", time: parseFloat(formatElapsedSeconds(elapsed)), key: result.key,
                decisionScore: fastConfidenceV2.combined, reason: "fast-path-A35",
                frame: frameCounter, framesToStable: frameCounter,
                firstEvidenceAt, firstEvidenceFrame, firstProvisionalAt, firstProvisionalFrame
            });
            onWinner(result, fastPathStreak, stopBoth);
        }, FAST_PATH_INTERVAL_MS);

        const timer = setInterval(() => {
            const result = estimateKeyFromChroma();

            const top1Update = updateTop1StabilityTimer(result.top1);
            const top1StableMs = top1Update.stableMs;
            const elapsedSec = parseFloat(formatElapsedSeconds(Date.now() - startedAt));

            if (top1Update.changed) {
                sendTelemetry({ event: "TOP1_CHANGED", from: top1Update.from, to: top1Update.to, time: elapsedSec });
            }

            if (result.confidence < MIN_CONFIDENCE) {
                const cv2Rejected = buildConfidenceV2(result, 0);
                logMarginSnapshot(result, startedAt, 0, false, 0, cv2Rejected, top1StableMs, "dưới MIN_CONFIDENCE");
                sendTelemetry({
                    time: elapsedSec, top1: candidateLabel(result.top1), top2: candidateLabel(result.top2),
                    confidence: result.confidence, margin: result.margin, stability: 0,
                    top1Stable: top1StableMs / 1000, decisionScore: cv2Rejected.combined,
                    votes: 0, window: voteWindow.length, locked: false
                });
                highConfidenceStreak = 0;
                return;
            }

            // TASK A40 — sửa lỗi tự-bão-hoà của A37: trước bản vá này, marginHistory nhận margin của
            // MỌI tick vô điều kiện, kể cả các tick đã thuộc về candidate MỚI (đang chờ xác nhận
            // modulation). Một khi modulation thật xảy ra và margin mới ổn định đủ lâu, avgMarginHistory
            // hội tụ về CHÍNH margin mới đó, khiến `newMargin > avgMarginHistory × GAIN` KHÔNG BAO GIỜ
            // đúng nữa (đã chứng minh bằng đại số ở A37) — modulation thật SAU KHI đã có 1 lần khoá
            // trước đó sẽ không bao giờ được xác nhận. Sửa: chỉ tích luỹ marginHistory khi tick НÀY
            // còn khớp với Key ĐANG khoá (`lastLockedKey`) — tức đây vẫn là baseline của Key CŨ, chưa
            // bị "ô nhiễm" bởi margin của candidate mới. Ngay khi 1 tick cho ra candidate KHÁC
            // lastLockedKey (bắt đầu nghi ngờ có modulation), việc tích luỹ TẠM DỪNG — giữ nguyên
            // baseline cũ để so sánh công bằng — cho tới khi modulation được XÁC NHẬN THẬT (lastLockedKey
            // cập nhật), lúc đó vòng tích luỹ mới bắt đầu lại cho Key mới.
            const tickFullKey = `${result.rootIndex}-${result.mode}`;
            if (lastLockedKey === null || tickFullKey === lastLockedKey) {
                marginHistory.push(result.margin);
                if (marginHistory.length > 10) marginHistory.shift();
            }

            voteWindow.push({ key: `${result.rootIndex}-${result.mode}`, result });
            if (voteWindow.length > VOTE_WINDOW) voteWindow.shift();

            const counts = {};
            let bestKey = null, bestCount = 0, bestResult = null;
            voteWindow.forEach((v) => {
                counts[v.key] = (counts[v.key] || 0) + 1;
                if (counts[v.key] > bestCount) { bestCount = counts[v.key]; bestKey = v.key; bestResult = v.result; }
            });

            const stability = computeStability(bestCount, voteWindow.length);
            const elapsed = Date.now() - startedAt;
            const confidenceV2 = buildConfidenceV2(result, stability);

            // === TASK A40 — sàn marginNorm cho vote-window ===
            // A37 từng chứng minh: gắn thẳng ngưỡng marginNorm (ý tưởng gốc từ patch A35 bị reject,
            // keyEngine.js.rej) vào đây KHÔNG đủ, vì lúc đó marginNorm bị THỔI PHỒNG giả bởi chính lỗi
            // computeModalEvidence() (A38) — power chord A# đo được marginNorm=0.741, vượt xa 0.30.
            // Sau khi MODAL_EVIDENCE_FLOOR (phía trên) sửa gốc rễ, đã ĐO LẠI THẬT trên ĐỦ 12 root
            // (không chỉ A#, đúng tinh thần A39): margin dư của power chord (root+fifth, không quãng 3,
            // modal evidence đã trung hoà) dao động 0.0020–0.0568 tuỳ root (root D/F cao nhất ~0.057) —
            // 0.30 KHÔNG đủ cao để chặn các root này (C đo được marginNorm=0.32, D/F ~0.57, vẫn vượt
            // 0.30 và khoá sai). Trong khi đó margin của Major/Minor THẬT (đủ 12 root) không bao giờ
            // thấp hơn 0.1654 (marginNorm=1.0, bị clamp). Ngưỡng 0.90 (marginNorm, tương đương margin
            // thô ~0.09) nằm giữa 2 vùng này: cách trần power-chord cao nhất (~0.057) ~1.6 lần, cách sàn
            // Major/Minor thật thấp nhất (~0.165) ~1.8 lần — biên độ an toàn cân bằng ở cả 2 phía, dựa
            // trên dữ liệu đo thật trên toàn bộ 12 root, không phải suy đoán từ 1 root duy nhất.
            const VOTE_WINDOW_MIN_MARGIN_NORM = 0.90;
            const willLockByVote = bestCount >= VOTE_MIN_AGREE && elapsed >= MIN_ELAPSED_BEFORE_LOCK_MS && confidenceV2.marginNorm >= VOTE_WINDOW_MIN_MARGIN_NORM;

            if (bestCount >= VOTE_MIN_AGREE && confidenceV2.combined >= ADAPTIVE_LOCK_CONFIDENCE) {
                highConfidenceStreak++;
            } else {
                highConfidenceStreak = 0;
            }
            const willLockByAdaptive = elapsed >= FAST_LOCK_MIN_ELAPSED_MS && highConfidenceStreak >= ADAPTIVE_LOCK_STREAK_REQUIRED;

            // === A35 — Modulation Check cho đường chậm ===
            const avgMargin = marginHistory.reduce((a, b) => a + b, 0) / marginHistory.length;
            const isNewKey = lastLockedKey !== bestKey;
            const modulationOk = !isNewKey || isTrueModulation(lastLockedKey, bestKey, result.margin, avgMargin);

            // TASK AI-ALG-05 — cùng cổng bằng chứng dài hạn cho đường chậm
            const longGate = longEvidenceAllows(bestKey, lastLockedKey);
            const alreadyReported = DEDUP_KEY_REPORT_ENABLED && lastLockedKey === bestKey; // AI-KEY-SCORING-A-01 (D): không báo lại Key đang khoá
            const willLock = (willLockByVote || willLockByAdaptive) && modulationOk && longGate.ok && !alreadyReported;
            const lockReason = !modulationOk ? "delay-stability" : !longGate.ok ? "long-evidence" : alreadyReported ? "already-reported" : willLockByAdaptive && !willLockByVote ? "adaptive" : "vote-window";

            if (willLock && modulationOk) {
                lastLockedKey = bestKey;
            }

            logMarginSnapshot(result, startedAt, bestCount, willLock, stability, confidenceV2, top1StableMs, willLock ? `khoá qua đường: ${lockReason}` : undefined);

            sendTelemetry({
                time: elapsedSec, top1: candidateLabel(result.top1), top2: candidateLabel(result.top2),
                confidence: result.confidence, margin: result.margin, stability,
                top1Stable: top1StableMs / 1000, decisionScore: confidenceV2.combined,
                votes: bestCount, window: voteWindow.length, locked: willLock, highConfidenceStreak
            });

            if (willLock) {
                sendTelemetry({
                    event: "LOCK", time: elapsedSec, key: bestResult.key, decisionScore: confidenceV2.combined, reason: lockReason,
                    frame: frameCounter, framesToStable: frameCounter,
                    firstEvidenceAt, firstEvidenceFrame, firstProvisionalAt, firstProvisionalFrame
                });
                onWinner(bestResult, bestCount, stopBoth);
            }
        }, CHECK_INTERVAL_MS);

        return stopBoth;
    }

    function detectOnce(onStable) {
        return runVoteLoop((result, count, stop) => {
            stop();
            onStable(result);
        });
    }

    function watchContinuous(onStableChange) {
        let lastReportedKey = null;
        return runVoteLoop((result) => {
            const key = `${result.rootIndex}-${result.mode}`;
            if (key === lastReportedKey) return;
            lastReportedKey = key;
            onStableChange(result);
        });
    }

    function loop() {
        if (!running) return;
        updateChromaVector();
        rafId = requestAnimationFrame(loop);
    }

    function startProvisionalTicker() {
        stopProvisionalTicker();
        provisionalTimerId = setInterval(() => {
            const result = estimateKeyFromChroma(chromaVectorFast);
            if (result.confidence < MIN_CONFIDENCE) return;
            if (firstProvisionalAt === null) {
                firstProvisionalAt = Date.now();
                firstProvisionalFrame = frameCounter;
                sendTelemetry({ event: "FIRST_PROVISIONAL", frame: firstProvisionalFrame, key: result.key, confidence: result.confidence });
            }
            provisionalListeners.forEach((cb) => cb({ key: result.key, confidence: result.confidence }));
        }, PROVISIONAL_INTERVAL_MS);
    }

    function stopProvisionalTicker() {
        if (provisionalTimerId) {
            clearInterval(provisionalTimerId);
            provisionalTimerId = null;
        }
    }

    function onProvisionalEstimate(cb) { provisionalListeners.push(cb); }

    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        stopProvisionalTicker();
    }

    function onLevel(cb) { levelListeners.push(cb); }

    // TASK AI-KEY-ENGINE-COMPLETE-01 — trạng thái đường vào (CHỈ chẩn đoán, không tham gia quyết định Key). NO_DEVICE do audioSource/renderer báo (KeyEngine không biết thiết bị).
    //   NO_SIGNAL: chưa có khung / toàn -Infinity / dưới sàn tuyệt đối  | SIGNAL_NO_MUSIC: có tín hiệu nhưng chưa đủ bằng chứng hòa âm
    //   MUSIC_EVIDENCE: có bằng chứng âm nhạc, chưa khoá Tone         | LOCKED: đã khoá Tone (đang theo dõi chuyển Tone)
    function getInputState() {
        if (!running && inputProbe.frames === 0) return "NO_SIGNAL";
        if (lastLockedKey !== null) return "LOCKED";
        if (hasMusicalContent) return "MUSIC_EVIDENCE";
        const rmsOk = inputProbe.lastLevelDb !== null ? Math.pow(10, inputProbe.lastLevelDb / 20) > CONTENT_ABS_FLOOR_RMS : inputProbe.lastContentRms > CONTENT_ABS_FLOOR_RMS;
        return (inputProbe.frames > 0 && inputProbe.finiteBins > 0 && rmsOk) ? "SIGNAL_NO_MUSIC" : "NO_SIGNAL";
    }

    function getDebugSnapshot() {
        return {
            chromaVector: chromaVector.slice(), chromaVectorFast: chromaVectorFast.slice(), chromaVectorLong: chromaVectorLong.slice(), longSeconds, longKey: longState.key, longStreak: longState.streak, bassRootVotes: bassRootVotes.slice(), tuningCents,
            frameCounter, hasMusicalContent, contentEnergyEMA, inputState: getInputState(), inputProbe: { ...inputProbe }, loopStats: { ...loopStats },
            firstEvidenceAt, firstEvidenceFrame, firstProvisionalAt, firstProvisionalFrame
        };
    }

    return {
        init, stop, detectOnce, watchContinuous, estimateKeyFromChroma, estimateKeyLong, estimateKeyMid, outOfScaleRatio,
        shortestSemitoneDelta, onLevel, onProvisionalEstimate, NOTE_NAMES, MIN_CONFIDENCE, getDebugSnapshot, getInputState,
    };
})();

window.KeyEngine = KeyEngine;