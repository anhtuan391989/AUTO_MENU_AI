// ============================================================
//  AUTO_MENU_AI — Ví dụ tích hợp thực tế vào MENU
//  Copy các đoạn dưới đây, điều chỉnh cho khớp code MENU của bạn
// ============================================================

// BƯỚC 1: Khởi tạo client — chỉ làm 1 lần
const { MenuKeyClient } = require('./menu-api-client.js');
// Hoặc trong browser: <script src="menu-api-client.js"></script> -> window.MenuKeyClient

const keyClient = new MenuKeyClient("https://menu-key-server.matuotluuly.workers.dev");

// ============================================================
//  TRƯỜNG HỢP 1: MENU mở bài YouTube -> Tải dữ liệu cũ từ server
// ============================================================
async function khiMoBaiHat(songId) {
  try {
    const data = await keyClient.layThongTinBai(songId);

    // Hiển thị trên giao diện MENU
    console.log("Tên bài:", data.thongTin.title);
    console.log("Số đoạn khóa:", data.tongDoan);
    console.log("Các đoạn:", data.doans);
    // data.doans[i] = { startSec, endSec, tu, den, khoa, mode, cheDo }
    //   mode = "major"/"minor" (tiếng Anh) -> dùng cho Auto-Tune
    //   cheDo = "Truong"/"Phu" (tiếng Việt) -> hiển thị cho người dùng

    // Nếu đã có dữ liệu -> KHÔNG cần phân tích lại từ đầu!
    if (data.tongDoan > 0) {
      console.log("Đã có dữ liệu sẵn, dùng luôn!");
      apDungDanhSachDoan(data.doans);
      return;
    }

    // Chưa có -> MENU tiến hành phân tích khóa
    console.log("Chưa có dữ liệu, bắt đầu phân tích...");
    batDauPhanTich(songId);

  } catch (err) {
    console.error("Lỗi tải dữ liệu:", err.message);
  }
}

// ============================================================
//  TRƯỜNG HỢP 2: MENU phân tích xong 1 đoạn -> Gửi lên server
// ============================================================
async function khiPhanTichXongDoan(songId, doanMoi) {
  // doanMoi = { startSec: 0, endSec: 185, key: "D", mode: "major" }
  try {
    const ketQua = await keyClient.themDoanKhoa({ songId, ...doanMoi });
    console.log("Đã lưu đoạn:", ketQua.segment);
  } catch (err) {
    console.error("Lỗi lưu đoạn:", err.message);
  }
}

// ============================================================
//  TRƯỜNG HỢP 3: Phát nhạc -> mỗi giây tra khóa -> đặt Auto-Tune
// ============================================================
let khoaHienTai = null;

async function khiPhatNhac(songId, giayHienTai) {
  try {
    const kq = await keyClient.layKhoaTaiGiay(songId, giayHienTai);

    if (kq.found) {
      // Chỉ đổi Auto-Tune khi khóa THỰC SỰ thay đổi (tránh flicker)
      const khoaMoi = kq.key + " " + kq.mode;
      if (khoaMoi !== khoaHienTai) {
        khoaHienTai = khoaMoi;
        // Gửi thẳng vào Auto-Tune — kq.mode đã là "major"/"minor" tiếng Anh
        datAutoTune(kq.key, kq.mode);
        console.log(`[${kq.thoiGian}] Đổi khóa: ${kq.key} ${kq.modeDisplay}`);
      }
    }
  } catch (err) {
    console.error("Lỗi tra khóa:", err.message);
  }
}

// ============================================================
//  TRƯỜNG HỢP 4: Đồng bộ toàn bộ 1 bài lên server (1 lần)
// ============================================================
async function dongBoToanBoBai(songId, ketQuaPhanTich) {
  // ketQuaPhanTich = { title, totalDurationSec, doans: [{startSec, endSec, key, mode}] }
  try {
    const kq = await keyClient.dongBoBai({
      songId,
      title: ketQuaPhanTich.title,
      totalDurationSec: ketQuaPhanTich.totalDurationSec,
      doans: ketQuaPhanTich.doans
    });
    console.log(`Đã lưu thông tin + ${kq.soDoanDaThem} đoạn khóa`);
  } catch (err) {
    console.error("Lỗi đồng bộ:", err.message);
  }
}

// ============================================================
//  HÀM MÔ PHỎNG — thay bằng code thực tế của MENU
// ============================================================
function apDungDanhSachDoan(doans) { /* TODO: hiển thị trên MENU */ }
function batDauPhanTich(songId) { /* TODO: gọi engine phân tích */ }
function datAutoTune(key, mode) { /* TODO: gửi key+mode vào Auto-Tune/DAW */ }

// ============================================================
//  KHỞI TẠO BẢNG (chạy 1 lần đầu tiên)
// ============================================================
// keyClient.khoiTaoBang().then(console.log);
