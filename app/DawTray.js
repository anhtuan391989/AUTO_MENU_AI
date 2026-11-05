/**
 * app/DawTray.js — HIDE-DAW-01
 * Quản lý "Ẩn DAW xuống khay thông báo": ẩn cửa sổ DAW đang chạy (WindowHider) + biểu tượng khay hệ thống (Tray) có menu Hiện DAW / Ẩn DAW.
 * Không require("electron") ở đây: Tray/Menu/nativeImage được tiêm vào => test được bằng đối tượng giả. KHÔNG BAO GIỜ throw ra ngoài.
 * DAW cần ẩn = file .exe đã cấu hình trong Setup (selectedDAWPath, nếu trống thì startupPaths.dawExecutable). Các cửa sổ đã ẩn được ghi vào
 * file trạng thái trong thư mục dữ liệu app để vẫn "Hiện DAW" được sau khi mở lại Menu. Thoát Menu khi DAW đang ẩn => tự hiện lại DAW (không bỏ DAW vô hình).
 */
'use strict';

const TRAY_ICON_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQElEQVR4nGNgoAl4+v8/Vky2RqIMIlYzTkPQFLAJK6Fg/AYQ0EzYECI0YzVkmBpAXiBSHI1USUgUJ2ViDKIFAACAY4MoRAMNKgAAAABJRU5ErkJggg=='; // chấm tròn 16x16 (nền xanh, lõi tối) — không cần file ảnh ngoài

