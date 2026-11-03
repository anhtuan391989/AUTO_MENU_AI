// ============================================================
//   AUTO_MENU_AI — Key Server (Cloudflare Worker + D1)
//   Phiên bản hoàn chỉnh: Giữ nguyên giao diện & tính năng cũ + Cập nhật thời lượng
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

    // ========== [1] TỰ ĐỘNG TẠO BẢNG ==========
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

        return Response.json({ ok: true, message: "Da tao bang thanh cong!" }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ========== [2] TRANG CHỦ — GIAO DIỆN GỐC ==========
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(taoTrangChuGoc(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // ========== [3] LƯU / CẬP NHẬT THÔNG TIN BÀI HÁT & THỜI LƯỢNG ==========
    if (url.pathname === "/set-song-info" && request.method === "POST") {
      try {
        const body = await request.json();
        const { songId, title, totalDurationSec, note } = body;
        if (!songId) {
          return Response.json({ error: "thieu songId" }, { status: 400, headers: corsHeaders });
        }

        let giayLuu = parseInt(totalDurationSec, 10);
        if (!Number.isFinite(giayLuu) || giayLuu <= 0) {
          giayLuu = null;
          if (laIdYouTube(String(songId))) {
            try { 
              const kq = await layThoiLuongYouTube(String(songId), env); 
              if (kq.ok) giayLuu = kq.giay; 
            } catch (_) {}
          }
        }

        await env.DB.prepare(`
          INSERT INTO song_info (song_id, title, total_duration_sec, note, updated_at)
          VALUES (?, ?, ?, ?, strftime('%s','now') * 1000)
          ON CONFLICT(song_id) DO UPDATE SET
            title = COALESCE(EXCLUDED.title, title),
            total_duration_sec = CASE WHEN COALESCE(EXCLUDED.total_duration_sec, 0) > 0 THEN EXCLUDED.total_duration_sec ELSE total_duration_sec END,
            note = COALESCE(EXCLUDED.note, note),
            updated_at = strftime('%s','now') * 1000
        `).bind(songId, title || null, giayLuu, note || null).run();

        return Response.json({ ok: true, message: "da cap nhat thong tin", durationSaved: giayLuu }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ========== [4] THÊM 1 ĐOẠN KHÓA ==========
    if (url.pathname === "/add-segment" && request.method === "POST") {
      try {
        const body = await request.json();
        const songId = String((body && body.songId) || "").trim();
        const startSec = body ? body.startSec : undefined;
        const endSec = body ? body.endSec : undefined;
        const weight = (body && body.weight !== undefined) ? body.weight : 1.0;
        
        if (!songId || startSec === undefined || !endSec || !body.key) {
          return Response.json({ error: "thieu thong tin" }, { status: 400, headers: corsHeaders });
        }
        
        const kq = phanTichKeyNhap(body.key, body.mode);
        if (!kq) {
          return Response.json({ error: "key_khong_hop_le" }, { status: 400, headers: corsHeaders });
        }

        await env.DB.prepare(`DELETE FROM song_key_segments WHERE song_id = ? AND start_sec = ?`).bind(songId, startSec).run();
        await env.DB.prepare(`
          INSERT INTO song_key_segments (song_id, start_sec, end_sec, key, mode, weight, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(songId, startSec, endSec, kq.key, kq.mode, weight, Date.now()).run();

        const tenBai = body && typeof body.title === "string" ? body.title.trim() : "";
        const dur = parseInt(body.totalDurationSec, 10);
        if (tenBai || Number.isFinite(dur)) {
          await env.DB.prepare(`
            INSERT INTO song_info (song_id, title, total_duration_sec, updated_at)
            VALUES (?, ?, ?, strftime('%s','now') * 1000)
            ON CONFLICT(song_id) DO UPDATE SET
              title = COALESCE(EXCLUDED.title, title),
              total_duration_sec = CASE WHEN COALESCE(EXCLUDED.total_duration_sec, 0) > 0 THEN EXCLUDED.total_duration_sec ELSE total_duration_sec END,
              updated_at = strftime('%s','now') * 1000
          `).bind(songId, tenBai || null, Number.isFinite(dur) && dur > 0 ? dur : null).run();
        }

        return Response.json({ ok: true, message: "da them doan" }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ========== [5] XEM ĐẦY ĐỦ 1 BÀI ==========
    if (url.pathname === "/song-full") {
      const songId = url.searchParams.get("id");
      if (!songId) return Response.json({ error: "thieu id" }, { status: 400, headers: corsHeaders });

      const info = await env.DB.prepare(`
        SELECT song_id as songId, title, total_duration_sec as totalSec, note
        FROM song_info WHERE song_id = ?
      `).bind(songId).first();

      if (info && !(Number(info.totalSec) > 0) && laIdYouTube(songId)) {
        try {
          const kq = await layThoiLuongYouTube(songId, env);
          if (kq.ok) { 
            await luuThoiLuong(env, songId, kq.giay, true); 
            info.totalSec = kq.giay; 
          }
        } catch (_) {}
      }

      const { results: segments } = await env.DB.prepare(`
        SELECT start_sec as startSec, end_sec as endSec, key, mode
        FROM song_key_segments WHERE song_id = ? ORDER BY start_sec ASC
      `).bind(songId).all();

      return Response.json({
        songId,
        thongTin: info ? Object.assign({}, info, { tongThoiLuong: info.totalSec ? giaySangPhutGiay(info.totalSec) : null }) : null,
        tongDoan: segments.length,
        doans: segments
      }, { headers: corsHeaders });
    }

    // ========== [6] TRA KHÓA TẠI GIÂY ==========
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
    if (url.pathname === "/list") {
      const { results } = await env.DB.prepare(`
        SELECT i.song_id as songId, i.title, i.total_duration_sec as tongGiay,
               COUNT(s.id) as soDoan, i.updated_at,
               (SELECT s2.key FROM song_key_segments s2 WHERE s2.song_id = i.song_id ORDER BY s2.start_sec ASC LIMIT 1) as key1,
               (SELECT s3.mode FROM song_key_segments s3 WHERE s3.song_id = i.song_id ORDER BY s3.start_sec ASC LIMIT 1) as mode1
        FROM song_info i
        LEFT JOIN song_key_segments s ON i.song_id = s.song_id
        GROUP BY i.song_id ORDER BY i.updated_at DESC LIMIT 200
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

    // ========== [8] TÌM BÀI THEO TÊN ==========
    if (url.pathname === "/find") {
      const title = url.searchParams.get("title") || "";
      const artist = url.searchParams.get("artist") || "";
      const q = chuanHoaTen(title);
      if (q.length < 3) {
        return Response.json({ found: false }, { status: 400, headers: corsHeaders });
      }

      try {
        const { results: songs } = await env.DB.prepare(`
          SELECT song_id as songId, title FROM song_info ORDER BY updated_at DESC LIMIT 1000
        `).all();

        const best = timBaiKhopNhat(songs || [], q);
        if (!best) return Response.json({ found: false }, { headers: corsHeaders });

        const { results: segs } = await env.DB.prepare(`
          SELECT key, mode, start_sec as startSec, end_sec as endSec
          FROM song_key_segments WHERE song_id = ? ORDER BY start_sec ASC LIMIT 200
        `).bind(best.songId).all();

        if (!segs || segs.length === 0) return Response.json({ found: false }, { headers: corsHeaders });

        return Response.json({
          found: true,
          songId: best.songId,
          title: best.title,
          key: segs[0].key,
          mode: segs[0].mode,
          startSec: segs[0].startSec,
          endSec: segs[0].endSec
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ found: false, error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ========== [9] COUNT (Thống kê số lượng bài cho giao diện) ==========
    if (url.pathname === "/count" && request.method === "GET") {
      try {
        const a = await env.DB.prepare(`SELECT COUNT(*) as n FROM song_info`).first();
        const c = await env.DB.prepare(`SELECT COUNT(*) as n FROM song_info WHERE total_duration_sec > 0`).first();
        return Response.json({
          ok: true,
          tongBai: (a && a.n) || 0,
          baiCoThoiLuong: (c && c.n) || 0
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /set-duration (API cập nhật thời lượng)
    if (url.pathname === "/set-duration" && request.method === "POST") {
      try {
        const body = await request.json();
        const songId = String((body && body.songId) || "").trim();
        const giay = parseInt(body && body.totalDurationSec, 10);
        if (!songId || !Number.isFinite(giay)) return Response.json({ error: "thieu thong tin" }, { status: 400, headers: corsHeaders });
        
        await env.DB.prepare(`
          UPDATE song_info SET total_duration_sec = ?, updated_at = strftime('%s','now') * 1000 WHERE song_id = ?
        `).bind(giay, songId).run();

        return Response.json({ ok: true, durationSec: giay, format: giaySangPhutGiay(giay) }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  }
};

// --- CÁC HÀM PHỤ TRỢ ---
function giaySangPhutGiay(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function laIdYouTube(id) {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

async function layThoiLuongYouTube(videoId, env) {
  if (!env.YOUTUBE_API_KEY) return { ok: false };
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${env.YOUTUBE_API_KEY}`);
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const iso = data.items[0].contentDetails.duration;
      const match = iso.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
      if (!match) return { ok: false };
      const h = parseInt(match[1]) || 0;
      const m = parseInt(match[2]) || 0;
      const s = parseInt(match[3]) || 0;
      return { ok: true, giay: h * 3600 + m * 60 + s };
    }
    return { ok: false };
  } catch (_) {
    return { ok: false };
  }
}

async function luuThoiLuong(env, songId, giay, daCo) {
  if (daCo) {
    await env.DB.prepare(`UPDATE song_info SET total_duration_sec = ? WHERE song_id = ?`).bind(giay, songId).run();
  } else {
    await env.DB.prepare(`INSERT OR REPLACE INTO song_info (song_id, total_duration_sec) VALUES (?, ?)`).bind(songId, giay).run();
  }
}

function phanTichKeyNhap(keyStr, modeStr) {
  if (!keyStr) return null;
  const clean = keyStr.trim();
  const match = clean.match(/^([A-G][#b]?)\s*(major|minor|Truong|Phu|m)?$/i);
  if (!match) return { key: clean, mode: modeStr || 'major' };
  return { key: match[1], mode: (/minor|phu|m/i.test(match[2] || "")) ? 'minor' : 'major' };
}

function chuanHoaTen(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function timBaiKhopNhat(songs, q) {
  for (const s of songs) {
    if (chuanHoaTen(s.title).includes(q)) return s;
  }
  return null;
}

// Giao diện HTML gốc đầy đủ tính năng + hiển thị tổng số bài
function taoTrangChuGoc() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AUTO_MENU_AI - Quan Ly Khoa Theo Doan</title>
  <style>
    body { background: #111318; color: #fff; font-family: sans-serif; margin: 0; padding: 20px; }
    h2 { text-align: center; color: #ffd700; margin-bottom: 20px; }
    .nav { display: flex; justify-content: center; gap: 20px; margin-bottom: 20px; }
    .nav a { color: #8ab4f8; text-decoration: none; font-weight: bold; cursor: pointer; }
    .nav a.active { color: #ffd700; border-bottom: 2px solid #ffd700; }
    .card { background: #1e222d; padding: 15px 20px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #00c853; }
    .title { font-weight: bold; font-size: 16px; margin-bottom: 5px; display: flex; align-items: center; gap: 10px; }
    .meta { font-size: 12px; color: #aaa; margin-bottom: 10px; }
    .badge { background: #00c853; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .controls { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
    select, input, button { background: #2a2e3d; color: #fff; border: 1px solid #444; padding: 6px 12px; border-radius: 4px; outline: none; }
    button.save { background: #ffd700; color: #000; font-weight: bold; border: none; cursor: pointer; }
    button.delete { background: #ff5252; color: #fff; border: none; cursor: pointer; }
    button.yt { background: #2979ff; color: #fff; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <h2>AUTO_MENU_AI - Quan Ly Khoa Theo Doan</h2>
  <div style="background: #332b00; border: 1px solid #ffd700; color: #ffd700; padding: 10px; text-align: center; border-radius: 5px; margin-bottom: 20px; font-size: 14px;">
    <b>LAN DAU SU DUNG?</b> Mo link: <a href="/init" target="_blank" style="color: #8ab4f8;">/init</a> de tu dong tao bang du lieu, sau do quay lai day!
  </div>
  <div style="text-align:center; margin-bottom: 15px; font-weight: bold; color: #8ab4f8;" id="count-info">Tất cả bài hát đã lưu (Đang tải thống kê...)</div>
  <div class="nav">
    <a class="active">Tat Ca Bai</a>
  </div>
  <div id="list-container">Đang tải danh sách bài hát...</div>

  <script>
    async function loadData() {
      try {
        const countRes = await fetch('/count');
        const countData = await countRes.json();
        if(countData.ok) {
          document.getElementById('count-info').innerText = "Tất cả bài hát đã lưu (Tổng số: " + countData.tongBai + " bài | Đã có thời lượng: " + countData.baiCoThoiLuong + " bài)";
        }

        const res = await fetch('/list');
        const data = await res.json();
        const container = document.getElementById('list-container');
        if (!data.danhSach || data.danhSach.length === 0) {
          container.innerHTML = "<p style='text-align:center; color:#aaa;'>Chưa có bài hát nào trên server.</p>";
          return;
        }

        let html = "";
        data.danhSach.forEach(song => {
          html += \`<div class="card">
            <div class="title">
              \${song.title} 
              \${song.keyHienThi ? '<span class="badge">' + song.keyHienThi + '</span>' : ''}
            </div>
            <div class="meta">ID: \${song.songId} | Thời lượng: \${song.tongThoiLuong} | Số đoạn: \${song.soDoan}</div>
            <div class="controls">
              <select id="key-\${song.songId}">
                <option value="C" \${song.key === 'C' ? 'selected' : ''}>C</option>
                <option value="C#" \${song.key === 'C#' ? 'selected' : ''}>C#</option>
                <option value="D" \${song.key === 'D' ? 'selected' : ''}>D</option>
                <option value="D#" \${song.key === 'D#' ? 'selected' : ''}>D#</option>
                <option value="E" \${song.key === 'E' ? 'selected' : ''}>E</option>
                <option value="F" \${song.key === 'F' ? 'selected' : ''}>F</option>
                <option value="F#" \${song.key === 'F#' ? 'selected' : ''}>F#</option>
                <option value="G" \${song.key === 'G' ? 'selected' : ''}>G</option>
                <option value="G#" \${song.key === 'G#' ? 'selected' : ''}>G#</option>
                <option value="A" \${song.key === 'A' ? 'selected' : ''}>A</option>
                <option value="A#" \${song.key === 'A#' ? 'selected' : ''}>A#</option>
                <option value="B" \${song.key === 'B' ? 'selected' : ''}>B</option>
              </select>
              <select id="mode-\${song.songId}">
                <option value="major" \${song.mode === 'major' ? 'selected' : ''}>Trường</option>
                <option value="minor" \${song.mode === 'minor' ? 'selected' : ''}>Phụ</option>
              </select>
              <button class="save" onclick="saveKey('\${song.songId}')">Lưu Key</button>
              <button class="delete" onclick="deleteSong('\${song.songId}')">Xóa</button>
            </div>
            <div class="controls" style="margin-top: 8px;">
              <input type="text" id="dur-\${song.songId}" placeholder="Thoi luong mm:ss" value="\${song.tongThoiLuong !== 'Chua cap nhat' ? song.tongThoiLuong : ''}" style="width:130px;" />
              <button class="save" style="background:#00c853; color:#fff;" onclick="updateDuration('\${song.songId}')">Lưu TG</button>
            </div>
          </div>\`;
        });
        container.innerHTML = html;
      } catch (e) {
        document.getElementById('list-container').innerHTML = "<p style='color:red; text-align:center;'>Lỗi tải danh sách bài hát.</p>";
      }
    }

    async function saveKey(songId) {
      const key = document.getElementById('key-' + songId).value;
      const mode = document.getElementById('mode-' + songId).value;
      const res = await fetch('/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, key, mode, all: true })
      });
      const data = await res.json();
      if (data.ok) {
        alert("Đã lưu Key thành công!");
        loadData();
      } else {
        alert("Lỗi: " + (data.message || data.error));
      }
    }

    async function deleteSong(songId) {
      if (!confirm("Bạn có chắc chắn muốn xóa bài này không?")) return;
      const res = await fetch('/delete-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, xacNhan: true })
      });
      const data = await res.json();
      if (data.ok) {
        alert("Đã xóa thành công!");
        loadData();
      } else {
        alert("Lỗi: " + (data.message || data.error));
      }
    }

    async function updateDuration(songId) {
      const val = document.getElementById('dur-' + songId).value.trim();
      let totalSec = 0;
      if (val.includes(':')) {
        const parts = val.split(':');
        totalSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else {
        totalSec = parseInt(val, 10);
      }
      if (!totalSec || isNaN(totalSec)) {
        alert("Vui lòng nhập thời lượng hợp lệ (VD: 3:30 hoặc 210)");
        return;
      }
      const res = await fetch('/set-duration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, totalDurationSec: totalSec })
      });
      const data = await res.json();
      if (data.ok) {
        alert("Đã cập nhật thời lượng thành công (" + data.format + ")!");
        loadData();
      } else {
        alert("Lỗi: " + (data.error || "Không thể cập nhật"));
      }
    }

    loadData();
  </script>
</body>
</html>`;
}