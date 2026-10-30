// modules/NângCao/PDL_theoDoi.js — Theo dõi độ trễ PDL (browser-compatible)
(function () {
  class PDLTheoDoi {
    constructor() { this.lichSu = []; this.boNhoToiDa = 30; this.nguongCanhBao = 100; }
    batDau() { return performance.now(); }
    ketThuc(t0) { const p = performance.now() - t0; this.lichSu.push(p); if (this.lichSu.length > this.boNhoToiDa) this.lichSu.shift(); return p; }
    layTrungBinh() { return this.lichSu.length ? this.lichSu.reduce((a, b) => a + b, 0) / this.lichSu.length : 0; }
    dangTreQua() { return this.layTrungBinh() > this.nguongCanhBao; }
    layTrangThai() { const tb = this.layTrungBinh(); return { doTreMs: tb.toFixed(1), capDo: tb < 50 ? 'tot' : tb < 100 ? 'chapNhan' : 'canhBao', thongBao: tb < 50 ? 'Tối ưu' : tb < 100 ? 'Chấp nhận được' : 'Quá cao' }; }
  }
  window.NangCao_PDL = new PDLTheoDoi();
})();
