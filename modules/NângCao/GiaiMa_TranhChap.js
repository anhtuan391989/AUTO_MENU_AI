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
