// ============================================================
// CaoDo_YIN.js — Phát hiện cao độ (f0) bằng thuật toán YIN
// Chính xác hơn FFT, giảm 60-80% lỗi nhầm bát
// ============================================================
const PDL = require('./PDL_theoDoi');

class PhatHienCaoDo {
  constructor(tanSoLayMau = 44100) {
    this.tanSoLayMau = tanSoLayMau;
    this.nguongQuyetDinh = 0.1;
  }

  // Bước 1: Hàm khác biệt
  hamKhacBiet(khung) {
    const N = khung.length;
    const ketQua = new Float32Array(N);
    for (let tau = 0; tau < N / 2; tau++) {
      let tong = 0;
      for (let i = 0; i < N / 2 - tau; i++) {
        const hieu = khung[i] - khung[i + tau];
        tong += hieu * hieu;
      }
      ketQua[tau] = tong;
    }
    return ketQua;
  }

  // Bước 2: Chuẩn hóa trung bình tích lũy (CMNDF)
  chuanHoaTrungBinh(giaTri) {
    const N = giaTri.length;
    const ketQua = new Float32Array(N);
    ketQua[0] = 1;
    let tongTichLuy = 0;
    for (let tau = 1; tau < N; tau++) {
      tongTichLuy += giaTri[tau];
      ketQua[tau] = giaTri[tau] / (tongTichLuy / tau);
    }
    return ketQua;
  }

  // Bước 3: Tìm tau đầu tiên dưới ngưỡng → ra tần số cơ bản
  layTanSoCoBan(giaTriChuanHoa, tanSoThapNhat = 60, tanSoCaoNhat = 1500) {
    const tauNhoNhat = Math.floor(this.tanSoLayMau / tanSoCaoNhat);
    const tauLonNhat = Math.ceil(this.tanSoLayMau / tanSoThapNhat);
    for (let tau = tauNhoNhat; tau <= tauLonNhat; tau++) {
      if (giaTriChuanHoa[tau] < this.nguongQuyetDinh) {
        while (tau + 1 <= tauLonNhat && giaTriChuanHoa[tau + 1] < giaTriChuanHoa[tau]) tau++;
        return this.tanSoLayMau / tau;
      }
    }
    return null; // Không phát hiện được
  }

  // Hàm chính — gọi mỗi khung âm thanh
  xuLy(khungAmThanh) {
    const t0 = PDL.batDau();
    const khacBiet = this.hamKhacBiet(khungAmThanh);
    const chuanHoa = this.chuanHoaTrungBinh(khacBiet);
    const tanSoCoBan = this.layTanSoCoBan(chuanHoa);
    PDL.ketThuc(t0);
    return tanSoCoBan;
  }
}

module.exports = PhatHienCaoDo;