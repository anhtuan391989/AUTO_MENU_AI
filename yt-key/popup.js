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

/* ── A83: gọi server, tự kèm mật khẩu quản trị nếu có; bài đã biết mà thiếu/sai mật khẩu thì hiện ô nhập ── */
async function docMatKhau() {
  try { const o = await chrome.storage.session.get("matKhauAdmin"); return o.matKhauAdmin || ""; } catch (e) { return ""; }
}
// Ô mật khẩu tạo bằng JS (KHÔNG sửa popup.html), chỉ hiện khi server báo bài đã biết.
function hienOMatKhau() {
  let khoi = document.getElementById("khoiMatKhau");
  if (!khoi) {
    khoi = document.createElement("div");
    khoi.className = "khoi";
    khoi.id = "khoiMatKhau";
    khoi.innerHTML = '<h4>🔒 Bài này đã có trên server</h4><label>Mật khẩu quản trị (ADMIN_TOKEN):</label>'
      + '<input type="password" id="matKhauAdmin" placeholder="Nhập rồi bấm lưu lại" autocomplete="off">'
      + '<div class="nho">Bài mới thì lưu luôn, không cần mật khẩu. Mật khẩu chỉ nhớ đến khi đóng trình duyệt.</div>';
    const kq = document.getElementById("kq");
    kq.parentNode.insertBefore(khoi, kq);
  }
  khoi.style.display = "block";
}
async function guiServer(duongDan, body) {
  const inputMk = document.getElementById("matKhauAdmin");
  const mk = (inputMk && inputMk.value.trim()) || await docMatKhau();
  const headers = { "Content-Type": "application/json" };
  if (mk) headers["Authorization"] = "Bearer " + mk;
  const res = await fetch(`${SERVER}${duongDan}`, { method: "POST", headers, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch (e) { data = { error: "Server trả dữ liệu lạ (HTTP " + res.status + ")" }; }
  if (mk && res.ok && data.ok) { try { await chrome.storage.session.set({ matKhauAdmin: mk }); } catch (e) {} }
  if (res.status === 401 || res.status === 403) {
    hienOMatKhau();
    if (data.error === "can_mat_khau_admin") data.error = "Bài này đã có trên server — nhập mật khẩu quản trị ở khung bên dưới rồi bấm lưu lại.";
    else if (data.error === "sai_mat_khau") data.error = "Sai mật khẩu quản trị.";
    else if (data.error === "chua_cai_ADMIN_TOKEN") data.error = "Server chưa cài mật khẩu quản trị (ADMIN_TOKEN) nên không sửa được bài đã có.";
  }
  return data;
}

/* ── YT-KEY-NODUP-01: KHÔNG cho thêm bài hát trùng (bài đã có đoạn Key trên server) ──
   Hỏi server (/song-full) xem songId đã có đoạn Key chưa. Bài MỚI do chính popup này vừa tạo (trong 30 phút, cùng cửa sổ server dùng)
   vẫn nhập tiếp được các đoạn sau. Bài đã có từ trước -> chặn, hiện thông báo, khoá 2 nút lưu. Không đổi HTML. Lỗi mạng -> không chặn (server vẫn tự kiểm). */
const CUA_SO_BAI_VUA_THEM_MS = 30 * 60 * 1000;
async function docBaiVuaThem() {
  try { const o = await chrome.storage.session.get("baiVuaThem"); return o.baiVuaThem || {}; } catch (e) { return {}; }
}
async function ghiNhoBaiVuaThem(songId) {
  try {
    const m = await docBaiVuaThem();
    m[songId] = Date.now();
    await chrome.storage.session.set({ baiVuaThem: m });
  } catch (e) {}
}
async function baiDaCoTrenServer(songId) {
  if (!songId) return false;
  const m = await docBaiVuaThem();
  if (m[songId] && (Date.now() - m[songId]) < CUA_SO_BAI_VUA_THEM_MS) return false; // bài mới vừa nhập, đang nhập tiếp các đoạn
  try {
    const res = await fetch(`${SERVER}/song-full?id=${encodeURIComponent(songId)}`);
    if (!res.ok) return false;
    const d = await res.json();
    return !!(d && d.tongDoan > 0);
  } catch (e) { return false; }
}
const THONG_BAO_TRUNG = "⛔ Bài này ĐÃ CÓ trên server — không cho thêm bài trùng.";
function khoaNutLuu(khoa) {
  ["btnLuuThongTin", "btnThemDoan"].forEach((id) => { const b = document.getElementById(id); if (b) b.disabled = !!khoa; });
}
async function kiemTraBaiTrung() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const id = tab && tab.url ? layId(tab.url) : null;
    if (!id) return false;
    const trung = await baiDaCoTrenServer(id);
    khoaNutLuu(trung);
    if (trung) hienThongBao(THONG_BAO_TRUNG, true);
    return trung;
  } catch (e) { return false; }
}

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
   FIX: YouTube là SPA — window.ytInitialPlayerResponse chỉ đúng với video MỞ ĐẦU TIÊN,
   chuyển bài xong nó vẫn giữ dữ liệu bài cũ. Nên ưu tiên đọc từ player hiện tại
   (movie_player.getPlayerResponse) và luôn đối chiếu videoId với URL (idMong). */
