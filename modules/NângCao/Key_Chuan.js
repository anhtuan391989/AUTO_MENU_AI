// modules/NângCao/Key_Chuan.js — Xác định Key Krumhansl-Schmuckler (browser-compatible)
(function () {
  const TEN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [5.34, 2.65, 3.53, 4.07, 2.68, 3.90, 2.55, 3.61, 5.44, 2.31, 3.20, 4.12];
  function tq(a, b) { const n = a.length; const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let tu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; tu += x * y; da += x * x; db += y * y; } return tu / Math.sqrt(da * db || 1e-10); }
  function xoay(m, s) { s = ((s % 12) + 12) % 12; return m.slice(12 - s).concat(m.slice(0, 12 - s)); }
  function phanTichKey(chroma) { const uv = []; for (let g = 0; g < 12; g++) { uv.push({ key: TEN[g], mode: 'truong', diem: tq(chroma, xoay(MAJ, g)) }); uv.push({ key: TEN[g] + 'm', mode: 'thu', diem: tq(chroma, xoay(MIN, g)) }); } uv.sort((a, b) => b.diem - a.diem); return { nhat: uv[0], nhi: uv[1], chenhLech: uv[0].diem - uv[1].diem, moHo: (uv[0].diem - uv[1].diem) < 0.05 }; }
  window.NangCao_Key = { phanTichKey, TEN_NOT: TEN };
})();
