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

        // [A83] Bài ĐÃ BIẾT (đã có đoạn Key từ trước) -> sửa thông tin bài bằng tay cần mật khẩu quản trị.
        const trangThai = await trangThaiBai(env, songId);
        if (trangThai.khoa) {
          const tuChoi = yeuCauMatKhauBaiDaBiet(request, env, corsHeaders);
          if (tuChoi) return tuChoi;
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

    // ========== [4] THÊM 1 ĐOẠN KHÓA — MENU / EXTENSION GỬI LÊN ==========
    // [A83] Quy tắc:
    //  - Bài MỚI (chưa có đoạn Key nào): lưu NGAY, KHÔNG cần mật khẩu. Server cập nhật luôn, Menu tra thấy ngay.
    //  - Bài ĐÃ BIẾT (đã có đoạn Key từ trước, quá ${CUA_SO_BAI_MOI_PHUT} phút): thêm/sửa bằng tay CẦN mật khẩu quản trị (ADMIN_TOKEN),
    //    gửi trong header Authorization: Bearer <mật khẩu> (hoặc X-Admin-Token).
    //  - Trong ${CUA_SO_BAI_MOI_PHUT} phút đầu sau khi bài được tạo, vẫn thêm được các đoạn tiếp theo của CHÍNH bài đó không cần mật khẩu
    //    (để nhập nhiều đoạn liên tiếp cho bài mới).
    //  - Key nhập tự do ("Am", "Ebm", "F#", "Bb minor"...) được chuẩn hoá về dạng server dùng (C..B, dấu thăng) + major/minor;
    //    không hiểu được thì báo lỗi rõ ràng thay vì lưu sai.
    //  - Cùng songId + cùng startSec: thay đoạn cũ (không nhân đôi khi bấm lưu lại).
    if (url.pathname === "/add-segment" && request.method === "POST") {
      try {
        const body = await request.json();
        const songId = String((body && body.songId) || "").trim();
        const startSec = body ? body.startSec : undefined;
        const endSec = body ? body.endSec : undefined;
        const weight = (body && body.weight !== undefined) ? body.weight : 1.0;
        if (!songId || startSec === undefined || !endSec || !body.key) {
          return Response.json({ error: "thieu thong tin: songId, startSec, endSec, key" }, { status: 400, headers: corsHeaders });
        }
        if (startSec >= endSec) {
          return Response.json({ error: "startSec phai nho hon endSec" }, { status: 400, headers: corsHeaders });
        }
        const kq = phanTichKeyNhap(body.key, body.mode);
        if (!kq) {
          return Response.json({ error: "key_khong_hop_le", message: "Khong hieu Key \"" + body.key + "\". Dung C, C#, D, Eb, F#, Am, Bb minor... (hoac chon Truong/Phu)" }, { status: 400, headers: corsHeaders });
        }

        const trangThai = await trangThaiBai(env, songId);
        if (trangThai.khoa) {
          const tuChoi = yeuCauMatKhauBaiDaBiet(request, env, corsHeaders);
          if (tuChoi) return tuChoi;
        }

        // Cùng startSec -> thay đoạn cũ (xoá rồi chèn), không nhân đôi.
        await env.DB.prepare(`DELETE FROM song_key_segments WHERE song_id = ? AND start_sec = ?`).bind(songId, startSec).run();
        await env.DB.prepare(`
          INSERT INTO song_key_segments
          (song_id, start_sec, end_sec, key, mode, weight, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(songId, startSec, endSec, kq.key, kq.mode, weight, trangThai.dauTien).run();
        // created_at = thời điểm đoạn đầu tiên của bài (KHÔNG làm mới khi sửa) -> bài đã biết không bị "mở khoá" lại sau mỗi lần sửa.

        // [A83] Extension gửi kèm tên bài: nếu bài chưa có thông tin (người dùng chưa bấm "Lưu Thông Tin Bài") thì tạo luôn.
        // Menu tra bài theo TÊN (/find chỉ đọc bảng thông tin bài) -> thiếu dòng thông tin thì Menu không bao giờ thấy Key vừa thêm.
        let taoThongTin = false;
        const tenBai = body && typeof body.title === "string" ? body.title.trim() : "";
        if (tenBai) {
          const coInfo = await env.DB.prepare(`SELECT song_id as songId, title FROM song_info WHERE song_id = ?`).bind(songId).first();
          if (!coInfo) {
            const dur = parseInt(body.totalDurationSec, 10);
            await env.DB.prepare(`
              INSERT OR REPLACE INTO song_info
              (song_id, title, total_duration_sec, note, updated_at)
              VALUES (?, ?, ?, ?, strftime('%s','now') * 1000)
            `).bind(songId, tenBai, Number.isFinite(dur) && dur > 0 ? dur : null, "nguon: extension").run();
            taoThongTin = true;
          }
        }

        return Response.json({
          ok: true,
          message: trangThai.khoa ? "da cap nhat bai da biet (mat khau quan tri hop le)" : "da them doan",
          baiDaBiet: trangThai.biet,
          taoThongTinBai: taoThongTin,
          segment: { songId, startSec, endSec, key: kq.key, mode: kq.mode }
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

    // ========== [A88] THỜI LƯỢNG BÀI HÁT THEO ID ==========
    // GET /song-duration?id=<ID YouTube>  -> thời lượng (giây). Có trong server thì trả luôn; chưa có thì server tự lấy từ YouTube rồi LƯU.
    //     Thêm &refresh=1 để lấy lại từ YouTube và ghi đè (bài đã có thời lượng -> cần mật khẩu quản trị).
    if (url.pathname === "/song-duration" && request.method === "GET") {
      try {
        const songId = String(url.searchParams.get("id") || "").trim();
        if (!songId) return Response.json({ error: "thieu id bai hat" }, { status: 400, headers: corsHeaders });
        const row = await env.DB.prepare(`
          SELECT song_id as songId, title, total_duration_sec as totalSec FROM song_info WHERE song_id = ?
        `).bind(songId).first();
        const daCo = row && Number(row.totalSec) > 0;
        const lamMoi = url.searchParams.get("refresh") === "1";
        if (daCo && !lamMoi) {
          return Response.json({ ok: true, songId, title: row.title || null, durationSec: Number(row.totalSec), format: giaySangPhutGiay(Number(row.totalSec)), source: "server" }, { headers: corsHeaders });
        }
        if (!laIdYouTube(songId)) {
          return Response.json({ error: "chua_co_thoi_luong", message: "Bai nay chua co thoi luong va ID khong phai ID YouTube (11 ky tu) nen server khong tu lay duoc. Dung /set-duration de nhap tay." }, { status: 404, headers: corsHeaders });
        }
        if (daCo && lamMoi) {
          const tuChoi = kiemTraQuyenSua(request, env, corsHeaders);
          if (tuChoi) return tuChoi;
        }
        const kq = await layThoiLuongYouTube(songId);
        if (!kq.ok) {
          return Response.json({ error: "khong_lay_duoc_tu_youtube", chiTiet: kq.loi, message: "Server khong lay duoc thoi luong tu YouTube. Dung /set-duration de nhap tay." }, { status: 502, headers: corsHeaders });
        }
        await luuThoiLuong(env, songId, kq.giay, !!row);
        return Response.json({ ok: true, songId, title: (row && row.title) || null, durationSec: kq.giay, format: giaySangPhutGiay(kq.giay), source: "youtube", daLuu: true }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /set-duration  body { songId, totalDurationSec }  -> sửa thời lượng 1 bài (chỉ đổi thời lượng, giữ nguyên tên + các đoạn Key).
    //     Bài chưa có thời lượng (trống) -> điền được không cần mật khẩu. Bài ĐÃ có thời lượng -> cần mật khẩu quản trị (ADMIN_TOKEN).
    if (url.pathname === "/set-duration" && request.method === "POST") {
      try {
        const body = await request.json();
        const songId = String((body && body.songId) || "").trim();
        const giay = parseInt(body && body.totalDurationSec, 10);
        if (!songId) return Response.json({ error: "thieu songId" }, { status: 400, headers: corsHeaders });
        if (!Number.isFinite(giay) || giay < 1 || giay > 86400) {
          return Response.json({ error: "thoi_luong_khong_hop_le", message: "totalDurationSec phai la so giay tu 1 den 86400" }, { status: 400, headers: corsHeaders });
        }
        const row = await env.DB.prepare(`
          SELECT song_id as songId, title, total_duration_sec as totalSec FROM song_info WHERE song_id = ?
        `).bind(songId).first();
        if (row && Number(row.totalSec) > 0) {
          const tuChoi = kiemTraQuyenSua(request, env, corsHeaders);
          if (tuChoi) return tuChoi;
        }
        const truoc = row ? (Number(row.totalSec) || null) : null;
        await luuThoiLuong(env, songId, giay, !!row);
        return Response.json({ ok: true, songId, durationSec: giay, format: giaySangPhutGiay(giay), truoc }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /refresh-durations  (CẦN mật khẩu quản trị) body { limit? (mặc định 10, tối đa 20) }
    //     Quét các bài ĐÃ có trên server nhưng CHƯA có thời lượng, tự lấy từ YouTube theo ID và lưu. Gọi lặp lại cho tới khi conLai = 0.
    //     Chỉ điền chỗ trống, không ghi đè thời lượng đã có. ID không phải YouTube (vd app_xxxx) được bỏ qua.
    if (url.pathname === "/refresh-durations" && request.method === "POST") {
      const denied = kiemTraQuyenSua(request, env, corsHeaders);
      if (denied) return denied;
      try {
        let body = {};
        try { body = await request.json(); } catch (_) { body = {}; }
        const limit = Math.min(20, Math.max(1, parseInt(body && body.limit, 10) || 10));
        const { results } = await env.DB.prepare(`
          SELECT song_id as songId, title FROM song_info
          WHERE total_duration_sec IS NULL OR total_duration_sec = 0
          ORDER BY updated_at DESC LIMIT 200
        `).all();
        const ungVien = (results || []).filter((r) => laIdYouTube(r.songId));
        const boQua = (results || []).length - ungVien.length;
        const lamNgay = ungVien.slice(0, limit);
        const ketQua = [];
        for (const r of lamNgay) {
          const kq = await layThoiLuongYouTube(r.songId);
          if (kq.ok) {
            await luuThoiLuong(env, r.songId, kq.giay, true);
            ketQua.push({ songId: r.songId, title: r.title || null, ok: true, durationSec: kq.giay });
          } else {
            ketQua.push({ songId: r.songId, title: r.title || null, ok: false, loi: kq.loi });
          }
        }
        return Response.json({
          ok: true,
          daDienDuoc: ketQua.filter((x) => x.ok).length,
          thatBai: ketQua.filter((x) => !x.ok).length,
          conLai: Math.max(0, ungVien.length - lamNgay.length),
          boQuaKhongPhaiYouTube: boQua,
          chiTiet: ketQua
        }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // [A91] GET /youtube-search-duration?id=<songId>  -> KHÔNG lưu, chỉ trả danh sách ứng viên (videoId, tiêu đề, thời lượng) để người dùng xác nhận.
    //   - songId là ID YouTube (11 ký tự): trả đúng video đó.
    //   - songId kiểu app_xxxx (Menu tự sinh từ tên bài, không có ID YouTube): tìm trên YouTube theo TÊN bài đã lưu, trả tối đa 5 kết quả đầu.
    //   Người dùng chọn kết quả đúng -> trang chủ gọi /set-duration để lưu.
    if (url.pathname === "/youtube-search-duration" && request.method === "GET") {
      try {
        const songId = String(url.searchParams.get("id") || "").trim();
        if (!songId) return Response.json({ error: "thieu id bai hat" }, { status: 400, headers: corsHeaders });
        if (laIdYouTube(songId)) {
          const kq = await layThoiLuongYouTube(songId);
          if (!kq.ok) return Response.json({ error: "khong_lay_duoc_tu_youtube", chiTiet: kq.loi }, { status: 502, headers: corsHeaders });
          return Response.json({ ok: true, cach: "id", ungVien: [{ videoId: songId, title: null, durationSec: kq.giay, format: giaySangPhutGiay(kq.giay) }] }, { headers: corsHeaders });
        }
        const row = await env.DB.prepare(`
          SELECT song_id as songId, title, total_duration_sec as totalSec FROM song_info WHERE song_id = ?
        `).bind(songId).first();
        const ten = String((row && row.title) || url.searchParams.get("q") || "").trim();
        if (!ten) return Response.json({ error: "khong_co_ten_bai", message: "Bai chua co ten de tim tren YouTube" }, { status: 404, headers: corsHeaders });
        const kq = await timYouTubeTheoTen(ten);
        if (!kq.ok) return Response.json({ error: "khong_tim_duoc_tren_youtube", chiTiet: kq.loi, message: "Khong tim duoc tren YouTube. Nhap thoi luong bang tay." }, { status: 502, headers: corsHeaders });
        return Response.json({ ok: true, cach: "ten", tuKhoa: ten, ungVien: kq.ungVien }, { headers: corsHeaders });
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

// ========== [A88] THỜI LƯỢNG THEO ID ==========
// ID YouTube = 11 ký tự chữ/số/_/-. ID kiểu "app_xxxx" (Menu tự sinh từ tên bài) KHÔNG phải ID YouTube.
function laIdYouTube(id) {
  return /^[A-Za-z0-9_-]{11}$/.test(String(id || "")) && !/^app_/.test(String(id));
}

// Lấy thời lượng (giây) từ trang xem YouTube ("lengthSeconds"). Không cần khoá API. Lỗi/chặn -> { ok:false, loi }.
async function layThoiLuongYouTube(videoId) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch("https://www.youtube.com/watch?v=" + encodeURIComponent(videoId) + "&hl=en", {
      signal: ctl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "CONSENT=YES+1; SOCS=CAI"
      }
    });
    if (!res.ok) return { ok: false, loi: "http_" + res.status };
    const html = await res.text();
    const m = /"lengthSeconds":"(\d{1,6})"/.exec(html);
    if (!m) return { ok: false, loi: "khong_thay_lengthSeconds" };
    const giay = parseInt(m[1], 10);
    if (!Number.isFinite(giay) || giay < 1 || giay > 86400) return { ok: false, loi: "thoi_luong_vo_ly_" + m[1] };
    return { ok: true, giay };
  } catch (e) {
    return { ok: false, loi: e && e.name === "AbortError" ? "het_gio" : String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

// [A91] Tìm video YouTube theo tên bài (đọc trang kết quả tìm kiếm). Trả tối đa 5 ứng viên {videoId, title, durationSec, format}.
// Chỉ GỢI Ý — người dùng phải xác nhận trước khi lưu (tên giống nhau nhưng bản karaoke/live có thể dài khác).
function docThoiLuongChuoi(t) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
  if (!m) return 0;
  return (m[1] ? parseInt(m[1], 10) * 3600 : 0) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}
function phanTichKetQuaTimYouTube(html) {
  const ds = [];
  const re = /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"/g;
  const viTri = [];
  let m;
  while ((m = re.exec(html))) viTri.push({ index: m.index, id: m[1] });
  for (let i = 0; i < viTri.length && ds.length < 5; i++) {
    m = { index: viTri[i].index, 1: viTri[i].id };
    // Chỉ đọc trong khối của CHÍNH video này (tới video kế tiếp) để không mượn thời lượng của video khác.
    const khoi = html.slice(viTri[i].index, Math.min(viTri[i].index + 6000, i + 1 < viTri.length ? viTri[i + 1].index : html.length));
    const len = /"lengthText":\{(?:"accessibility":\{"accessibilityData":\{"label":"[^"]*"\}\},)?"simpleText":"([0-9:]+)"/.exec(khoi);
    const ti = /"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(khoi);
    const giay = len ? docThoiLuongChuoi(len[1]) : 0;
    if (!giay) continue; // video trực tiếp/không có thời lượng -> bỏ
    let title = null;
    if (ti) { try { title = JSON.parse('"' + ti[1] + '"'); } catch (_) { title = ti[1]; } }
    if (ds.some((x) => x.videoId === m[1])) continue;
    ds.push({ videoId: m[1], title, durationSec: giay, format: giaySangPhutGiay(giay) });
  }
  return ds;
}
async function timYouTubeTheoTen(ten) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const res = await fetch("https://www.youtube.com/results?hl=en&sp=EgIQAQ%3D%3D&search_query=" + encodeURIComponent(ten), {
      signal: ctl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "CONSENT=YES+1; SOCS=CAI"
      }
    });
    if (!res.ok) return { ok: false, loi: "http_" + res.status };
    const ds = phanTichKetQuaTimYouTube(await res.text());
    if (!ds.length) return { ok: false, loi: "khong_co_ket_qua" };
    return { ok: true, ungVien: ds };
  } catch (e) {
    return { ok: false, loi: e && e.name === "AbortError" ? "het_gio" : String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

// Ghi thời lượng cho 1 bài: bài đã có dòng thông tin -> chỉ đổi cột thời lượng (giữ tên/ghi chú); chưa có -> tạo dòng mới.
async function luuThoiLuong(env, songId, giay, coDong) {
  if (coDong) {
    await env.DB.prepare(`
      UPDATE song_info SET total_duration_sec = ?, updated_at = strftime('%s','now') * 1000 WHERE song_id = ?
    `).bind(giay, songId).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO song_info (song_id, total_duration_sec, updated_at) VALUES (?, ?, strftime('%s','now') * 1000)
    `).bind(songId, giay).run();
  }
}

// ========== [A83] BÀI MỚI / BÀI ĐÃ BIẾT ==========
// Bài "đã biết" = đã có đoạn Key. "Khoá" (cần mật khẩu) = đã biết VÀ đoạn Key đầu tiên được tạo cách đây quá CUA_SO_BAI_MOI_PHUT phút
// (đoạn cũ không có created_at cũng coi là cũ). Bài mới tạo trong cửa sổ này vẫn nhập tiếp được các đoạn sau không cần mật khẩu.
const CUA_SO_BAI_MOI_PHUT = 30;
async function trangThaiBai(env, songId) {
  const r = await env.DB.prepare(`
    SELECT COUNT(*) as n, MIN(created_at) as dauTien FROM song_key_segments WHERE song_id = ?
  `).bind(songId).first();
  const n = (r && r.n) || 0;
  if (n === 0) return { biet: false, khoa: false, dauTien: Date.now() };
  const dau = Number(r.dauTien);
  const cu = !Number.isFinite(dau) || dau <= 0 || (Date.now() - dau) > CUA_SO_BAI_MOI_PHUT * 60 * 1000;
  return { biet: true, khoa: cu, dauTien: (Number.isFinite(dau) && dau > 0) ? dau : 1 };
}

// Bài đã biết -> bắt buộc có mật khẩu quản trị. Trả null nếu hợp lệ, ngược lại trả sẵn Response lỗi.
function yeuCauMatKhauBaiDaBiet(request, env, corsHeaders) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : (request.headers.get("X-Admin-Token") || "");
  if (!token && env.ADMIN_TOKEN) {
    return Response.json({
      error: "can_mat_khau_admin",
      message: "Bai nay da co tren server. Them/sua Key bang tay can mat khau quan tri (ADMIN_TOKEN)."
    }, { status: 401, headers: corsHeaders });
  }
  return kiemTraQuyenSua(request, env, corsHeaders);
}