function trichXuTuTrang(idMong) {
  function parseDuration(text) {
    if (!text) return 0;
    const parts = text.trim().split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }
  function khop(id) { return !idMong || !id || id === idMong; }
  const player = document.getElementById("movie_player");
  const video = document.querySelector("video.html5-main-video, video");

  // Cách 1: player hiện tại (luôn đúng bài đang phát)
  try {
    const pr = player && player.getPlayerResponse && player.getPlayerResponse();
    if (pr && pr.videoDetails && pr.videoDetails.title && khop(pr.videoDetails.videoId)) {
      return {
        ok: true,
        title: pr.videoDetails.title,
        durationSec: parseInt(pr.videoDetails.lengthSeconds) || Math.round((video && video.duration) || 0),
        author: pr.videoDetails.author || "",
        videoId: pr.videoDetails.videoId || idMong || "",
        source: "player"
      };
    }
  } catch (e) {}

  // Cách 2: getVideoData + getDuration của player
  try {
    const vd = player && player.getVideoData && player.getVideoData();
    if (vd && vd.title && khop(vd.video_id)) {
      const dur = Math.round((player.getDuration && player.getDuration()) || (video && video.duration) || 0);
      if (dur > 0) {
        return { ok: true, title: vd.title, durationSec: dur, author: vd.author || "", videoId: vd.video_id || idMong || "", source: "player" };
      }
    }
  } catch (e) {}

  // Cách 3: ytInitialPlayerResponse — CHỈ nhận nếu đúng video đang xem
  try {
    const pr = window.ytInitialPlayerResponse;
    if (pr && pr.videoDetails && pr.videoDetails.title && idMong && pr.videoDetails.videoId === idMong) {
      return {
        ok: true,
        title: pr.videoDetails.title,
        durationSec: parseInt(pr.videoDetails.lengthSeconds) || 0,
        author: pr.videoDetails.author || "",
        videoId: pr.videoDetails.videoId,
        source: "ytInitialPlayerResponse"
      };
    }
  } catch (e) {}

  // Cách 4 (dự phòng): đọc từ DOM
  try {
    const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string");
    const durEl = document.querySelector("span.ytp-time-duration");
    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(/ - YouTube$/, "");
    const durSec = parseDuration(durEl ? durEl.textContent : "") || Math.round((video && video.duration) || 0);
    if (title && durSec) {
      return { ok: true, title: title, durationSec: durSec, author: "", videoId: idMong || "", source: "DOM" };
    }
  } catch (e) {}
  return { ok: false, error: "Chưa load xong video" };
}

/* ── Lấy thông tin từ tab YouTube đang mở (thử lại nhiều lần) ── */
async function layThongTinTuYouTube(soLanThu = 5) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
    return { ok: false, error: "Hãy mở trang video YouTube (youtube.com/watch?v=...)" };
  }
  for (let i = 0; i < soLanThu; i++) {
    try {
      const [ketQua] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: trichXuTuTrang,
        args: [layId(tab.url) || ""]
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
  if (await baiDaCoTrenServer(id)) { khoaNutLuu(true); return hienThongBao(THONG_BAO_TRUNG, true); } // YT-KEY-NODUP-01
  const data = await guiServer("/set-song-info", {
    songId: id,
    title: document.getElementById("tenBai").value.trim() || null,
    totalDurationSec: parseInt(document.getElementById("tongThoiLuong").value) || null
  });
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
  if (await baiDaCoTrenServer(id)) { khoaNutLuu(true); return hienThongBao(THONG_BAO_TRUNG, true); } // YT-KEY-NODUP-01
  if (isNaN(start) || isNaN(end) || start >= end) return hienThongBao("❌ Giây kết thúc phải lớn hơn bắt đầu!", true);
  const data = await guiServer("/add-segment", {
    songId: id, startSec: start, endSec: end, key: khoa, mode: cheDo, weight: 1.0,
    // Kèm tên + thời lượng: nếu chưa bấm "Lưu Thông Tin Bài", server tự tạo thông tin bài để Menu tra được theo tên.
    title: document.getElementById("tenBai").value.trim() || null,
    totalDurationSec: parseInt(document.getElementById("tongThoiLuong").value) || null
  });
  if (data.ok) {
    await ghiNhoBaiVuaThem(id); // YT-KEY-NODUP-01: bài mới vừa nhập -> cho nhập tiếp các đoạn sau
    const sv = data.segment || {};
    const hienKey = sv.key ? `${sv.key} ${sv.mode === "minor" ? "Phụ" : "Trưởng"}` : `${khoa} ${cheDo === "major" ? "Trưởng" : "Phụ"}`;
    hienThongBao(`✅ Đã lưu${data.baiDaBiet ? " (bài đã biết — cập nhật)" : ""}!\n${start} → ${end} giây\nKhóa: ${hienKey}`, false);
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
document.addEventListener("DOMContentLoaded", async () => { await tuDongDien(); await kiemTraBaiTrung(); }); // YT-KEY-NODUP-01