function createDawTrayManager({ Tray, Menu, nativeImage, readSettings, stateFile, fs, windowHider, log, openMenu }) {
    let tray = null;
    let saved = null; // { exePath, handles:number[] } khi DAW đang bị ẩn
    let busy = false; // A98: đang có 1 thao tác ẩn/hiện chạy => bấm dồn dập không chồng nhiều PowerShell lên nhau
    const say = (m, e) => { try { (log || console.log)('[DawTray] ' + m, e || ''); } catch (x) { /* bỏ qua */ } };

    function loadState() {
        try {
            if (!stateFile || !fs.existsSync(stateFile)) return null;
            const o = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            if (o && typeof o.exePath === 'string' && Array.isArray(o.handles) && o.handles.length) return { exePath: o.exePath, handles: o.handles.filter((n) => Number.isSafeInteger(n) && n > 0) };
        } catch (e) { say('đọc trạng thái lỗi (bỏ qua)', e && e.message); }
        return null;
    }
    function saveState() {
        try {
            if (!stateFile) return;
            if (saved) fs.writeFileSync(stateFile, JSON.stringify(saved), 'utf8');
            else if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
        } catch (e) { say('ghi trạng thái lỗi (bỏ qua)', e && e.message); }
    }
    saved = loadState();

    function configuredExe() {
        try {
            const s = readSettings() || {};
            const a = typeof s.selectedDAWPath === 'string' ? s.selectedDAWPath.trim() : '';
            const b = s.startupPaths && typeof s.startupPaths.dawExecutable === 'string' ? s.startupPaths.dawExecutable.trim() : '';
            return a || b || '';
        } catch (e) { return ''; }
    }

    function buildMenu() {
        return Menu.buildFromTemplate([
            { label: 'Hiện DAW', click: () => { show(() => {}); } },
            { label: 'Ẩn DAW', click: () => { hide(() => {}); } },
            { label: 'Mở AUTO MENU AI', click: () => { try { if (typeof openMenu === 'function') openMenu(); } catch (e) { say('mở Menu lỗi', e && e.message); } } }
        ]);
    }
    function ensureTray() {
        if (tray) return;
        try {
            const img = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, 'base64'));
            tray = new Tray(img);
            tray.setToolTip('AUTO MENU AI — DAW đang ẩn (bấm đúp để hiện)');
            tray.setContextMenu(buildMenu());
            tray.on('double-click', () => { show(() => {}); });
        } catch (e) { say('tạo khay lỗi', e && e.message); tray = null; }
    }
    function dropTray() {
        try { if (tray) tray.destroy(); } catch (e) { /* bỏ qua */ }
        tray = null;
    }
    // Khôi phục khay nếu lần trước thoát khi DAW còn ẩn (hiếm: app bị tắt đột ngột).
    function restoreTrayIfHidden() { if (saved) ensureTray(); }

    function status() {
        const exe = configuredExe();
        return { configured: !!exe, exePath: exe, hidden: !!saved, trayVisible: !!tray };
    }

    // A98 — trạng thái 3 mức cho Menu: not_configured | not_running | visible | hidden (+ busy). Kiểm tra tiến trình DAW thật bằng probe();
    // nếu đang ghi "ẩn" mà DAW đã thoát (tiến trình không còn) thì tự xoá trạng thái ẩn + gỡ khay (không để khay treo). probe lỗi => giữ nguyên, running = null.
    function statusAsync(cb) {
        let called = false; const done = (v) => { if (called) return; called = true; try { cb(v); } catch (e) { /* bỏ qua */ } };
        try {
            const base = status(); const exe = base.exePath;
            if (!exe || typeof windowHider.probe !== 'function') { done({ ...base, running: null, state: !exe ? 'not_configured' : (base.hidden ? 'hidden' : 'visible'), busy }); return; }
            windowHider.probe(exe, (p) => {
                try {
                    // A99: KHÔNG bao giờ báo not_running khi chưa xác minh được. unknown / path_mismatch giữ nguyên trạng thái ẩn đang lưu (không xoá khay).
                    if (!p || p.state === 'unknown' || (!p.ok && p.state !== 'not_running')) {
                        const reason = (p && p.reason) || 'UNKNOWN';
                        say('chưa xác minh được tiến trình DAW: ' + reason + (p && p.detail ? ' — ' + p.detail : ''));
                        done({ ...base, running: null, state: 'unknown', busy, reason, detail: describeIdentity(reason, p, exe) }); return;
                    }
                    if (p.state === 'path_mismatch') {
                        say('DAW cùng tên đang chạy ở đường dẫn khác: ' + (p.others || []).join(' | '));
                        done({ ...base, running: null, state: 'path_mismatch', busy, reason: 'DAW_AT_DIFFERENT_PATH', others: p.others || [], detail: describeIdentity('DAW_AT_DIFFERENT_PATH', p, exe) }); return;
                    }
                    if (p.state === 'not_running' && saved) { saved = null; saveState(); dropTray(); } // chỉ xoá trạng thái ẩn khi ĐÃ XÁC MINH tiến trình không còn
                    const st = status();
                    done({ ...st, running: p.state === 'running', state: p.state === 'not_running' ? 'not_running' : (st.hidden ? 'hidden' : 'visible'), busy });
                } catch (e) { done({ ...base, running: null, state: 'unknown', busy }); }
            });
        } catch (e) { done({ configured: false, exePath: '', hidden: false, trayVisible: false, running: null, state: 'unknown', busy }); }
    }

    // Lời giải thích tiếng Việt cho các trường hợp KHÔNG xác minh được / lệch đường dẫn (hiện ở Setup, kèm bằng chứng để người dùng đối chiếu).
    function describeIdentity(reason, p, exe) {
        if (reason === 'DAW_AT_DIFFERENT_PATH') return 'Thấy tiến trình cùng tên đang chạy nhưng ở ĐƯỜNG DẪN KHÁC: ' + ((p && p.others) || []).join(' | ') + ' — khác với đường dẫn đã chọn (' + exe + '). Hãy chọn lại đúng file DAW ở AI > Đường dẫn & khởi động.';
        if (reason === 'PROCESS_PATH_UNREADABLE') return 'Thấy tiến trình cùng tên nhưng Windows không cho đọc đường dẫn của nó (có thể DAW chạy quyền Administrator). Chưa xác minh được nên KHÔNG kết luận "chưa chạy".';
        if (reason === 'PROCESS_QUERY_FAILED') return 'Không truy vấn được danh sách tiến trình của Windows' + (p && p.detail ? ': ' + p.detail : '') + '. Chưa xác minh được trạng thái DAW.';
        if (reason === 'UNSUPPORTED_PLATFORM') return 'Chức năng này chỉ chạy trên Windows.';
        return 'Chưa xác minh được trạng thái DAW (' + reason + ').';
    }

    function hide(cb) {
        try {
            if (busy) { cb({ ok: false, state: 'busy', message: 'Đang xử lý thao tác trước, thử lại sau giây lát.' }); return; }
            if (saved) { cb({ ok: true, state: 'hidden', message: 'DAW đang được ẩn rồi.' }); return; }
            const exe = configuredExe();
            if (!exe) { cb({ ok: false, state: 'not_configured', message: 'Chưa chọn file chạy của DAW. Vào Setup > AI > "Đường dẫn & khởi động" để chọn.' }); return; }
            busy = true;
            windowHider.hide(exe, (r) => {
                busy = false;
                try {
                    if (r.ok) {
                        saved = { exePath: exe, handles: r.handles };
                        saveState(); ensureTray();
                        cb({ ok: true, state: 'hidden', message: 'Đã ẩn DAW xuống khay thông báo (biểu tượng chấm tròn xanh cạnh đồng hồ). Bấm đúp biểu tượng để hiện lại.' });
                    } else if (r.state === 'not_found') cb({ ok: false, state: 'not_found', message: 'Không thấy DAW đang chạy (đúng file đã chọn). Hãy mở DAW trước.' });
                    else if (r.reason === 'UNSUPPORTED_PLATFORM') cb({ ok: false, state: 'unsupported', message: 'Chức năng này chỉ chạy trên Windows.' });
                    else if (r.reason === 'NO_WINDOW_FOUND') cb({ ok: false, state: 'failed', message: 'Thấy DAW đang chạy nhưng không có cửa sổ nào để ẩn (có thể đã ẩn sẵn).' });
                    else if (r.reason === 'DAW_NOT_RESPONDING') cb({ ok: false, state: 'failed', message: 'DAW đang không phản hồi (Not Responding) nên chưa ẩn được. Chờ DAW xử lý xong rồi thử lại.' });
                    else if (r.reason === 'PROCESS_PATH_UNREADABLE' || r.reason === 'DAW_AT_DIFFERENT_PATH' || r.reason === 'PROCESS_QUERY_FAILED') cb({ ok: false, state: 'failed', message: describeIdentity(r.reason, r, exe) });
                    else if (r.reason === 'HIDE_NOT_APPLIED') cb({ ok: false, state: 'failed', message: 'Đã gửi lệnh ẩn nhưng cửa sổ DAW vẫn đang hiện — chưa ẩn được.' });
                    else cb({ ok: false, state: 'failed', message: 'Không ẩn được DAW: ' + (r.reason || 'lỗi không rõ') });
                } catch (e) { cb({ ok: false, state: 'failed', message: String((e && e.message) || e) }); }
            });
        } catch (e) { busy = false; cb({ ok: false, state: 'failed', message: String((e && e.message) || e) }); }
    }

    function show(cb) {
        try {
            if (busy) { cb({ ok: false, state: 'busy', message: 'Đang xử lý thao tác trước, thử lại sau giây lát.' }); return; }
            if (!saved) { cb({ ok: true, state: 'visible', message: 'DAW không bị ẩn.' }); return; }
            const cur = saved;
            busy = true;
            windowHider.show(cur.exePath, cur.handles, (r) => {
                busy = false;
                try {
                    if (r.ok) { saved = null; saveState(); dropTray(); cb({ ok: true, state: 'visible', message: 'Đã hiện lại DAW.' }); }
                    else if (r.state === 'not_found') { // DAW đã tắt / cửa sổ không còn => bỏ trạng thái ẩn, không để khay treo mãi
                        saved = null; saveState(); dropTray();
                        cb({ ok: false, state: 'not_found', message: 'DAW đã đóng hoặc cửa sổ không còn — đã xoá trạng thái ẩn.' });
                    } else if (r.reason === 'DAW_NOT_RESPONDING') cb({ ok: false, state: 'failed', message: 'DAW đang không phản hồi (Not Responding) nên chưa hiện được. Giữ nguyên trạng thái ẩn, thử lại sau.' });
                    else if (r.reason === 'PROCESS_PATH_UNREADABLE' || r.reason === 'DAW_AT_DIFFERENT_PATH' || r.reason === 'PROCESS_QUERY_FAILED') cb({ ok: false, state: 'failed', message: describeIdentity(r.reason, r, cur.exePath) + ' Giữ nguyên trạng thái ẩn.' });
                    else cb({ ok: false, state: 'failed', message: 'Không hiện được DAW: ' + (r.reason || 'lỗi không rõ') });
                } catch (e) { cb({ ok: false, state: 'failed', message: String((e && e.message) || e) }); }
            });
        } catch (e) { busy = false; cb({ ok: false, state: 'failed', message: String((e && e.message) || e) }); }
    }

    // Gọi lúc thoát app: hiện lại DAW (đồng bộ) để không bỏ DAW vô hình.
    function restoreOnQuit() {
        try {
            if (!saved) return;
            windowHider.showSync(saved.exePath, saved.handles);
            saved = null; saveState(); dropTray();
        } catch (e) { say('khôi phục khi thoát lỗi (bỏ qua)', e && e.message); }
    }

    return { hide, show, status, statusAsync, restoreOnQuit, restoreTrayIfHidden, _internals: () => ({ saved, tray }) };
}

module.exports = { createDawTrayManager, TRAY_ICON_PNG_BASE64 };
