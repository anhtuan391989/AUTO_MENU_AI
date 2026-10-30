// ============================================================
// PDL_theoDoi.js — Theo dõi & đo độ trễ phát hiện cao độ (ms)
// ============================================================
class PDLTheoDoi {
  constructor() {
    this.lichSu = [];
    this.boNhoToiDa = 30;
    this.nguongCanhBao = 100; // ms — trên mức này cảnh báo
  }

  // Gọi trước khi xử lý khung âm thanh → ghi mốc thời gian
  batDau() {
    return performance.now();
  }

  // Gọi sau khi xử lý xong → trả về PDL (ms)
  ketThuc(thoiDiemBatDau) {
    const pdl = performance.now() - thoiDiemBatDau;
    this.lichSu.push(pdl);
    if (this.lichSu.length > this.boNhoToiDa) this.lichSu.shift();
    return pdl;
  }

  // PDL trung bình 30 khung gần nhất
  layTrungBinh() {
    if (!this.lichSu.length) return 0;
    return this.lichSu.reduce((a, b) => a + b, 0) / this.lichSu.length;
  }

  // Có đang quá chậm không?
  dangTreQua() {
    return this.layTrungBinh() > this.nguongCanhBao;
  }

  // Trạng thái hiển thị cho giao diện
  layTrangThai() {
    const tb = this.layTrungBinh();
    return {
      doTreMs: tb.toFixed(1),
      capDo: tb < 50 ? 'tot' : tb < 100 ? 'chapNhan' : 'canhBao',
      thongBao: tb < 50 ? 'Tối ưu' : tb < 100 ? 'Chấp nhận được' : 'Quá cao — giảm tham số'
    };
  }
}

module.exports = new PDLTheoDoi();