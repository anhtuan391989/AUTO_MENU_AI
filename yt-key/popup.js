/* ============================================================
   popup.js — YT-Key v2.0
   Tự động lấy tên bài hát + tổng thời lượng từ trang YouTube
   đang mở, KHÔNG cần nhập tay.
   - Cách 1 (mặc định): đọc trực tiếp từ trang YouTube (ytInitialPlayerResponse) → không cần API key
   - Cách 2 (tùy chọn): nếu đặt BACKEND_URL, gọi backend Shazam để lấy tên bài thật
   ============================================================ */

const SERVER = "https://menu-key-server.matuotluuly.workers.dev";

// ── TÙY CHỌN: Backend Shazam (tùy chọn) ──────────────────────
// Để trống "" = chỉ dùng tiêu đề YouTube (đủ cho hầu hết trường hợp).
// Điền URL backend (vd: http://IP-server:8000) = dùng Shazam nhận dạng tên bài thật.
const BACKEND_URL = "";
// ─────────────────────────────────────────────────────────────

function layId(link) {
  const kq = link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return kq ? kq[1] : null;
}

function hienThongBao(noiDung, coLoi) {
  const div = document.getElementById("kq");
  div.style.display = "block";
  div.className = coLoi ? "loi" : "thanhcong";
  div.innerText = noiDung;
}

function hienThongBaoAuto(noiDung, ok) {
  const div = document.getElementById("thongBaoAuto");
  div.innerText = noiDung;
  div.className = "thongbao-auto " + (ok ? "auto-ok" : "auto-sai");
}

/* ── Hàm chạy trong NGỮ CẢNH TRANG YouTube (world MAIN) ──
   Đọc ytInitialPlayerResponse chứa title + lengthSeconds chính xác. */
function trichXuTuTrang() {
  function parseDuration(text) {
    if (!text) return 0;
    const parts = text.trim().split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }
  try {
    const pr = window.ytInitialPlayerResponse;
    if (pr && pr.videoDetails && pr.videoDetails.title) {
      return {
        ok: true,
        title: pr.videoDetails.title,
        durationSec: parseInt(pr.videoDetails.lengthSeconds) || 0,
        author: pr.videoDetails.author || "",
        videoId: pr.videoDetails.videoId || "",
        source: "ytInitialPlayerResponse"
      };
    }
  } catch (e) {}
  // Fallback: đọc từ DOM
  try {
    const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string");
    const durEl = document.querySelector("span.ytp-time-duration");
    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(/ - YouTube$/, "");
    const durSec = parseDuration(durEl ? durEl.textContent : "");
    if (title || durSec) {
      return { ok: true, title: title, durationSec: durSec, author: "", videoId: "", source: "DOM" };
    }
  } catch (e) {}
  return { ok: false, error: "Chưa load xong video" };
}

/* ── Lấy thông tin từ tab YouTube đang mở (thử lại nhiều lần) ── */
async function layThongTinTuYouTube(soLanThu = 3) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
    return { ok: false, error: "Hãy mở trang video YouTube (youtube.com/watch?v=...)" };
  }
  for (let i = 0; i < soLanThu; i++) {
    try {
      const [ketQua] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: trichXuTuTrang
      });
      const data = ketQua.result;
      if (data && data.ok && data.title && data.durationSec > 0) {
        return { ok: true, data: data, tab: tab };
      }
      if (i < soLanThu - 1) await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      return { ok: false, error: "Lỗi đọc trang: " + e.message };
    }
  }
  return { ok: false, error: "Video chưa load xong, hãy bấm 🔄 để lấy lại" };
}

/* ── Tự động điền vào form ── */
async function tuDongDien() {
  const inputTen = document.getElementById("tenBai");
  const inputDur = document.getElementById("tongThoiLuong");
  hienThongBaoAuto("⏳ Đang lấy thông tin từ YouTube...", true);

  const kq = await layThongTinTuYouTube();
  if (!kq.ok) {
    hienThongBaoAuto("⚠️ " + kq.error, false);
    return;
  }
  const d = kq.data;

  // Nếu có backend Shazam → thử lấy tên bài thật (không chặn, nếu lỗi thì dùng title YouTube)
  let tenHienThi = d.title;
  let nguon = d.source;
  if (BACKEND_URL) {
    try {
      const videoId = d.videoId || layId(kq.tab.url);
      if (videoId) {
        const resp = await fetch(`${BACKEND_URL}/api/info?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + videoId)}&identify=true&start=5`, { signal: AbortSignal.timeout(20000) });
        if (resp.ok) {
          const bd = await resp.json();
          if (bd.song && bd.song.found && bd.song.title) {
            tenHienThi = `${bd.song.title} — ${bd.song.artist || ""}`.trim();
            nguon = "shazam";
          }
        }
      }
    } catch (e) { /* bỏ qua, dùng title YouTube */ }
  }

  inputTen.value = tenHienThi;
  inputDur.value = d.durationSec;
  inputTen.classList.add("tu-dong");
  inputDur.classList.add("tu-dong");

  const durMin = Math.floor(d.durationSec / 60);
  const durSec = d.durationSec % 60;
  hienThongBaoAuto(
    `✅ Tự điền xong (nguồn: ${nguon === "shazam" ? "Shazam" : "YouTube"})\n` +
    `⏱ Thời lượng: ${durMin}:${String(durSec).padStart(2, "0")} (${d.durationSec}s)`,
    true
  );
}

/* ── Lưu thông tin chung bài hát ── */
document.getElementById("btnLuuThongTin").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = layId(tab.url);
  if (!id) return hienThongBao("❌ Chưa mở YouTube!", true);
  const res = await fetch(`${SERVER}/set-song-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      songId: id,
      title: document.getElementById("tenBai").value.trim() || null,
      totalDurationSec: parseInt(document.getElementById("tongThoiLuong").value) || null
    })
  });
  const data = await res.json();
  hienThongBao(data.ok ? "✅ Đã lưu thông tin bài hát!" : `❌ Lỗi: ${data.error}`, data.ok ? false : true);
};

/* ── Thêm đoạn khóa ── */
document.getElementById("btnThemDoan").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = layId(tab.url);
  if (!id) return hienThongBao("❌ Chưa mở YouTube!", true);
  const start = parseInt(document.getElementById("batDau").value);
  const end = parseInt(document.getElementById("ketThuc").value);
  const khoa = document.getElementById("khoa").value.trim();
  const cheDo = document.getElementById("cheDo").value;
  if (!khoa) return hienThongBao("❌ Chưa nhập khóa!", true);
  if (isNaN(start) || isNaN(end) || start >= end) return hienThongBao("❌ Giây kết thúc phải lớn hơn bắt đầu!", true);
  const res = await fetch(`${SERVER}/add-segment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ songId: id, startSec: start, endSec: end, key: khoa, mode: cheDo, weight: 1.0 })
  });
  const data = await res.json();
  if (data.ok) {
    hienThongBao(`✅ Đã lưu!\n${start} → ${end} giây\nKhóa: ${khoa} ${cheDo === "major" ? "Trưởng" : "Phụ"}`, false);
    document.getElementById("batDau").value = end + 1;
    document.getElementById("ketThuc").value = "";
    document.getElementById("khoa").value = "";
    document.getElementById("khoa").focus();
  } else {
    hienThongBao(`❌ Lỗi: ${data.error}`, true);
  }
};

/* ── Nút lấy lại thủ công ── */
document.getElementById("btnTuLay").onclick = tuDongDien;

/* ── Tự động điền ngay khi mở popup ── */
document.addEventListener("DOMContentLoaded", tuDongDien);
