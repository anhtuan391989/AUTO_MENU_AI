/**
 * AI-ALG-04 (D9) — sendToneStep(): MIDI lỗi giữa chừng KHÔNG được làm dịch tone dư khi fallback chuột.
 * Mô hình tone có trạng thái: tone.offset = tổng số bước thật sự "tới plugin giả". Kiểm tra TỔNG DỊCH THỰC TẾ, không chỉ payload.
 * Chạy: node tests/unit/ToneStepA04.verify.js   (AUTOMENU_ROOT=<thư mục khác> để chạy trên bản code cũ lấy số liệu "trước sửa")
 * Kiểm thử PHẦN MỀM với MIDI/chuột giả — KHÔNG phải phần cứng Windows/Auto-Tune.
 */
"use strict";
const { loadRouter, POINTS } = require("../helpers/toneRig");
let fail = 0; const rows = [];
function check(c, m) { if (c) console.log("  ✅ " + m); else { fail++; console.log("  ❌ " + m); } }
function row(name, req, tone, res) { rows.push(`${name} | yêu cầu ${req} | tone thật dịch ${tone.offset} (MIDI ${tone.midi}, chuột ${tone.clicks}) | ok=${res.ok}`); }

(async () => {
    console.log("1. MIDI gửi đủ 3 bước");
    { const r = loadRouter(); const res = await r.sendToneStep(3); row("1", 3, r.tone, res);
      check(r.tone.offset === 3 && res.ok === true && res.driverUsed === "midi", "tone +3, ok, driver=midi");
      check(res.stepsSent === undefined || res.stepsSent === 3, "stepsSent=3 (nếu có báo)"); }

    console.log("2. MIDI lỗi ngay bước đầu, có fallback chuột");
    { const r = loadRouter({ midiMode: () => "fail", point: POINTS }); const res = await r.sendToneStep(3); row("2", 3, r.tone, res);
      check(r.tone.offset === 3 && r.tone.clicks === 3 && res.ok === true, "chuột gửi đủ 3 (chưa có bước nào gửi trước) → tone +3"); }

    console.log("3. MIDI lỗi sau 1 bước, có fallback chuột  (= P6 của ModPipelineA03)");
    { const r = loadRouter({ midiMode: (i) => (i < 1 ? "ok" : "fail"), point: POINTS }); const res = await r.sendToneStep(3); row("3", 3, r.tone, res);
      check(r.tone.offset === 3, `tone thật = +3 (thực tế ${r.tone.offset}) — KHÔNG dịch dư`);
      check(r.tone.midi + r.tone.clicks === 3, `tổng bước đã gửi = 3 (thực tế ${r.tone.midi + r.tone.clicks})`);
      check(res.ok === true, "ok=true vì đủ 3 bước tới nơi"); }

    console.log("4. MIDI lỗi sau 2 bước, có fallback chuột");
    { const r = loadRouter({ midiMode: (i) => (i < 2 ? "ok" : "fail"), point: POINTS }); const res = await r.sendToneStep(3); row("4", 3, r.tone, res);
      check(r.tone.offset === 3 && r.tone.midi + r.tone.clicks === 3, `tone thật = +3, tổng bước 3 (thực tế ${r.tone.offset}/${r.tone.midi + r.tone.clicks})`); }

    console.log("4b. Hướng âm: MIDI lỗi sau 1 bước (-3)");
    { const r = loadRouter({ midiMode: (i) => (i < 1 ? "ok" : "fail"), point: POINTS }); const res = await r.sendToneStep(-3); row("4b", -3, r.tone, res);
      check(r.tone.offset === -3, `tone thật = -3 (thực tế ${r.tone.offset})`); }

    console.log("5a. MIDI: bước thứ 3 ném lỗi (không rõ đã gửi hay chưa) → KHÔNG được fallback, báo không chắc chắn");
    { const r = loadRouter({ midiMode: (i) => (i < 2 ? "ok" : "throw"), point: POINTS }); const res = await r.sendToneStep(3); row("5a", 3, r.tone, res);
      check(r.tone.clicks === 0, "không click chuột (tránh dịch dư)");
      check(res.ok === false, "ok=false (không tuyên bố thành công)");
      check(res.uncertain === true || res.status === "TONE_STATE_UNCERTAIN", "đánh dấu trạng thái tone KHÔNG CHẮC CHẮN"); }

    console.log("5b. MIDI gửi xong cả 3 bước rồi lỗi ở giai đoạn phản hồi (bước 3 đã tới plugin rồi mới ném)");
    { const r = loadRouter({ midiMode: (i) => (i < 2 ? "ok" : "sent-then-throw"), point: POINTS }); const res = await r.sendToneStep(3); row("5b", 3, r.tone, res);
      check(r.tone.offset === 3 && r.tone.clicks === 0, `tone thật +3 và KHÔNG click thêm (thực tế ${r.tone.offset}, click ${r.tone.clicks})`);
      check(res.ok === false || res.uncertain === true, "không báo 'đã chắc chắn' khi phản hồi lỗi"); }

    console.log("6a. Fallback chuột THÀNH CÔNG sau lỗi MIDI giữa chừng → đã kiểm ở 3/4");
    console.log("6b. Fallback chuột THẤT BẠI giữa chừng (MIDI gửi 1, chuột gửi 1 rồi lỗi)");
    { const r = loadRouter({ midiMode: (i) => (i < 1 ? "ok" : "fail"), point: POINTS, clickMode: (j) => (j < 1 ? "ok" : "fail") }); const res = await r.sendToneStep(3); row("6b", 3, r.tone, res);
      check(res.ok === false, "ok=false");
      check(r.tone.offset === 2, `tone thật = +2 (1 MIDI + 1 chuột), không click lại (thực tế ${r.tone.offset})`);
      check(res.stepsSent === undefined || res.stepsSent === 2, "báo đúng số bước đã gửi = 2 (nếu có báo)"); }

    console.log("6c. Chuột ném lỗi (ngoại lệ) giữa chừng");
    { const r = loadRouter({ port: "", point: POINTS, clickMode: (j) => (j < 1 ? "ok" : "throw") }); let res, threw = false;
      try { res = await r.sendToneStep(2); } catch (e) { threw = true; }
      row("6c", 2, r.tone, res || { ok: "THROW" });
      check(!threw, "sendToneStep không ném ngoại lệ ra ngoài (trả kết quả rõ ràng)");
      check(res && res.ok === false, "ok=false"); }

    console.log("7. Không có fallback (MIDI lỗi sau 1 bước, không có tọa độ chuột)");
    { const r = loadRouter({ midiMode: (i) => (i < 1 ? "ok" : "fail") }); const res = await r.sendToneStep(3); row("7", 3, r.tone, res);
      check(res.ok === false && r.tone.offset === 1, `ok=false, tone thật +1 (thực tế ${r.tone.offset})`);
      check(res.stepsSent === undefined || res.stepsSent === 1, "báo stepsSent=1 (nếu có báo)"); }

    console.log("7b. Mouse Control TẮT sau khi MIDI đã gửi 1 bước → không click");
    { const r = loadRouter({ midiMode: (i) => (i < 1 ? "ok" : "fail"), point: POINTS, mouseAllowed: false }); const res = await r.sendToneStep(3); row("7b", 3, r.tone, res);
      check(res.ok === false && r.tone.clicks === 0 && r.tone.offset === 1, "ok=false, không click, tone +1"); }

    console.log("8. Không có bước nào bị lặp ngoài dự kiến (quét mọi điểm lỗi MIDI 0..3, hai hướng, có/không fallback)");
    { let bad = 0, total = 0;
      for (const dir of [1, -1]) for (let failAt = 0; failAt <= 3; failAt++) for (const fb of [true, false]) {
          const r = loadRouter({ midiMode: (i) => (i < failAt ? "ok" : "fail"), point: fb ? POINTS : undefined });
          const res = await r.sendToneStep(3 * dir); total++;
          const delivered = Math.abs(r.tone.offset);
          if (delivered > 3 || (fb && delivered !== 3) || (!fb && failAt < 3 && delivered !== failAt)) { bad++; console.log(`    ✗ dir=${dir} failAt=${failAt} fb=${fb} → tone ${r.tone.offset}`); }
      }
      check(bad === 0, `${total - bad}/${total} tổ hợp không dịch dư/thiếu`); }

    console.log("\nBẢNG (tone thật dịch bao nhiêu):"); rows.forEach((x) => console.log("  " + x));
    console.log(fail === 0 ? "\nPASS ToneStepA04" : `\nFAIL ToneStepA04 (${fail} lỗi)`);
    process.exit(fail === 0 ? 0 : 1);
})();
