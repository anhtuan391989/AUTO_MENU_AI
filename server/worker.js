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
      "Access-Control-Allow-Headers": "Content-Type"
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
    if (url.pathname === "/list") {
      const { results } = await env.DB.prepare(`
        SELECT i.song_id as songId, i.title, i.total_duration_sec as tongGiay,
               COUNT(s.id) as soDoan, i.updated_at
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
          soDoan: r.soDoan
        }))
      }, { headers: corsHeaders });
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

    return Response.json({ error: "not_found" }, { status: 404, headers: corsHeaders });
  }
};

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
          tbodyDoan.innerHTML += '<tr><td>' + d.tu + '</td><td>' + d.den + '</td>' +
            '<td style="font-weight:bold; font-size:16px;">' + d.khoa + '</td>' +
            '<td><span class="tag ' + tagClass + '">' + d.cheDo + '</span></td></tr>';
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
              '<td class="transition-text">' + ct.timeFormat + '</td>' +
              '<td style="color:#ff6b6b; font-weight:bold;">' + ct.fromDisplay + '</td>' +
              '<td style="color:#ffd700;">-></td>' +
              '<td style="color:#4CAF50; font-weight:bold;">' + ct.toDisplay + '</td></tr>';
          }
        }
      } catch (err) {
        alert('Loi ket noi: ' + err.message);
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
        div.innerHTML = 'Tai <strong>' + data.thoiGian + '</strong>: ' +
          '<span style="font-size:20px; font-weight:bold; color:#4CAF50;">' + data.key + '</span> ' +
          '<span style="color:#aaa;">(' + data.modeDisplay + ' / ' + data.mode + ')</span>';
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
        div.innerHTML += '<div class="list-item" data-songid="' + bai.songId + '">' +
          '<div class="list-title">' + bai.title + '</div>' +
          '<div class="list-desc">ID: ' + bai.songId + ' | Thoi luong: ' + bai.tongThoiLuong + ' | So doan: ' + bai.soDoan + '</div></div>';
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
