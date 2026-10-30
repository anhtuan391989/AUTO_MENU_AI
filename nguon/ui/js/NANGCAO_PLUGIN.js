// ============================================================
// NANGCAO_PLUGIN.js — Đã sửa lỗi hiển thị Key
// ============================================================
(function () {
  'use strict';

  const TT = {
    cheDo: 'ai', // 'ai' | 'nangcao' | 'tay'
    keyGoc: null,
    keyNangCao: null,
    pdlTb: 0,
    lichSuPDL: []
  };

  let nutChinh = null;
  let menuLuaChon = null;
  let panel = null;
  let hamGocKeyEngine = null;

  // ====== 1. Tạo giao diện ======
  function taoNutChinh() {
    if (document.getElementById('NC_MAIN_BTN')) return;

    nutChinh = document.createElement('button');
    nutChinh.id = 'NC_MAIN_BTN';
    nutChinh.style = `
      position: fixed; top: 12px; right: 12px; z-index: 999999;
      padding: 10px 18px; background: #2a2a4e; border: none; border-radius: 8px;
      color: #fff; font-weight: bold; font-size: 13px; cursor: pointer;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      transition: all 0.2s ease;
    `;
    nutChinh.innerText = '⚙️ Chế độ dò';
    nutChinh.onclick = hienAnMenu;
    document.body.appendChild(nutChinh);

    taoMenuLuaChon();
    taoPanel();
    
    console.log('%c[Nâng cao] ✅ Đã nạp — Bấm nút góc trên phải để chọn', 'color:#00d4ff; font-weight:bold');
  }

  function taoMenuLuaChon() {
    if (menuLuaChon) menuLuaChon.remove();
    
    menuLuaChon = document.createElement('div');
    menuLuaChon.style = `
      position: fixed; top: 52px; right: 12px; z-index: 999999;
      background: #1a1a2e; border: 1px solid #444; border-radius: 8px;
      padding: 6px 0; min-width: 200px; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      font-family: system-ui, sans-serif; font-size: 13px; display: none;
    `;

    const luaChon = [
      { id: 'ai',       text: '🤖 Dò AI (mặc định)' },
      { id: 'nangcao',  text: '⚡ Dò Nâng cao' },
      { id: 'tay',      text: '✋ Dò tay' }
    ];

    luaChon.forEach(muc => {
      const item = document.createElement('div');
      item.style = `
        padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px;
        ${TT.cheDo === muc.id ? 'background: #2a2a4e;' : ''}
      `;
      item.innerHTML = `
        <span style="width: 18px; text-align: center; font-weight: bold;">
          ${TT.cheDo === muc.id ? '☑' : '☐'}
        </span>
        <span>${muc.text}</span>
      `;
      item.onclick = () => chonCheDo(muc.id);
      menuLuaChon.appendChild(item);
    });

    document.body.appendChild(menuLuaChon);

    document.addEventListener('click', (e) => {
      if (!menuLuaChon.contains(e.target) && e.target !== nutChinh) {
        menuLuaChon.style.display = 'none';
      }
    });
  }

  function hienAnMenu(e) {
    e.stopPropagation();
    menuLuaChon.style.display = menuLuaChon.style.display === 'block' ? 'none' : 'block';
  }

  function chonCheDo(cheDoMoi) {
    TT.cheDo = cheDoMoi;
    capNhatGiaoDien();
    menuLuaChon.style.display = 'none';
    console.log('[Nâng cao] Đã chọn:', cheDoMoi);
    
    // Khi chọn Dò AI → KHÔNG thay đổi gì, trả y như cũ
    if (cheDoMoi === 'ai' && hamGocKeyEngine) {
      window.KeyEngine.estimateKeyFromChroma = hamGocKeyEngine;
      console.log('[Nâng cao] Đã khôi phục KeyEngine gốc hoàn toàn');
    }
    // Khi chọn Nâng cao → bọc lại
    else if (cheDoMoi === 'nangcao' && hamGocKeyEngine) {
      bocLaiHam();
    }
  }

  function taoPanel() {
    panel = document.createElement('div');
    panel.style = `
      position: fixed; right: 12px; top: 160px; z-index: 999999;
      background: rgba(10, 10, 30, 0.95); border: 1px solid #333; border-radius: 8px;
      padding: 14px; min-width: 220px; font-family: system-ui;
      font-size: 12px; color: #ddd; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(panel);
  }

  function capNhatGiaoDien() {
    const bat = TT.cheDo === 'nangcao';
    const mauCheDo = {
      ai: ['🤖 Dò AI', '#4ade80'],
      nangcao: ['⚡ Nâng cao', '#00d4ff'],
      tay: ['✋ Dò tay', '#f97316']
    };
    const [ten, mau] = mauCheDo[TT.cheDo];

    if (nutChinh) {
      nutChinh.style.background = bat ? '#00b4d8' : TT.cheDo === 'tay' ? '#f97316' : '#2a2a4e';
      nutChinh.innerText = ten;
    }

    taoMenuLuaChon();

    if (panel) {
      panel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 10px; font-size: 13px;">Bảng điều khiển</div>
        <div style="display: grid; gap: 6px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Chế độ:</span>
            <span style="color: ${mau}; font-weight: bold;">${ten}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>PDL:</span>
            <span>${TT.pdlTb.toFixed(1)} ms</span>
          </div>
          ${TT.keyGoc ? `
          <div style="display: flex; justify-content: space-between;">
            <span>Key gốc:</span>
            <span style="color: #888;">${TT.keyGoc}</span>
          </div>
          ` : ''}
          ${bat && TT.keyNangCao ? `
          <div style="display: flex; justify-content: space-between; font-weight: bold; color: #00d4ff;">
            <span>Key nâng cao:</span>
            <span>${TT.keyNangCao}</span>
          </div>
          ` : ''}
          ${TT.cheDo === 'tay' ? `
          <div style="color: #f97316; margin-top: 6px; padding-top: 6px; border-top: 1px solid #222;">
            ⚠️ Tự điều khiển Key thủ công
          </div>
          ` : ''}
        </div>
      `;
    }
  }

  // ====== 2. Thuật toán nâng cao ======
  const MAU_TRUONG = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MAU_THU = [5.34, 2.65, 3.53, 4.07, 2.68, 3.90, 2.55, 3.61, 5.44, 2.31, 3.20, 4.12];
  const TEN_NOT = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const CAP_TUONG_DOI = { 'C':'Am','G':'Em','D':'Bm','F':'Dm','A':'F#m','E':'C#m','B':'G#m' };

  function tuongQuan(a, b) {
    const tbA = a.reduce((x, y) => x + y, 0) / 12;
    const tbB = b.reduce((x, y) => x + y, 0) / 12;
    let tu = 0, mA = 0, mB = 0;
    for (let i = 0; i < 12; i++) {
      const da = a[i] - tbA, db = b[i] - tbB;
      tu += da * db;
      mA += da * da;
      mB += db * db;
    }
    return tu / Math.sqrt(mA * mB || 1e-10);
  }

  function phanTichNangCao(chroma) {
    if (!chroma || !Array.isArray(chroma) || chroma.length < 12) {
      return { key: null, moHo: false };
    }
    
    const bass = chroma.map((v, i) => v * (1 + (11 - i) / 12));
    
    let diemMax = -999;
    let keyChon = null;
    let ungVienThu = null;

    for (let goc = 0; goc < 12; goc++) {
      const xT = [...MAU_TRUONG.slice(goc), ...MAU_TRUONG.slice(0, goc)];
      const xTh = [...MAU_THU.slice(goc), ...MAU_THU.slice(0, goc)];
      const dT = tuongQuan(bass, xT);
      const dTh = tuongQuan(bass, xTh);
      
      if (dT > diemMax) {
        diemMax = dT;
        ungVienThu = keyChon;
        keyChon = TEN_NOT[goc] + ' Major';
      }
      if (dTh > diemMax) {
        diemMax = dTh;
        ungVienThu = keyChon;
        keyChon = TEN_NOT[goc] + ' Minor';
      }
    }

    const gocChon = keyChon ? keyChon.replace(' Major','').replace(' Minor','') : '';
    const gocThu = ungVienThu ? ungVienThu.replace(' Major','').replace(' Minor','') : '';
    const moHo = CAP_TUONG_DOI[gocChon] === gocThu || CAP_TUONG_DOI[gocThu] === gocChon;
    
    return { key: keyChon, moHo };
  }

  // ====== 3. Bọc hàm KeyEngine ======
  function bocLaiHam() {
    window.KeyEngine.estimateKeyFromChroma = function (chroma, opts) {
      const t0 = performance.now();
      
      // Gọi hàm gốc → lấy kết quả chuẩn
      const ketQuaGoc = hamGocKeyEngine.call(this, chroma, opts);
      
      // ✅ SỬA: Đảm bảo lưu đúng dạng chuỗi key
      TT.keyGoc = typeof ketQuaGoc === 'string' ? ketQuaGoc : (ketQuaGoc?.key || String(ketQuaGoc));

      // Dò AI → trả y như cũ
      if (TT.cheDo !== 'nangcao') {
        capNhatGiaoDien();
        return ketQuaGoc;
      }

      // Dò Nâng cao → tính song song
      const kqMoi = phanTichNangCao(chroma);
      TT.keyNangCao = kqMoi.key;

      // Đo PDL
      const pdl = performance.now() - t0;
      TT.lichSuPDL.push(pdl);
      if (TT.lichSuPDL.length > 20) TT.lichSuPDL.shift();
      TT.pdlTb = TT.lichSuPDL.reduce((a, b) => a + b, 0) / TT.lichSuPDL.length;

      capNhatGiaoDien();

      // Mơ hồ hoặc lỗi → trả key cũ
      if (!kqMoi.key || kqMoi.moHo) {
        console.log('[Nâng cao] Mơ hồ/không có dữ liệu → giữ key cũ:', TT.keyGoc);
        return ketQuaGoc;
      }

      // Không mơ hồ → dùng key nâng cao
      return kqMoi.key;
    };
  }

  // ====== 4. Khởi động ======
  function khoiTao() {
    taoNutChinh();

    if (!window.KeyEngine || !window.KeyEngine.estimateKeyFromChroma) {
      setTimeout(khoiTao, 300);
      return;
    }

    // Lưu hàm gốc 1 lần duy nhất
    if (!hamGocKeyEngine) {
      hamGocKeyEngine = window.KeyEngine.estimateKeyFromChroma.bind(window.KeyEngine);
      console.log('%c[Nâng cao] ✅ Đã lưu KeyEngine gốc — an toàn hoàn toàn', 'color:#4ade80; font-weight:bold');
    }

    bocLaiHam();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', khoiTao);
  } else {
    khoiTao();
  }
})();