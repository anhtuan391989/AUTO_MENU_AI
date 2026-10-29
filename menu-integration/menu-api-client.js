// ============================================================
//  AUTO_MENU_AI — Menu API Client
//  Module tích hợp MENU <-> Server (Cloudflare Worker + D1)
//  Cách dùng: import { MenuKeyClient } from './menu-api-client.js'
// ============================================================

class MenuKeyClient {
  /**
   * Khởi tạo client
   * @param {string} serverUrl - URL server, VD: "https://menu-key-server.matuotluuly.workers.dev"
   */
  constructor(serverUrl) {
    this.SERVER = serverUrl.replace(/\/+$/, ""); // bỏ dấu / cuối
  }

  // ----------------------------------------------------------
  //  [1] LẤY DỮ LIỆU TỪ SERVER (MENU đọc)
  // ----------------------------------------------------------

  /**
   * Lấy thông tin đầy đủ 1 bài (tên, thời lượng, tất cả đoạn khóa, điểm chuyển tông)
   * Dùng khi MENU mở bài -> tải dữ liệu cũ, không cần phân tích lại
   * @param {string} songId - ID YouTube
   * @returns {Promise<Object>} { thongTin, tongDoan, doans[], chuyenTong[] }
   */
  async layThongTinBai(songId) {
    const res = await fetch(`${this.SERVER}/song-full?id=${encodeURIComponent(songId)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  /**
   * Tra khóa tại 1 giây cụ thể — dành cho Auto-Tune / DAW gọi liên tục
   * Trả về key + mode (major/minor) tiếng Anh chuẩn, gửi thẳng vào Auto-Tune
   * @param {string} songId - ID YouTube
   * @param {number} giay - giây hiện tại khi phát
   * @returns {Promise<Object>} { found, key, mode, modeDisplay, startSec, endSec }
   */
  async layKhoaTaiGiay(songId, giay) {
    const res = await fetch(`${this.SERVER}/key-at?id=${encodeURIComponent(songId)}&sec=${giay}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  /**
   * Lấy danh sách tất cả bài đã lưu
   * @returns {Promise<Array>} [{ songId, title, tongThoiLuong, soDoan }]
   */
  async layDanhSachBai() {
    const res = await fetch(`${this.SERVER}/list`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.danhSach || [];
  }

  // ----------------------------------------------------------
  //  [2] GỬI DỮ LIỆU LÊN SERVER (MENU lưu)
  // ----------------------------------------------------------

  /**
   * Lưu / cập nhật thông tin tổng thể bài hát
   * @param {Object} info - { songId, title, totalDurationSec, note? }
   * @returns {Promise<Object>} { ok, message }
   */
  async luuThongTinBai({ songId, title, totalDurationSec, note }) {
    if (!songId) throw new Error("Thiếu songId");
    const res = await fetch(`${this.SERVER}/set-song-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId, title, totalDurationSec, note })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  /**
   * Thêm 1 đoạn khóa theo thời gian — MENU phân tích xong thì gọi hàm này
   * @param {Object} seg - { songId, startSec, endSec, key, mode="major", weight=1.0 }
   *   - mode: "major" hoặc "minor" (tiếng Anh chuẩn, KHÔNG cần đổi)
   * @returns {Promise<Object>} { ok, message, segment }
   */
  async themDoanKhoa({ songId, startSec, endSec, key, mode = "major", weight = 1.0 }) {
    if (!songId || startSec === undefined || !endSec || !key) {
      throw new Error("Thiếu thông tin: songId, startSec, endSec, key");
    }
    if (startSec >= endSec) throw new Error("startSec phải nhỏ hơn endSec");
    const res = await fetch(`${this.SERVER}/add-segment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId, startSec, endSec, key, mode, weight })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ----------------------------------------------------------
  //  [3] TIỆN ÍCH — TỰ ĐỘNG HÓA TOÀN BỘ QUY TRÌNH
  // ----------------------------------------------------------

  /**
   * Đồng bộ 1 bài: tải dữ liệu cũ + lưu thông tin mới + thêm tất cả đoạn khóa
   * Dùng 1 lần khi MENU phân tích xong 1 bài -> đẩy toàn bộ lên server
   * @param {Object} payload - { songId, title, totalDurationSec, doans: [{startSec, endSec, key, mode}] }
   * @returns {Promise<Object>} { daLuuThongTin, soDoanDaThem }
   */
  async dongBoBai({ songId, title, totalDurationSec, doans = [] }) {
    // 1. Lưu thông tin bài
    const luuTT = await this.luuThongTinBai({ songId, title, totalDurationSec });

    // 2. Thêm từng đoạn khóa
    let soDoanDaThem = 0;
    for (const d of doans) {
      try {
        await this.themDoanKhoa({ songId, ...d });
        soDoanDaThem++;
      } catch (e) {
        console.warn("Bỏ qua đoạn lỗi:", d, e.message);
      }
    }

    return { daLuuThongTin: luuTT.ok, soDoanDaThem };
  }

  /**
   * Khởi tạo bảng dữ liệu (chỉ cần gọi 1 lần đầu tiên)
   * @returns {Promise<Object>} { ok, message }
   */
  async khoiTaoBang() {
    const res = await fetch(`${this.SERVER}/init`);
    return await res.json();
  }
}

// Xuất module — dùng được cả ES module và browser global
if (typeof module !== "undefined" && module.exports) {
  module.exports = { MenuKeyClient };
}
if (typeof window !== "undefined") {
  window.MenuKeyClient = MenuKeyClient;
}
