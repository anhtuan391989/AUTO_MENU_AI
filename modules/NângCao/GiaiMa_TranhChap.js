<<<<<<< HEAD
// ============================================================
// GiaiMa_TranhChap.js — Giải quyết mơ hồ Trưởng ↔ Thứ tương đối
// (C vs Am, G vs Em, D vs Bm ...)
// 3 lớp kiểm tra: Bass → Lịch sử → Báo mơ hồ
// ============================================================
const { phanTichKey } = require('./Key_Chuan');

// Bảng cặp tương đối (cùng bộ 7 nốt, chỉ khác trọng tâm)
const CAP_TUONG_DOI = {
  'C': 'Am',  'G': 'Em',  'D': 'Bm',  'F': 'Dm',  'A': 'F#m',
  'E': 'C#m', 'B': 'G#m', 'F#': 'D#m','C#': 'A#m','Ab': 'Fm',
  'Eb': 'Cm', 'Bb': 'Gm',
  'Am': 'C',  'Em': 'G',  'Bm': 'D',  'Dm': 'F',  'F#m': 'A',
  'C#m': 'E', 'G#m': 'B', 'D#m': 'F#','A#m': 'C#','Fm': 'Ab',
  'Cm': 'Eb', 'Gm': 'Bb'
};

class GiaiMaTranhChap {
  constructor() {
    this.lichSu = [];
    this.boNhoToiDa = 10; // nhớ 10 khung gần nhất
  }

  ghiNhan(key) {
    this.lichSu.push(key);
    if (this.lichSu.length > this.boNhoToiDa) this.lichSu.shift();
  }

  // Tăng trọng số cho nốt trầm (bass) — bass quyết định chủ âm
  layVectorBass(vectorChroma) {
    const bass = [];
    for (let i = 0; i < 12; i++) {
      bass[i] = vectorChroma[i] * (1 + (12 - i) / 12);
    }
    return bass;
  }

  // Hàm chính — trả key cuối cùng hoặc báo mơ hồ
  xuLy(vectorChroma, vectorBass = null) {
    const ketQua = phanTichKey(vectorChroma);

    // Trường hợp 1: Rõ ràng → trả ngay
    if (!ketQua.moHo) {
      this.ghiNhan(ketQua.ungVienNhat.key);
      return {
        ...ketQua,
        keyChon: ketQua.ungVienNhat,
        trangThai: 'roRang'
      };
    }

    // Trường hợp 2: Mơ hồ nhưng KHÔNG phải cặp tương đối → vẫn chọn cao điểm
    const laCapTuongDoi = CAP_TUONG_DOI[ketQua.ungVienNhat.key] === ketQua.ungVienNhi.key;
    if (!laCapTuongDoi) {
      this.ghiNhan(ketQua.ungVienNhat.key);
      return {
        ...ketQua,
        keyChon: ketQua.ungVienNhat,
        trangThai: 'roRang'
      };
    }

    // Trường hợp 3: Là cặp tương đối → dùng BASS để phân giải
    if (vectorBass) {
      const ketQuaBass = phanTichKey(vectorBass);
      if (!ketQuaBass.moHo) {
        if (ketQuaBass.ungVienNhat.key === ketQua.ungVienNhat.key) {
          return { ...ketQua, keyChon: ketQua.ungVienNhat, trangThai: 'daGiaiMa_Bass' };
        }
        if (ketQuaBass.ungVienNhat.key === ketQua.ungVienNhi.key) {
          return { ...ketQua, keyChon: ketQua.ungVienNhi, trangThai: 'daGiaiMa_Bass' };
        }
      }
    }

    // Trường hợp 4: Dùng LỊCH SỬ — key nào xuất hiện ổn định hơn
    const dem = {};
    this.lichSu.forEach(k => { dem[k] = (dem[k] || 0) + 1; });
    const mangSapXep = Object.entries(dem).sort((a, b) => b[1] - a[1]);
    if (mangSapXep.length > 0) {
      const [keyOnDinh, soLan] = mangSapXep[0];
      if (soLan > this.lichSu.length * 0.5) {
        return {
          ...ketQua,
          keyChon: { key: keyOnDinh, doChinhXac: 0.75 },
          trangThai: 'daGiaiMa_LichSu'
        };
      }
    }

    // Trường hợp 5: Vẫn mơ hồ → TRUNG THỰC báo cả 2, không gửi sai
    return {
      ...ketQua,
      keyChon: null,
      trangThai: 'moHo',
      thongBao: `Không chắc chắn — có thể là ${ketQua.ungVienNhat.key} hoặc ${ketQua.ungVienNhi.key}`
    };
  }
}

module.exports = GiaiMaTranhChap;
=======
// modules/NângCao/GiaiMa_TranhChap.js — Giải mơ hồ Major/Minor tương đối (browser-compatible)
(function () {
  const CAP = { 'C': 'Am', 'G': 'Em', 'D': 'Bm', 'F': 'Dm', 'A': 'F#m', 'E': 'C#m', 'B': 'G#m', 'F#': 'D#m', 'C#': 'A#m', 'Am': 'C', 'Em': 'G', 'Bm': 'D', 'Dm': 'F', 'F#m': 'A', 'C#m': 'E', 'G#m': 'B', 'D#m': 'F#', 'A#m': 'C#' };
  class GiaiMa {
    constructor() { this.lichSu = []; }
    xuLy(chroma) {
      const kq = window.NangCao_Key.phanTichKey(chroma);
      this.lichSu.push(kq.nhat.key); if (this.lichSu.length > 10) this.lichSu.shift();
      if (!kq.moHo) return { ...kq, chon: kq.nhat, trangThai: 'roRang' };
      if (CAP[kq.nhat.key] !== kq.nhi.key) return { ...kq, chon: kq.nhat, trangThai: 'roRang' };
      const dem = {}; this.lichSu.forEach(k => dem[k] = (dem[k] || 0) + 1);
      const sx = Object.entries(dem).sort((a, b) => b[1] - a[1]);
      if (sx.length && sx[0][1] > 5) return { ...kq, chon: { key: sx[0][0], diem: 0.75 }, trangThai: 'daGiaiMa' };
      return { ...kq, chon: null, trangThai: 'moHo', thongBao: `Có thể ${kq.nhat.key} hoặc ${kq.nhi.key}` };
    }
  }
  window.NangCao_GiaiMa = GiaiMa;
})();
>>>>>>> cb7ef22eaad32524c4cf8a3ed6766ee11c5c6d2a
