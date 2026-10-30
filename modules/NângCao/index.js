// ============================================================
// index.js — Module Nâng Cao (gom PDL + pt.live)
// Cách dùng:
//   const NangCao = require('./modules/NângCao');
//   NangCao.batCheDo(true);          // bật chế độ nâng cao
//   const kq = NangCao.xuLy(khung, chroma, bass);
//   NangCao.layTrangThaiPDL();       // xem độ trễ
// ============================================================
const PhatHienCaoDo = require('./CaoDo_YIN');
const GiaiMaTranhChap = require('./GiaiMa_TranhChap');
const PDL = require('./PDL_theoDoi');

class NangCao {
  constructor(tanSoLayMau = 44100) {
    this.tanSoLayMau = tanSoLayMau;
    this.detectorCaoDo = new PhatHienCaoDo(tanSoLayMau);
    this.giaiMa = new GiaiMaTranhChap();
    this.dangBat = false; // MẶC ĐỊNH TẮT — bật thủ công
  }

  // Bật / tắt chế độ nâng cao
  batCheDo(trangThai) {
    this.dangBat = !!trangThai;
    return this.dangBat;
  }

  dangHoatDong() {
    return this.dangBat;
  }

  // Hàm chính — gọi mỗi khung âm thanh
  // khungAmThanh: Float32Array (dữ liệu audio)
  // vectorChroma: mảng 12 giá trị (năng lượng mỗi nốt)
  // vectorBass: (tùy chọn) mảng 12 giá trị đã lọc trầm
  xuLy(khungAmThanh, vectorChroma, vectorBass = null) {
    if (!this.dangBat) return null; // Tắt → không can thiệp

    const t0 = PDL.batDau();

    // Bước 1: Phát hiện cao độ f0 bằng YIN
    const tanSoCoBan = this.detectorCaoDo.xuLy(khungAmThanh);

    // Bước 2: Phân giải Key (Krumhansl + 4 lớp chống mơ hồ)
    const ketQua = this.giaiMa.xuLy(vectorChroma, vectorBass);

    const pdl = PDL.ketThuc(t0);

    return {
      tanSoCoBan: tanSoCoBan,
      key: ketQua.keyChon ? ketQua.keyChon.key : null,
      doChinhXac: ketQua.keyChon ? ketQua.keyChon.doChinhXac : 0,
      trangThai: ketQua.trangThai, // roRang | daGiaiMa_Bass | daGiaiMa_LichSu | moHo
      thongBao: ketQua.thongBao || null,
      ungVienThuHai: ketQua.ungVienNhi,
      pdlMs: pdl.toFixed(1),
      trangThaiPDL: PDL.layTrangThai()
    };
  }

  // Xem trạng thái PDL độc lập
  layTrangThaiPDL() {
    return PDL.layTrangThai();
  }
}

// Tạo 1 instance duy nhất dùng chung toàn dự án
const nangCao = new NangCao();
module.exports = nangCao;