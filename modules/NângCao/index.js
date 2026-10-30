// modules/NângCao/index.js — Module chính (browser-compatible)
// LƯU Ý: File này gộp 4 module trên. Nếu bạn dùng NANGCAO_PLUGIN.js thì KHÔNG cần file này.
(function () {
  function waitFor(prop, cb) { if (window[prop]) cb(); else setTimeout(() => waitFor(prop, cb), 50); }
  waitFor('NangCao_PDL', () => waitFor('NangCao_YIN', () => waitFor('NangCao_Key', () => waitFor('NangCao_GiaiMa', () => {
    const giaiMa = new window.NangCao_GiaiMa();
    let bat = false;
    window.NangCao = {
      batCheDo(on) { bat = !!on; return bat; },
      dangHoatDong() { return bat; },
      xuLy(khung, chroma) {
        if (!bat) return null;
        const f0 = new window.NangCao_YIN().xuLy(khung);
        const kq = giaiMa.xuLy(chroma);
        return { f0, key: kq.chon ? kq.chon.key : null, trangThai: kq.trangThai, pdl: window.NangCao_PDL.layTrangThai() };
      },
      layTrangThaiPDL() { return window.NangCao_PDL.layTrangThai(); }
    };
    console.log('[Nâng cao] Module sẵn sàng.');
  }))));
})();