// Nhận Key nhập tự do: "D", "Eb", "Am", "F#m", "Bb minor", "C major"... (+ mode riêng nếu có). Trả { key, mode } hoặc null.
// Hậu tố trong chính ô Key (m / min / minor / maj / major) thắng mode truyền riêng.
function phanTichKeyNhap(rawKey, rawMode) {
  const t = String(rawKey || "").trim();
  const m = /^([A-Ga-g][#b♯♭]?)\s*(m|min|minor|maj|major|M)?$/.exec(t);
  if (!m) return null;
  const key = chuanHoaKey(m[1]);
  if (!key) return null;
  let mode = chuanHoaMode(rawMode);
  const suf = m[2];
  if (suf) {
    if (suf === "m" || /^min/i.test(suf)) mode = "minor";
    else mode = "major"; // "M", "maj", "major"
  }
  return { key, mode: mode || "major" };
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
    // [A83c] Khớp mờ theo TỪ: tên YouTube của extension hay chen thêm chữ ("Karaoke", "Beat"...) hoặc khác phần đuôi so với tên Menu đọc được,
    // nên "chứa nguyên chuỗi" trượt dù là CÙNG bài. Chấp nhận khi >= 80% số từ của tên NGẮN HƠN có trong tên kia và trùng ít nhất 3 từ.
    if (score === 0) {
      const ta = new Set(q.split(" ").filter(Boolean)), tb = new Set(nt.split(" ").filter(Boolean));
      let chung = 0;
      for (const t of ta) if (tb.has(t)) chung++;
      const nhoHon = Math.min(ta.size, tb.size);
      if (chung >= 3 && nhoHon > 0 && chung / nhoHon >= 0.8) score = 100 + Math.round(100 * chung / (ta.size + tb.size - chung));
    }
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
        <div id="tgChiTiet"></div>

        <h3 style="color:#4CAF50;">Tung Doan Khoa</h3>
        <table>
          <thead><tr><th>Tu</th><th>Den</th><th>Khoa</th><th>Che do</th><th>Sua doan nay</th></tr></thead>
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
        <div id="kqDS" style="margin:10px 0; padding:10px; border-radius:8px; display:none;"></div>
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
        var tgc = document.getElementById('tgChiTiet');
        tgc.innerHTML = dungThoiLuongUI('', data.songId);
        ganThoiLuong(tgc, timBai);

        var tbodyDoan = document.getElementById('danhSachDoan');
        tbodyDoan.innerHTML = '';
        for (var i = 0; i < data.doans.length; i++) {
          var d = data.doans[i];
          var tagClass = d.mode === 'major' ? 'tag-major' : 'tag-minor';
          tbodyDoan.innerHTML += '<tr><td>' + esc(d.tu) + '</td><td>' + esc(d.den) + '</td>' +
            '<td style="font-weight:bold; font-size:16px;">' + esc(d.khoa) + '</td>' +
            '<td><span class="tag ' + tagClass + '">' + esc(d.cheDo) + '</span></td>' +
            '<td><div style="display:flex; gap:6px; align-items:center;">' +
              '<select class="dt-key" data-val="' + esc(d.khoa) + '" style="padding:8px; border-radius:6px; border:none;">' + OPT_KEY + '</select>' +
              '<select class="dt-mode" data-val="' + esc(d.mode) + '" style="padding:8px; border-radius:6px; border:none;"><option value="major">Truong</option><option value="minor">Phu</option></select>' +
              '<button class="btn-primary btn-dt-luu" data-start="' + esc(d.startSec) + '" style="padding:8px 14px;">Luu</button>' +
            '</div></td></tr>';
        }
        var dk = tbodyDoan.querySelectorAll('.dt-key'), dm = tbodyDoan.querySelectorAll('.dt-mode'), dl = tbodyDoan.querySelectorAll('.btn-dt-luu');
        for (var z = 0; z < dk.length; z++) {
          dk[z].value = dk[z].getAttribute('data-val');
          dm[z].value = dm[z].getAttribute('data-val') === 'minor' ? 'minor' : 'major';
          dl[z].addEventListener('click', function() { suaDoanNay(this); });
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

    var OPT_KEY = '<option>C</option><option>C#</option><option>D</option><option>D#</option><option>E</option><option>F</option><option>F#</option><option>G</option><option>G#</option><option>A</option><option>A#</option><option>B</option>';
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
          '<div class="list-desc">ID: ' + esc(bai.songId) + ' | Thoi luong: ' + esc(bai.tongThoiLuong) + ' | So doan: ' + esc(bai.soDoan) + '</div>' +
          '<div class="list-actions" style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">' +
            '<select class="ds-key" data-val="' + esc(bai.key || '') + '" style="padding:10px; border-radius:6px; border:none; font-size:15px;">' + OPT_KEY + '</select>' +
            '<select class="ds-mode" data-val="' + esc(bai.mode || 'major') + '" style="padding:10px; border-radius:6px; border:none; font-size:15px;"><option value="major">Truong</option><option value="minor">Phu</option></select>' +
            '<button class="btn-primary btn-ds-luu" data-songid="' + esc(bai.songId) + '" data-sodoan="' + esc(bai.soDoan) + '" style="padding:10px 16px;">Luu Key</button>' +
            '<button class="btn-ds-xoa" data-songid="' + esc(bai.songId) + '" data-title="' + esc(bai.title) + '" style="background:#c62828; color:#fff; padding:10px 16px; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Xoa</button>' +
          '</div>' +
          '</div>' +
          dungThoiLuongUI('', bai.songId) +
          '</div>';
      }
      var items = document.querySelectorAll('#danhSachTatCa .list-item');
      for (var k = 0; k < items.length; k++) {
        items[k].addEventListener('click', function(ev) {
          if (ev.target.closest && ev.target.closest('button, select, input, label, .tg-box')) return;
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
      ganThoiLuong(div, taiDanhSach);
      var sk = document.querySelectorAll('#danhSachTatCa .ds-key');
      for (var u = 0; u < sk.length; u++) { var kv = sk[u].getAttribute('data-val'); if (kv) sk[u].value = kv; }
      var sm = document.querySelectorAll('#danhSachTatCa .ds-mode');
      for (var w = 0; w < sm.length; w++) { sm[w].value = sm[w].getAttribute('data-val') === 'minor' ? 'minor' : 'major'; }
      var bl = document.querySelectorAll('#danhSachTatCa .btn-ds-luu');
      for (var n = 0; n < bl.length; n++) {
        bl[n].addEventListener('click', function(ev) { ev.stopPropagation(); suaKeyDS(this); });
      }
      var bx = document.querySelectorAll('#danhSachTatCa .btn-ds-xoa');
      for (var q = 0; q < bx.length; q++) {
        bx[q].addEventListener('click', function(ev) { ev.stopPropagation(); xoaBaiDS(this); });
      }
    }

    // Sua Key / Xoa bai ngay trong danh sach + sua tung doan: mat khau quan tri hoi 1 lan (nho trong tab, sessionStorage)
    var OPT_KEY_LIST = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    function hienKqDS(ok, text) {
      var kq = document.getElementById('kqDS');
      kq.style.display = 'block';
      kq.style.background = ok ? 'rgba(76,175,80,0.25)' : 'rgba(244,67,54,0.25)';
      kq.innerText = text;
    }
    function layMatKhau() {
      var t = '';
      try { t = sessionStorage.getItem('menuAdminToken') || ''; } catch (e) {}
      if (!t) { var o = document.getElementById('adminToken'); if (o && o.value) t = o.value; }
      if (!t) t = prompt('Nhap mat khau quan tri (ADMIN_TOKEN):') || '';
      return t;
    }
    function nhoMatKhau(t) {
      try { sessionStorage.setItem('menuAdminToken', t); } catch (e) {}
      var o = document.getElementById('adminToken'); if (o) o.value = t;
    }
    function quenMatKhau() { try { sessionStorage.removeItem('menuAdminToken'); } catch (e) {} }
    async function goiAdmin(path, body, token) {
      var res = await fetch(SERVER + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
      var data = await res.json();
      if (res.status === 401) quenMatKhau();
      return data;
    }
    async function suaKeyDS(btn) {
      var item = btn.closest('.list-item');
      var n = Number(btn.getAttribute('data-sodoan')) || 0;
      var body = { songId: btn.getAttribute('data-songid'), key: item.querySelector('.ds-key').value, mode: item.querySelector('.ds-mode').value };
      if (n > 1) {
        if (!confirm('Bai nay co ' + n + ' doan. Dat Key nay cho TAT CA ' + n + ' doan?\\n(Muon sua tung doan: bam vao ten bai, cot "Sua doan nay")')) return;
        body.all = true;
      }
      var token = layMatKhau();
      if (!token) { hienKqDS(false, 'Chua nhap mat khau quan tri.'); return; }
      try {
        var data = await goiAdmin('/set-key', body, token);
        if (data.ok) { nhoMatKhau(token); hienKqDS(true, 'Da sua ' + data.daSua + ' doan -> ' + data.keyHienThi); taiDanhSach(); }
        else hienKqDS(false, data.message || data.error || 'Loi');
      } catch (err) { hienKqDS(false, 'Loi ket noi: ' + err.message); }
    }
    async function xoaBaiDS(btn) {
      var id = btn.getAttribute('data-songid'), ten = btn.getAttribute('data-title') || id;
      if (!confirm('XOA bai "' + ten + '" va tat ca Key cua bai khoi server? Khong hoan tac duoc.')) return;
      var token = layMatKhau();
      if (!token) { hienKqDS(false, 'Chua nhap mat khau quan tri.'); return; }
      try {
        var data = await goiAdmin('/delete-song', { songId: id, xacNhan: true }, token);
        if (data.ok) { nhoMatKhau(token); hienKqDS(true, 'Da xoa bai "' + ten + '" (' + data.daXoaDoan + ' doan Key).'); taiDanhSach(); }
        else hienKqDS(false, data.message || data.error || 'Loi');
      } catch (err) { hienKqDS(false, 'Loi ket noi: ' + err.message); }
    }
    // [A91] THOI LUONG: o nhap tay (mm:ss hoac so giay) + nut "Tim tren YouTube" (server tim theo ID hoac theo TEN bai, nguoi dung chon dung roi moi luu)
    function docThoiLuong(t) {
      t = String(t || '').trim();
      if (/^\\d+$/.test(t)) return parseInt(t, 10);
      var m = /^(?:(\\d+):)?(\\d{1,2}):(\\d{2})$/.exec(t);
      if (!m) return 0;
      return (m[1] ? parseInt(m[1], 10) * 3600 : 0) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    }
    function ghiTg(sec) { return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
    function dungThoiLuongUI(boxId, songId, soDoan0) {
      return '<div class="tg-box" data-songid="' + esc(songId) + '" style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">' +
        '<input type="text" class="tg-input" placeholder="Thoi luong mm:ss" style="max-width:150px; padding:10px; border-radius:6px; border:none;">' +
        '<button class="btn-primary tg-luu" style="padding:10px 14px;">Luu TG</button>' +
        '<button class="tg-tim" style="background:#4a6cf7; color:#fff; padding:10px 14px; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Tim tren YouTube</button>' +
        '<div class="tg-kq" style="flex-basis:100%;"></div></div>';
    }
    async function luuThoiLuongServer(songId, giay) {
      var token = '';
      try { token = sessionStorage.getItem('menuAdminToken') || ''; } catch (e) {}
      for (var lan = 0; lan < 2; lan++) {
        var h = { 'Content-Type': 'application/json' };
        if (token) h['Authorization'] = 'Bearer ' + token;
        var res = await fetch(SERVER + '/set-duration', { method: 'POST', headers: h, body: JSON.stringify({ songId: songId, totalDurationSec: giay }) });
        var data = await res.json();
        if (res.status === 401 && lan === 0) { quenMatKhau(); token = prompt('Bai nay da co thoi luong - nhap mat khau quan tri (ADMIN_TOKEN) de sua:') || ''; if (!token) return { error: 'Chua nhap mat khau' }; continue; }
        if (data.ok && token) nhoMatKhau(token);
        return data;
      }
    }
    function ganThoiLuong(root, apDung) {
      var boxes = root.querySelectorAll('.tg-box');
      for (var i = 0; i < boxes.length; i++) {
        (function(box) {
          var sid = box.getAttribute('data-songid');
          var kq = box.querySelector('.tg-kq');
          function bao(ok, t) { kq.innerHTML = '<div style="padding:8px; border-radius:6px; background:' + (ok ? 'rgba(76,175,80,0.25)' : 'rgba(244,67,54,0.25)') + ';">' + esc(t) + '</div>'; }
          box.querySelector('.tg-luu').addEventListener('click', async function(ev) {
            ev.stopPropagation();
            var g = docThoiLuong(box.querySelector('.tg-input').value);
            if (g < 1 || g > 86400) { bao(false, 'Nhap thoi luong dang mm:ss (vd 4:25) hoac so giay.'); return; }
            var d = await luuThoiLuongServer(sid, g);
            if (d && d.ok) { bao(true, 'Da luu thoi luong ' + ghiTg(g)); apDung(); } else bao(false, (d && (d.message || d.error)) || 'Loi');
          });
          box.querySelector('.tg-tim').addEventListener('click', async function(ev) {
            ev.stopPropagation();
            bao(true, 'Dang tim tren YouTube...');
            try {
              var res = await fetch(SERVER + '/youtube-search-duration?id=' + encodeURIComponent(sid));
              var d = await res.json();
              if (!d.ok) { bao(false, d.message || d.error || 'Khong tim duoc'); return; }
              var html = '<div style="font-size:13px; color:#aaa; margin:6px 0;">' + (d.cach === 'ten' ? 'Tim theo ten: "' + esc(d.tuKhoa) + '" - chon video DUNG:' : 'Video theo ID:') + '</div>';
              for (var k = 0; k < d.ungVien.length; k++) {
                var u = d.ungVien[k];
                html += '<div style="display:flex; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.1);">' +
                  '<span style="flex:1;">' + esc(u.title || u.videoId) + ' - <b>' + esc(u.format) + '</b></span>' +
                  '<button class="btn-primary tg-dung" data-giay="' + esc(u.durationSec) + '" style="padding:6px 12px;">Dung</button></div>';
              }
              kq.innerHTML = html;
              var ds = kq.querySelectorAll('.tg-dung');
              for (var q = 0; q < ds.length; q++) {
                ds[q].addEventListener('click', async function(ev2) {
                  ev2.stopPropagation();
                  var g = Number(this.getAttribute('data-giay'));
                  var r2 = await luuThoiLuongServer(sid, g);
                  if (r2 && r2.ok) { bao(true, 'Da luu thoi luong ' + ghiTg(g)); apDung(); } else bao(false, (r2 && (r2.message || r2.error)) || 'Loi');
                });
              }
            } catch (err) { bao(false, 'Loi ket noi: ' + err.message); }
          });
        })(boxes[i]);
      }
    }
    // Sua tung doan ngay trong bang chi tiet bai
    async function suaDoanNay(btn) {
      var tr = btn.closest('tr');
      var bai = window.baiDangXem;
      if (!bai || !bai.id) return;
      var body = { songId: bai.id, key: tr.querySelector('.dt-key').value, mode: tr.querySelector('.dt-mode').value, startSec: Number(btn.getAttribute('data-start')) };
      var token = layMatKhau();
      if (!token) { alert('Chua nhap mat khau quan tri.'); return; }
      try {
        var data = await goiAdmin('/set-key', body, token);
        if (data.ok) { nhoMatKhau(token); timBai(); }
        else alert(data.message || data.error || 'Loi');
      } catch (err) { alert('Loi ket noi: ' + err.message); }
    }
  </script>
</body>
</html>
`;
}
