// ============================================================
//  AUTO_MENU_AI — Key Server (Cloudflare Worker + D1)
//  Phiên bản: 2.0 (hoàn chỉnh, 2 chiều, hỗ trợ MENU & Auto-Tune)
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ========== [1] TỰ ĐỘNG TẠO BẢNG — mở /init 1 lần ==========
    if (url.pathname === "/init") {
      try {
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS song_info (
            song_id TEXT PRIMARY KEY,
            title TEXT,
            total_duration_sec INTEGER,
            note TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
            updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
          )
        `).run();

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS song_key_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_id TEXT NOT NULL,
            start_sec INTEGER NOT NULL,
            end_sec INTEGER NOT NULL,
            key TEXT NOT NULL,
            mode TEXT NOT NULL DEFAULT 'major',
            weight REAL DEFAULT 1.0,
            created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
          )
        `).run();

        await env.DB.prepare(`
          CREATE INDEX IF NOT EXISTS idx_segments_song ON song_key_segments(song_id)
        `).run();

        return Response.json({ ok: true, message: "Da tao bang thanh cong! Co the luu du lieu." }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ========== [2] TRANG CHỦ — GIAO DIỆN QUẢN LÝ ==========
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(taoTrangChu(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // ========== [3] LƯU / CẬP NHẬT THÔNG TIN BÀI HÁT ==========
    if (url.pathname === "/set-song-info" && request.method === "POST") {
      try {
        const { songId, title, totalDurationSec, note } = await request.json();
        if (!songId) {
          return Response.json({ error: "thieu songId" }, { status: 400, headers: corsHeaders });
        }

        await env.DB.prepare(`
          INSERT OR REPLACE INTO song_info
          (song_id, title, total_duration_sec, note, updated_at)
          VALUES (?, ?, ?, ?, strftime('%s','now') * 1000)
        `).bind(songId, title || null, totalDurationSec || null, note || null).run();

        return Response.json({ ok: true, message: "da cap nhat thong tin" }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ========== [4] THÊM 1 ĐOẠN KHÓA — MENU GỬI LÊN ==========
    if (url.pathname === "/add-segment" && request.method === "POST") {
      try {
        const { songId, startSec, endSec, key, mode = "major", weight = 1.0 } = await request.json();
        if (!songId || startSec === undefined || !endSec || !key) {
          return Response.json({ error: "thieu thong tin: songId, startSec, endSec, key" }, { status: 400, headers: corsHeaders });
        }
        if (startSec >= endSec) {
          return Response.json({ error: "startSec phai nho hon endSec" }, { status: 400, headers: corsHeaders });
        }

        await env.DB.prepare(`
          INSERT INTO song_key_segments
          (song_id, start_sec, end_sec, key, mode, weight)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(songId, startSec, endSec, key, mode, weight).run();

        return Response.json({
          ok: true,
          message: "da them doan",
          segment: { songId, startSec, endSec, key, mode }
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ========== [5] XEM ĐẦY ĐỦ 1 BÀI — MENU TẢI DỮ LIỆU CŨ ==========
    if (url.pathname === "/song-full") {
      const songId = url.searchParams.get("id");
      if (!songId) return Response.json({ error: "thieu id bai hat" }, { status: 400, headers: corsHeaders });

      const info = await env.DB.prepare(`
        SELECT song_id as songId, title, total_duration_sec as totalSec, note
        FROM song_info WHERE song_id = ?
      `).bind(songId).first();

      const { results: segments } = await env.DB.prepare(`
        SELECT start_sec as startSec, end_sec as endSec, key, mode
        FROM song_key_segments WHERE song_id = ? ORDER BY start_sec ASC
      `).bind(songId).all();

      const transitions = [];
      for (let i = 1; i < segments.length; i++) {
        transitions.push({
          timeSec: segments[i].startSec,
          timeFormat: giaySangPhutGiay(segments[i].startSec),
          fromKey: segments[i - 1].key,
          fromMode: segments[i - 1].mode,
          toKey: segments[i].key,
          toMode: segments[i].mode,
          fromDisplay: segments[i - 1].key + " " + (segments[i - 1].mode === 'major' ? 'Truong' : 'Phu'),
          toDisplay: segments[i].key + " " + (segments[i].mode === 'major' ? 'Truong' : 'Phu')
        });
      }

      return Response.json({
        songId,
        thongTin: info || { songId, title: "Chua dat ten", totalSec: null },
        tongDoan: segments.length,
        doans: segments.map(s => ({
          startSec: s.startSec,
          endSec: s.endSec,
          tu: giaySangPhutGiay(s.startSec),
          den: giaySangPhutGiay(s.endSec),
          khoa: s.key,
          mode: s.mode,
          cheDo: s.mode === 'major' ? 'Truong' : 'Phu'
        })),
        chuyenTong: transitions
      }, { headers: corsHeaders });
    }

    // ========== [6] TRA KHÓA TẠI GIÂY — AUTO-TUNE / DAW GỌI ==========
    if (url.pathname === "/key-at") {
      const songId = url.searchParams.get("id");
      const giay = parseInt(url.searchParams.get("sec") || "0");
      if (!songId) return Response.json({ error: "thieu tham so" }, { status: 400, headers: corsHeaders });

      const { results } = await env.DB.prepare(`
        SELECT key, mode, start_sec as startSec, end_sec as endSec
        FROM song_key_segments
        WHERE song_id = ? AND start_sec <= ? AND end_sec >= ?
        ORDER BY start_sec DESC LIMIT 1
      `).bind(songId, giay, giay).all();

      if (results.length === 0) {
        return Response.json({ found: false, giay }, { headers: corsHeaders });
      }

      return Response.json({
        found: true,
        giay,
        thoiGian: giaySangPhutGiay(giay),
        key: results[0].key,
        mode: results[0].mode,
        modeDisplay: results[0].mode === 'major' ? 'Truong' : 'Phu',
        startSec: results[0].startSec,
        endSec: results[0].endSec
      }, { headers: corsHeaders });
    }

    // ========== [7] DANH SÁCH TẤT CẢ BÀI ==========
    // Thêm trường "key" (Key của đoạn đầu tiên, vd "D minor") để hiện cạnh tên bài. Các trường cũ giữ nguyên.
    if (url.pathname === "/list") {
      const { results } = await env.DB.prepare(`
        SELECT i.song_id as songId, i.title, i.total_duration_sec as tongGiay,
               COUNT(s.id) as soDoan, i.updated_at,
               (SELECT s2.key FROM song_key_segments s2 WHERE s2.song_id = i.song_id ORDER BY s2.start_sec ASC LIMIT 1) as key1,
               (SELECT s3.mode FROM song_key_segments s3 WHERE s3.song_id = i.song_id ORDER BY s3.start_sec ASC LIMIT 1) as mode1
        FROM song_info i
        LEFT JOIN song_key_segments s ON i.song_id = s.song_id
        GROUP BY i.song_id ORDER BY i.updated_at DESC LIMIT 100
      `).all();

      return Response.json({
        tongBai: results.length,
        danhSach: results.map(r => ({
          songId: r.songId,
          title: r.title || "Chua dat ten",
          tongThoiLuong: r.tongGiay ? giaySangPhutGiay(r.tongGiay) : "Chua cap nhat",
          soDoan: r.soDoan,
          key: r.key1 || null,
          mode: r.mode1 || null,
          keyHienThi: r.key1 ? (r.key1 + " " + (r.mode1 === "minor" ? "Minor" : "Major")) : null
        }))
      }, { headers: corsHeaders });
    }

    // ========== [9] SỬA KEY BÀI HÁT — CẦN MẬT KHẨU QUẢN TRỊ (ADMIN_TOKEN) ==========
    // Body: { songId, key:"D", mode:"minor", startSec?, all? }
    //  - startSec: chỉ sửa đoạn bắt đầu tại giây này.
    //  - all:true: sửa Key của TẤT CẢ các đoạn (giữ nguyên mốc thời gian).
    //  - Không có startSec/all: bài phải có đúng 1 đoạn (hoặc chưa có đoạn nào -> tạo 1 đoạn cho cả bài).
    // Chưa cài ADMIN_TOKEN trên Cloudflare => TỪ CHỐI mọi lần sửa (không để ai cũng sửa được).
    if (url.pathname === "/set-key" && request.method === "POST") {
      const denied = kiemTraQuyenSua(request, env, corsHeaders);
      if (denied) return denied;
      try {
        const body = await request.json();
        const songId = String((body && body.songId) || "").trim();
        const key = chuanHoaKey(body && body.key);
        const mode = chuanHoaMode(body && body.mode);
        if (!songId) return Response.json({ error: "thieu songId" }, { status: 400, headers: corsHeaders });
        if (!key) return Response.json({ error: "key_khong_hop_le", message: "Key phai la C, C#, D, D#, E, F, F#, G, G#, A, A#, B (hoac ky hieu giang Db, Eb, Gb, Ab, Bb)" }, { status: 400, headers: corsHeaders });
        if (!mode) return Response.json({ error: "mode_khong_hop_le", message: "mode phai la major hoac minor" }, { status: 400, headers: corsHeaders });

        const info = await env.DB.prepare(`
          SELECT song_id as songId, total_duration_sec as totalSec FROM song_info WHERE song_id = ?
        `).bind(songId).first();
        const { results: segs } = await env.DB.prepare(`
          SELECT start_sec as startSec FROM song_key_segments WHERE song_id = ? ORDER BY start_sec ASC LIMIT 200
        `).bind(songId).all();

        if (!info && (!segs || segs.length === 0)) {
          return Response.json({ error: "khong_co_bai", message: "Server chua co bai nay" }, { status: 404, headers: corsHeaders });
        }

        let daSua = 0;
        if (!segs || segs.length === 0) {
          // Bài có thông tin nhưng chưa có đoạn Key nào -> tạo 1 đoạn cho cả bài.
          const end = (info && info.totalSec > 0) ? info.totalSec : 36000;
          await env.DB.prepare(`
            INSERT INTO song_key_segments (song_id, start_sec, end_sec, key, mode, weight)
            VALUES (?, 0, ?, ?, ?, 1.0)
          `).bind(songId, end, key, mode).run();
          daSua = 1;
        } else if (body.all === true) {
          const r = await env.DB.prepare(`UPDATE song_key_segments SET key = ?, mode = ? WHERE song_id = ?`).bind(key, mode, songId).run();
          daSua = (r && r.meta && r.meta.changes) || segs.length;
        } else if (body.startSec !== undefined && body.startSec !== null && body.startSec !== "") {
          const start = parseInt(body.startSec, 10);
          if (!Number.isFinite(start)) return Response.json({ error: "startSec_khong_hop_le" }, { status: 400, headers: corsHeaders });
          const r = await env.DB.prepare(`UPDATE song_key_segments SET key = ?, mode = ? WHERE song_id = ? AND start_sec = ?`).bind(key, mode, songId, start).run();
          daSua = (r && r.meta && r.meta.changes) || 0;
          if (daSua === 0) return Response.json({ error: "khong_co_doan", message: "Khong co doan nao bat dau tai giay " + start }, { status: 404, headers: corsHeaders });
        } else if (segs.length === 1) {
          const r = await env.DB.prepare(`UPDATE song_key_segments SET key = ?, mode = ? WHERE song_id = ?`).bind(key, mode, songId).run();
          daSua = (r && r.meta && r.meta.changes) || 1;
        } else {
          return Response.json({
            error: "nhieu_doan",
            message: "Bai co " + segs.length + " doan. Hay chi dinh startSec (giay bat dau doan) hoac dat all:true de sua tat ca cac doan.",
            tongDoan: segs.length
          }, { status: 409, headers: corsHeaders });
        }

        await env.DB.prepare(`UPDATE song_info SET updated_at = strftime('%s','now') * 1000 WHERE song_id = ?`).bind(songId).run();
        return Response.json({ ok: true, songId, daSua, key, mode, keyHienThi: key + " " + (mode === "minor" ? "Minor" : "Major") }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ========== [8] TÌM BÀI THEO TÊN — MENU HỎI SERVER TRƯỚC KHI TỰ DÒ KEY ==========
    // Menu chỉ biết tên bài (không biết mã video), nên tra theo tên đã chuẩn hoá.
    // Chỉ ĐỌC dữ liệu, không ghi gì. Trả Key của đoạn đầu tiên của bài.
    if (url.pathname === "/find") {
      const title = url.searchParams.get("title") || "";
      const artist = url.searchParams.get("artist") || "";
      const q = chuanHoaTen(title);
      if (q.length < 3) {
        return Response.json({ found: false, error: "thieu title" }, { status: 400, headers: corsHeaders });
      }

      try {
        const { results: songs } = await env.DB.prepare(`
          SELECT song_id as songId, title FROM song_info ORDER BY updated_at DESC LIMIT 1000
        `).all();

        const best = timBaiKhopNhat(songs || [], q, chuanHoaTen(artist));
        if (!best) {
          return Response.json({ found: false }, { headers: corsHeaders });
        }

        const { results: segs } = await env.DB.prepare(`
          SELECT key, mode, start_sec as startSec, end_sec as endSec
          FROM song_key_segments WHERE song_id = ? ORDER BY start_sec ASC LIMIT 200
        `).bind(best.songId).all();

        if (!segs || segs.length === 0) {
          return Response.json({ found: false }, { headers: corsHeaders });
        }

        return Response.json({
          found: true,
          songId: best.songId,
          title: best.title,
          key: segs[0].key,
          mode: segs[0].mode,
          startSec: segs[0].startSec,
          endSec: segs[0].endSec,
          tongDoan: segs.length
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ found: false, error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ========== [10] XÓA BÀI HÁT — CẦN MẬT KHẨU QUẢN TRỊ (ADMIN_TOKEN) ==========
    // Body: { songId, xacNhan:true }. Xoá bài + TẤT CẢ đoạn Key của bài, KHÔNG hoàn tác được.
    // Bắt buộc có xacNhan:true để không lỡ tay xoá khi gọi nhầm. Xoá trong 1 giao dịch (batch): hoặc xoá hết, hoặc không xoá gì.
    if (url.pathname === "/delete-song" && request.method === "POST") {
      const denied = kiemTraQuyenSua(request, env, corsHeaders);
      if (denied) return denied;
      try {
        const body = await request.json();
        const songId = String((body && body.songId) || "").trim();
        if (!songId) return Response.json({ error: "thieu songId" }, { status: 400, headers: corsHeaders });
        if (!body || body.xacNhan !== true) {
          return Response.json({ error: "can_xac_nhan", message: "Xoa bai khong hoan tac duoc. Gui kem xacNhan:true de xac nhan." }, { status: 400, headers: corsHeaders });
        }

        const info = await env.DB.prepare(`
          SELECT song_id as songId, title FROM song_info WHERE song_id = ?
        `).bind(songId).first();
        const dem = await env.DB.prepare(`
          SELECT COUNT(*) as n FROM song_key_segments WHERE song_id = ?
        `).bind(songId).first();
        const soDoan = (dem && dem.n) || 0;

        if (!info && soDoan === 0) {
          return Response.json({ error: "khong_co_bai", message: "Server khong co bai nay" }, { status: 404, headers: corsHeaders });
        }

        await env.DB.batch([
          env.DB.prepare(`DELETE FROM song_key_segments WHERE song_id = ?`).bind(songId),
          env.DB.prepare(`DELETE FROM song_info WHERE song_id = ?`).bind(songId)
        ]);

        return Response.json({
          ok: true,
          songId,
          title: (info && info.title) || null,
          daXoaDoan: soDoan,
          daXoaBai: info ? 1 : 0
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: "not_found" }, { status: 404, headers: corsHeaders });
  }
};

// ========== KIỂM TRA QUYỀN SỬA (mật khẩu quản trị) ==========
// Trả null nếu hợp lệ; ngược lại trả sẵn Response lỗi.
// Chưa cài ADMIN_TOKEN (Cloudflare > Settings > Variables and Secrets) => từ chối hết, không để ai cũng sửa được.
function kiemTraQuyenSua(request, env, corsHeaders) {
  if (!env.ADMIN_TOKEN) {
    return Response.json({
      error: "chua_cai_ADMIN_TOKEN",
      message: "Server chua cai mat khau quan tri. Vao Cloudflare > Settings > Variables and Secrets > Add, loai Secret, ten ADMIN_TOKEN."
    }, { status: 403, headers: corsHeaders });
  }
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : (request.headers.get("X-Admin-Token") || "");
  if (!soSanhAnToan(token, env.ADMIN_TOKEN)) {
    return Response.json({ error: "sai_mat_khau", message: "Mat khau quan tri khong dung" }, { status: 401, headers: corsHeaders });
  }
  return null;
}

// So sánh chuỗi không lộ độ dài khớp (chống dò mật khẩu theo thời gian phản hồi).
function soSanhAnToan(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// ========== CHUẨN HOÁ KEY / MODE (giống KeyServerSync.js phía app: ký hiệu giáng đổi sang thăng) ==========
function chuanHoaKey(raw) {
  const m = /^([A-Ga-g])([#b♯♭]?)$/.exec(String(raw || "").trim());
  if (!m) return null;
  let root = m[1].toUpperCase() + m[2].replace("♯", "#").replace("♭", "b");
  const giangSangThang = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B", Fb: "E", "E#": "F", "B#": "C" };
  if (giangSangThang[root]) root = giangSangThang[root];
  return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(root) >= 0 ? root : null;
}

function chuanHoaMode(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (/^maj/.test(s)) return "major";
  if (/^min/.test(s)) return "minor";
  return null;
}

// ========== CHUẨN HOÁ TÊN BÀI (bỏ dấu, chữ thường, chỉ giữ chữ/số) ==========
// PHẢI giống hệt hàm normalizeTitle() trong core/integration/KeyServerSync.js.
function chuanHoaTen(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ========== CHỌN BÀI KHỚP NHẤT THEO TÊN ==========
// Khớp đúng hẳn > tên trên server chứa tên Menu gửi > tên Menu gửi chứa tên trên server.
// Yêu cầu tối thiểu 8 ký tự cho khớp "chứa" để tránh nhầm bài khi tên quá ngắn.
function timBaiKhopNhat(songs, q, artistNorm) {
  let best = null;
  let bestScore = 0;
  for (const s of songs) {
    const nt = chuanHoaTen(s.title);
    if (!nt) continue;
    let score = 0;
    if (nt === q) score = 1000;
    else if (q.length >= 8 && nt.includes(q)) score = 500 - Math.min(nt.length - q.length, 400);
    else if (nt.length >= 8 && q.includes(nt)) score = 300 - Math.min(q.length - nt.length, 250);
    if (score > 0 && artistNorm && nt.includes(artistNorm)) score += 50;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

// ========== HÀM ĐỔI GIÂY -> 03:05 ==========
function giaySangPhutGiay(tongGiay) {
  if (!tongGiay && tongGiay !== 0) return "--";
  const phut = Math.floor(tongGiay / 60);
  const giay = tongGiay % 60;
  return phut.toString().padStart(2, '0') + ":" + giay.toString().padStart(2, '0');
}

// ========== TRANG CHỦ GIAO DIỆN ==========
function taoTrangChu() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AUTO_MENU_AI - Quan Ly Khoa</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
    body { background: linear-gradient(135deg, #1a1a2e, #16213e); min-height: 100vh; padding: 20px; color: #fff; }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 25px; font-size: 26px; color: #ffd700; }
    .card { background: rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin-bottom: 20px; backdrop-filter: blur(10px); }
    .search-bar { display: flex; gap: 10px; margin-bottom: 15px; }
    input { flex: 1; padding: 12px 15px; border: none; border-radius: 8px; font-size: 15px; background: rgba(255,255,255,0.9); color: #333; }
    button { padding: 12px 25px; border: none; border-radius: 8px; font-size: 15px; font-weight: bold; cursor: pointer; transition: all 0.3s; }
    .btn-primary { background: #ffd700; color: #1a1a2e; }
    .btn-primary:hover { background: #ffed4e; transform: translateY(-2px); }
    .btn-secondary { background: #4a6cf7; color: white; }
    .btn-secondary:hover { background: #3a5ce7; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); }
    th { background: rgba(255,215,0,0.2); color: #ffd700; font-weight: 600; }
    tr:hover { background: rgba(255,255,255,0.05); }
    .tag { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: bold; }
    .tag-major { background: #4CAF50; color: white; }
    .tag-minor { background: #2196F3; color: white; }
    .transition-row { background: rgba(255,193,7,0.15) !important; }
    .transition-text { color: #ffd700; font-weight: bold; }
    .song-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; }
    .song-title { font-size: 22px; font-weight: bold; color: #ffd700; }
    .song-meta { color: #aaa; font-size: 14px; }
    .hidden { display: none !important; }
    .empty { text-align: center; padding: 30px; color: #888; }
    .list-item { padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: background 0.2s; }
    .list-item:hover { background: rgba(255,255,255,0.08); }
    .list-title { font-weight: bold; font-size: 16px; margin-bottom: 5px; }
    .list-desc { color: #888; font-size: 13px; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab { padding: 10px 20px; background: transparent; border: 2px solid transparent; color: #aaa; }
    .tab.active { border-bottom: 2px solid #ffd700; color: #ffd700; background: transparent; }
    h3 { margin: 20px 0 10px 0; }
    .init-note { background: rgba(255,193,7,0.15); padding: 12px 15px; border-radius: 8px; margin-bottom: 20px; color: #ffd700; font-size: 14px; }
    .init-note a { color: #fff; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>AUTO_MENU_AI - Quan Ly Khoa Theo Doan</h1>

    <div class="init-note">
      <strong>LAN DAU SU DUNG?</strong> Mo link: <a href="/init">/init</a> de tu dong tao bang du lieu, sau do quay lai day!
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="search">Tim Bai</button>
      <button class="tab" data-tab="list">Tat Ca Bai</button>
    </div>

    <div id="tab-search">
      <div class="card">
        <div class="search-bar">
          <input type="text" id="songIdInput" placeholder="Nhap ID YouTube (VD: wHLNh9qFgU8)">
          <button class="btn-primary" id="btnTim">Xem Thong Tin</button>
        </div>
        <p style="font-size:13px; color:#888;">Vi du: https://youtube.com/watch?v=<b>wHLNh9qFgU8</b></p>
      </div>

      <div id="ketQua" class="card hidden">
        <div class="song-header">
          <div>
            <div class="song-title" id="tenBaiHienThi">—</div>
            <div class="song-meta">
              ID: <span id="idBaiHienThi">—</span> |
              Thoi luong: <span id="thoiLuongHienThi">—</span> |
              So doan: <span id="soDoanHienThi">0</span>
            </div>
          </div>
          <a id="linkYoutube" target="_blank" style="color:#ffd700; text-decoration:none;">Xem tren YouTube</a>
        </div>

        <h3 style="color:#4CAF50;">Tung Doan Khoa</h3>
        <table>
          <thead><tr><th>Tu</th><th>Den</th><th>Khoa</th><th>Che do</th></tr></thead>
          <tbody id="danhSachDoan"></tbody>
        </table>

        <h3 style="color:#ff9800;">Sua Key Bai Hat</h3>
        <p style="font-size:13px; color:#aaa; margin-bottom:10px;">Can mat khau quan tri (ADMIN_TOKEN). Bai chi co 1 doan: chon Key roi bam Luu. Bai nhieu doan: tick "Sua tat ca" hoac nhap giay bat dau cua doan can sua.</p>
        <div class="search-bar" style="flex-wrap:wrap;">
          <select id="suaKey" style="padding:12px; border-radius:8px; border:none; font-size:15px;">
            <option>C</option><option>C#</option><option>D</option><option>D#</option><option>E</option><option>F</option>
            <option>F#</option><option>G</option><option>G#</option><option>A</option><option>A#</option><option>B</option>
          </select>
          <select id="suaMode" style="padding:12px; border-radius:8px; border:none; font-size:15px;">
            <option value="major">Truong (Major)</option><option value="minor">Phu (Minor)</option>
          </select>
          <input type="number" id="suaStartSec" placeholder="Giay bat dau doan (tuy chon)" style="max-width:230px;">
          <label style="display:flex; align-items:center; gap:6px; color:#ddd; font-size:14px;"><input type="checkbox" id="suaTatCa" style="flex:none; width:auto;"> Sua tat ca cac doan</label>
          <input type="password" id="adminToken" placeholder="Mat khau quan tri (ADMIN_TOKEN)" style="max-width:260px;">
          <button class="btn-primary" id="btnSuaKey">Luu Key</button>
        </div>
        <div id="kqSua" style="margin-top:10px; padding:10px; border-radius:8px; display:none;"></div>

        <h3 style="color:#f44336; margin-top:20px;">Xoa Bai Hat</h3>
        <p style="font-size:13px; color:#aaa; margin-bottom:10px;">Xoa bai nay va TAT CA Key cua bai khoi server. Khong hoan tac duoc. Dung mat khau quan tri o o ben tren.</p>
        <button id="btnXoaBai" style="background:#c62828; color:#fff;">Xoa bai nay</button>

        <h3 style="color:#ffd700;">Diem Chuyen Tong</h3>
        <table>
          <thead><tr><th>Thoi diem</th><th>Tu Khoa</th><th></th><th>Sang Khoa</th></tr></thead>
          <tbody id="danhSachChuyenTong"></tbody>
        </table>
        <p id="khongChuyenTong" class="hidden" style="color:#888; margin-top:10px;">Khong co diem chuyen tong</p>

        <h3 style="color:#4a6cf7;">Auto-Tune - Tra Khoa Tai Giay</h3>
        <div class="search-bar">
          <input type="number" id="giayTra" placeholder="Nhap giay (VD: 200)" style="max-width:200px;">
          <button class="btn-secondary" id="btnTra">Lay Khoa</button>
        </div>
        <div id="kqTra" style="margin-top:12px; padding:12px; background:rgba(74,108,247,0.1); border-radius:8px; display:none;"></div>
      </div>
    </div>

    <div id="tab-list" class="hidden">
      <div class="card">
        <h3>Tat Ca Bai Da Luu</h3>
        <div id="danhSachTatCa"></div>
      </div>
    </div>
  </div>

  <script>
    var SERVER = window.location.origin;

    // Chong chen ma: moi du lieu lay tu server (ten bai, key...) deu phai qua ham nay truoc khi dua vao innerHTML.
    function esc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Chuyen tab
    var tabs = document.querySelectorAll('.tab');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function() {
        var all = document.querySelectorAll('.tab');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
        this.classList.add('active');
        var tabId = this.getAttribute('data-tab');
        document.getElementById('tab-search').classList.toggle('hidden', tabId !== 'search');
        document.getElementById('tab-list').classList.toggle('hidden', tabId !== 'list');
        if (tabId === 'list') taiDanhSach();
      });
    }

    // Tim bai
    document.getElementById('btnTim').addEventListener('click', timBai);
    document.getElementById('songIdInput').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') timBai();
    });

    async function timBai() {
      var id = document.getElementById('songIdInput').value.trim();
      if (!id) { alert('Vui long nhap ID YouTube!'); return; }
      document.getElementById('ketQua').classList.remove('hidden');
      document.getElementById('tenBaiHienThi').innerText = 'Dang tim...';
      try {
        var res = await fetch(SERVER + '/song-full?id=' + encodeURIComponent(id));
        var data = await res.json();
        if (data.error) { alert('Loi: ' + data.error); return; }
        document.getElementById('tenBaiHienThi').innerText = (data.thongTin && data.thongTin.title) || 'Chua dat ten';
        document.getElementById('idBaiHienThi').innerText = data.songId;
        document.getElementById('thoiLuongHienThi').innerText = (data.thongTin && data.thongTin.tongThoiLuong) || 'Chua cap nhat';
        document.getElementById('soDoanHienThi').innerText = data.tongDoan;
        document.getElementById('linkYoutube').href = 'https://youtube.com/watch?v=' + data.songId;

        var tbodyDoan = document.getElementById('danhSachDoan');
        tbodyDoan.innerHTML = '';
        for (var i = 0; i < data.doans.length; i++) {
          var d = data.doans[i];
          var tagClass = d.mode === 'major' ? 'tag-major' : 'tag-minor';
          tbodyDoan.innerHTML += '<tr><td>' + esc(d.tu) + '</td><td>' + esc(d.den) + '</td>' +
            '<td style="font-weight:bold; font-size:16px;">' + esc(d.khoa) + '</td>' +
            '<td><span class="tag ' + tagClass + '">' + esc(d.cheDo) + '</span></td></tr>';
        }
        // Dien san Key hien tai vao o sua (doan dau tien) de chi can doi nhung gi muon sua
        if (!window.baiDangXem || window.baiDangXem.id !== data.songId) document.getElementById('kqSua').style.display = 'none';
        window.baiDangXem = { id: data.songId, doans: data.doans };
        if (data.doans.length > 0) {
          var k0 = String(data.doans[0].khoa || '');
          var sel = document.getElementById('suaKey');
          for (var so = 0; so < sel.options.length; so++) { if (sel.options[so].value === k0) sel.selectedIndex = so; }
          document.getElementById('suaMode').value = data.doans[0].mode === 'minor' ? 'minor' : 'major';
        }

        var tbodyCT = document.getElementById('danhSachChuyenTong');
        tbodyCT.innerHTML = '';
        if (data.chuyenTong.length === 0) {
          document.getElementById('khongChuyenTong').classList.remove('hidden');
        } else {
          document.getElementById('khongChuyenTong').classList.add('hidden');
          for (var j = 0; j < data.chuyenTong.length; j++) {
            var ct = data.chuyenTong[j];
            tbodyCT.innerHTML += '<tr class="transition-row">' +
              '<td class="transition-text">' + esc(ct.timeFormat) + '</td>' +
              '<td style="color:#ff6b6b; font-weight:bold;">' + esc(ct.fromDisplay) + '</td>' +
              '<td style="color:#ffd700;">-></td>' +
              '<td style="color:#4CAF50; font-weight:bold;">' + esc(ct.toDisplay) + '</td></tr>';
          }
        }
      } catch (err) {
        alert('Loi ket noi: ' + err.message);
      }
    }

    // Sua key bai hat (can mat khau quan tri)
    document.getElementById('btnSuaKey').addEventListener('click', suaKey);
    try { var tkLuu = sessionStorage.getItem('menuAdminToken'); if (tkLuu) document.getElementById('adminToken').value = tkLuu; } catch (e) {}

    async function suaKey() {
      var kq = document.getElementById('kqSua');
      function hien(ok, text) {
        kq.style.display = 'block';
        kq.style.background = ok ? 'rgba(76,175,80,0.25)' : 'rgba(244,67,54,0.25)';
        kq.innerText = text;
      }
      var bai = window.baiDangXem;
      if (!bai || !bai.id) { hien(false, 'Hay bam "Xem Thong Tin" cho mot bai truoc.'); return; }
      var token = document.getElementById('adminToken').value;
      if (!token) { hien(false, 'Chua nhap mat khau quan tri.'); return; }
      var body = { songId: bai.id, key: document.getElementById('suaKey').value, mode: document.getElementById('suaMode').value };
      if (document.getElementById('suaTatCa').checked) body.all = true;
      var st = document.getElementById('suaStartSec').value;
      if (st !== '') body.startSec = parseInt(st, 10);
      try {
        var res = await fetch(SERVER + '/set-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify(body)
        });
        var data = await res.json();
        if (data.ok) {
          try { sessionStorage.setItem('menuAdminToken', token); } catch (e) {}
          hien(true, 'Da sua ' + data.daSua + ' doan -> ' + data.keyHienThi);
          timBai();
        } else {
          hien(false, data.message || data.error || ('Loi ' + res.status));
        }
      } catch (err) {
        hien(false, 'Loi ket noi: ' + err.message);
      }
    }

    // Xoa bai hat (can mat khau quan tri + hoi xac nhan)
    document.getElementById('btnXoaBai').addEventListener('click', xoaBai);

    async function xoaBai() {
      var kq = document.getElementById('kqSua');
      function hien(ok, text) {
        kq.style.display = 'block';
        kq.style.background = ok ? 'rgba(76,175,80,0.25)' : 'rgba(244,67,54,0.25)';
        kq.innerText = text;
      }
      var bai = window.baiDangXem;
      if (!bai || !bai.id) { hien(false, 'Hay bam "Xem Thong Tin" cho mot bai truoc.'); return; }
      var token = document.getElementById('adminToken').value;
      if (!token) { hien(false, 'Chua nhap mat khau quan tri.'); return; }
      var ten = document.getElementById('tenBaiHienThi').innerText;
      if (!confirm('XOA bai "' + ten + '" va tat ca Key cua bai khoi server? Khong hoan tac duoc.')) return;
      try {
        var res = await fetch(SERVER + '/delete-song', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ songId: bai.id, xacNhan: true })
        });
        var data = await res.json();
        if (data.ok) {
          try { sessionStorage.setItem('menuAdminToken', token); } catch (e) {}
          window.baiDangXem = null;
          document.getElementById('ketQua').classList.add('hidden');
          document.getElementById('songIdInput').value = '';
          alert('Da xoa bai "' + ten + '" (' + data.daXoaDoan + ' doan Key).');
        } else {
          hien(false, data.message || data.error || ('Loi ' + res.status));
        }
      } catch (err) {
        hien(false, 'Loi ket noi: ' + err.message);
      }
    }

    // Tra khoa tai giay
    document.getElementById('btnTra').addEventListener('click', traKhoaTaiGiay);

    async function traKhoaTaiGiay() {
      var id = document.getElementById('songIdInput').value.trim();
      var giay = document.getElementById('giayTra').value;
      if (!id || !giay) { alert('Nhap day du ID va giay!'); return; }
      var res = await fetch(SERVER + '/key-at?id=' + encodeURIComponent(id) + '&sec=' + giay);
      var data = await res.json();
      var div = document.getElementById('kqTra');
      div.style.display = 'block';
      if (data.found) {
        div.innerHTML = 'Tai <strong>' + esc(data.thoiGian) + '</strong>: ' +
          '<span style="font-size:20px; font-weight:bold; color:#4CAF50;">' + esc(data.key) + '</span> ' +
          '<span style="color:#aaa;">(' + esc(data.modeDisplay) + ' / ' + esc(data.mode) + ')</span>';
      } else {
        div.innerHTML = 'Khong tim thay khoa tai giay nay';
      }
    }

    // Danh sach tat ca bai
    async function taiDanhSach() {
      var res = await fetch(SERVER + '/list');
      var data = await res.json();
      var div = document.getElementById('danhSachTatCa');
      if (data.tongBai === 0) {
        div.innerHTML = '<p class="empty">Chua co bai hat nao duoc luu</p>';
        return;
      }
      div.innerHTML = '';
      for (var i = 0; i < data.danhSach.length; i++) {
        var bai = data.danhSach[i];
        var keyTag = bai.keyHienThi
          ? ' <span class="tag ' + (bai.mode === 'minor' ? 'tag-minor' : 'tag-major') + '">' + esc(bai.keyHienThi) + '</span>'
          : ' <span class="tag" style="background:#555; color:#ddd;">Chua co Key</span>';
        div.innerHTML += '<div class="list-item" data-songid="' + esc(bai.songId) + '">' +
          '<div class="list-title">' + esc(bai.title) + keyTag + '</div>' +
          '<div class="list-desc">ID: ' + esc(bai.songId) + ' | Thoi luong: ' + esc(bai.tongThoiLuong) + ' | So doan: ' + esc(bai.soDoan) + '</div></div>';
      }
      var items = document.querySelectorAll('#danhSachTatCa .list-item');
      for (var k = 0; k < items.length; k++) {
        items[k].addEventListener('click', function() {
          var sid = this.getAttribute('data-songid');
          document.getElementById('songIdInput').value = sid;
          var allTabs = document.querySelectorAll('.tab');
          allTabs[0].classList.add('active');
          allTabs[1].classList.remove('active');
          document.getElementById('tab-search').classList.remove('hidden');
          document.getElementById('tab-list').classList.add('hidden');
          timBai();
        });
      }
    }
  </script>
</body>
</html>
`;
}
