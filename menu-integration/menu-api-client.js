// ==================================================
// MENU ↔ SERVER — MODULE KẾT NỐI HOÀN CHỈNH
// Tự động xử lý: gửi, nhận, lỗi, định dạng major/minor
// ==================================================

class MenuKeyClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
  }

  // --------------------------------------------------
  // 1. LẤY DỮ LIỆU ĐÃ LƯU CỦA 1 BÀI
  // Dùng khi: Mở bài hát lên
  // --------------------------------------------------
  async layThongTinBai(songId) {
    const res = await fetch(`${this.serverUrl}/song-full?id=${songId}`);
    if (!res.ok) throw new Error(`Lỗi Server: ${res.status}`);
    const data = await res.json();
    return {
      tonTai: data.tongDoan > 0,
      tongDoan: data.tongDoan,
      thongTin: data.thongTin,
      doans: data.doans || [],
      chuyenTong: data.chuyenTong || []
    };
  }

  // --------------------------------------------------
  // 2. LƯU THÔNG TIN CHUNG BÀI HÁT
  // Dùng khi: Lần đầu phân tích xong
  // --------------------------------------------------
  async luuThongTinBai(songId, title, tongThoiLuongGiay) {
    const res = await fetch(`${this.serverUrl}/set-song-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        songId,
        title,
        totalDurationSec: tongThoiLuongGiay
      })
    });
    return await res.json();
  }

  // --------------------------------------------------
  // 3. THÊM 1 ĐOẠN KHÓA MỚI LÊN SERVER
  // Dùng khi: Phân tích ra khóa mới
  // --------------------------------------------------
  async themDoanKhoa({ songId, startSec, endSec, key, mode = "major" }) {
    // mode luôn gửi: "major" hoặc "minor"
    const res = await fetch(`${this.serverUrl}/add-segment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId, startSec, endSec, key, mode })
    });
    return await res.json();
  }

  // --------------------------------------------------
  // 4. LẤY KHÓA TẠI VỊ TRÍ ĐANG PHÁT
  // Dùng khi: Mỗi giây phát nhạc → đổi Auto-Tune
  // --------------------------------------------------
  async layKhoaTaiGiay(songId, giayHienTai) {
    const res = await fetch(`${this.serverUrl}/key-at?id=${songId}&sec=${giayHienTai}`);
    return await res.json();
  }

  // --------------------------------------------------
  // 5. ĐỒNG BỘ TOÀN BỘ BÀI 1 LẦN
  // Dùng khi: Phân tích xong tất cả đoạn
  // --------------------------------------------------
  async dongBoBai(songId, title, tongThoiLuongGiay, danhSachDoan) {
    await this.luuThongTinBai(songId, title, tongThoiLuongGiay);
    for (const doan of danhSachDoan) {
      await this.themDoanKhoa({ songId, ...doan });
    }
    return { ok: true, tongSoDoan: danhSachDoan.length };
  }
}

// Export để MENU dùng
if (typeof module !== "undefined" && module.exports) {
  module.exports = { MenuKeyClient };
}