// ============================================================
// Key_Chuan.js — Xác định Key chuẩn bằng Krumhansl-Schmuckler
// So sánh vector Chroma (12 nốt) với 24 mẫu chuẩn
// ============================================================
const TEN_NOT = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Mẫu chuẩn Krumhansl-Schmuckler (đã được kiểm chứng âm nhạc học)
const MAU_CHUAN = {
  truong: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  thu:    [5.34, 2.65, 3.53, 4.07, 2.68, 3.90, 2.55, 3.61, 5.44, 2.31, 3.20, 4.12]
};

// Tính hệ số tương quan Pearson giữa 2 vector
function tuongQuan(a, b) {
  const n = a.length;
  const tbA = a.reduce((x, y) => x + y, 0) / n;
  const tbB = b.reduce((x, y) => x + y, 0) / n;
  let tu = 0, mauA = 0, mauB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - tbA;
    const db = b[i] - tbB;
    tu += da * db;
    mauA += da * da;
    mauB += db * db;
  }
  return tu / Math.sqrt(mauA * mauB || 1e-10);
}

// Xoay vector để căn chỉnh với từng gốc âm
function xoayMang(mang, buoc) {
  return [...mang.slice(buoc), ...mang.slice(0, buoc)];
}

// Hàm chính: nhận vector Chroma (12 giá trị) → trả 2 ứng viên hàng đầu
function phanTichKey(vectorChroma) {
  const ungVien = [];
  for (let goc = 0; goc < 12; goc++) {
    const mauTruong = xoayMang(MAU_CHUAN.truong, goc);
    const mauThu = xoayMang(MAU_CHUAN.thu, goc);
    ungVien.push({
      ten: TEN_NOT[goc],
      cheDo: 'truong',
      diem: tuongQuan(vectorChroma, mauTruong)
    });
    ungVien.push({
      ten: TEN_NOT[goc],
      cheDo: 'thu',
      diem: tuongQuan(vectorChroma, mauThu)
    });
  }
  ungVien.sort((a, b) => b.diem - a.diem);
  const nhat = ungVien[0];
  const nhi = ungVien[1];
  return {
    ungVienNhat: {
      key: nhat.ten + (nhat.cheDo === 'thu' ? 'm' : ''),
      doChinhXac: Math.max(0, nhat.diem)
    },
    ungVienNhi: {
      key: nhi.ten + (nhi.cheDo === 'thu' ? 'm' : ''),
      doChinhXac: Math.max(0, nhi.diem)
    },
    chenhLech: nhat.diem - nhi.diem,
    moHo: (nhat.diem - nhi.diem) < 0.05
  };
}

module.exports = { phanTichKey, TEN_NOT };