// modules/NângCao/CaoDo_YIN.js — Phát hiện cao độ YIN (browser-compatible)
(function () {
  class PhatHienCaoDo {
    constructor(tanSo = 44100) { this.tanSo = tanSo; this.nguong = 0.1; }
    hamKhacBiet(k) { const N = k.length; const r = new Float32Array(N); for (let t = 0; t < N / 2; t++) { let s = 0; for (let i = 0; i < N / 2 - t; i++) { const d = k[i] - k[i + t]; s += d * d; } r[t] = s; } return r; }
    chuanHoa(g) { const N = g.length; const r = new Float32Array(N); r[0] = 1; let tong = 0; for (let t = 1; t < N; t++) { tong += g[t]; r[t] = g[t] / (tong / t); } return r; }
    layF0(c, lo = 60, hi = 1500) { const t1 = Math.floor(this.tanSo / hi), t2 = Math.ceil(this.tanSo / lo); for (let t = t1; t <= t2 && t < c.length; t++) { if (c[t] < this.nguong) { while (t + 1 < c.length && c[t + 1] < c[t]) t++; return this.tanSo / t; } } return null; }
    xuLy(khung) { const t0 = (window.NangCao_PDL && window.NangCao_PDL.batDau()) || performance.now(); const kb = this.hamKhacBiet(khung); const ch = this.chuanHoa(kb); const f0 = this.layF0(ch); if (window.NangCao_PDL) window.NangCao_PDL.ketThuc(t0); return f0; }
  }
  window.NangCao_YIN = PhatHienCaoDo;
})();
