// ==================================================
// AUTO_MENU_AI — Module Kết Nối Server
// Đường dẫn: AUTO_MENU_AI/menu-api-client.js
// ==================================================

class MenuKeyClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
  }

  async layThongTinBai(songId) {
    const res = await fetch(`${this.serverUrl}/song-full?id=${encodeURIComponent(songId)}`);
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

  async luuThongTinBai(songId, title, tongThoiLuongGiay) {
    const res = await fetch(`${this.serverUrl}/set-song-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId, title, totalDurationSec: tongThoiLuongGiay })
    });
    return await res.json();
  }

  async themDoanKhoa({ songId, startSec, endSec, key, mode = "major" }) {
    const res = await fetch(`${this.serverUrl}/add-segment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId, startSec, endSec, key, mode })
    });
    return await res.json();
  }

  async layKhoaTaiGiay(songId, giayHienTai) {
    const res = await fetch(`${this.serverUrl}/key-at?id=${encodeURIComponent(songId)}&sec=${giayHienTai}`);
    return await res.json();
  }

  async dongBoBai(songId, title, tongThoiLuongGiay, danhSachDoan) {
    await this.luuThongTinBai(songId, title, tongThoiLuongGiay);
    for (const doan of danhSachDoan) {
      await this.themDoanKhoa({ songId, ...doan });
    }
    return { ok: true, tongSoDoan: danhSachDoan.length };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MenuKeyClient };
}