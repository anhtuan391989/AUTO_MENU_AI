/**
 * app/DawTray.js — HIDE-DAW-01
 * Quản lý "Ẩn DAW xuống khay thông báo": ẩn cửa sổ DAW đang chạy (WindowHider) + biểu tượng khay hệ thống (Tray) có menu Hiện DAW / Ẩn DAW.
 * Không require("electron") ở đây: Tray/Menu/nativeImage được tiêm vào => test được bằng đối tượng giả. KHÔNG BAO GIỜ throw ra ngoài.
 * DAW cần ẩn = file .exe đã cấu hình trong Setup (selectedDAWPath, nếu trống thì startupPaths.dawExecutable). Các cửa sổ đã ẩn được ghi vào
 * file trạng thái trong thư mục dữ liệu app để vẫn "Hiện DAW" được sau khi mở lại Menu. Thoát Menu khi DAW đang ẩn => tự hiện lại DAW (không bỏ DAW vô hình).
 */
'use strict';

const TRAY_ICON_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQElEQVR4nGNgoAl4+v8/Vky2RqIMIlYzTkPQFLAJK6Fg/AYQ0EzYECI0YzVkmBpAXiBSHI1USUgUJ2ViDKIFAACAY4MoRAMNKgAAAABJRU5ErkJggg=='; // chấm tròn 16x16 (nền xanh, lõi tối) — không cần file ảnh ngoài

function createDawTrayManager({ Tray, Menu, nativeImage, readSettings, stateFile, fs, windowHider, log }) {
    let tray = null;
    let saved = null; // { exePath, handles:number[] } khi DAW đang bị ẩn
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
            { label: 'Ẩn DAW', click: () => { hide(() => {}); } }
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

    function hide(cb) {
        try {
            if (saved) { cb({ ok: true, state: 'hidden', message: 'DAW đang được ẩn rồi.' }); return; }
            const exe = configuredExe();
            if (!exe) { cb({ ok: false, state: 'not_configured', message: 'Chưa chọn file chạy của DAW. Vào Setup > AI > "Đường dẫn & khởi động" để chọn.' }); return; }
            windowHider.hide(exe, (r) => {
                try {
                    if (r.ok) {
                        saved = { exePath: exe, handles: r.handles };
                        saveState(); ensureTray();
                        cb({ ok: true, state: 'hidden', message: 'Đã ẩn DAW xuống khay thông báo (biểu tượng chấm tròn xanh cạnh đồng hồ). Bấm đúp biểu tượng để hiện lại.' });
                    } else if (r.state === 'not_found') cb({ ok: false, state: 'not_found', message: 'Không thấy DAW đang chạy (đúng file đã chọn). Hãy mở DAW trước.' });
                    else if (r.reason === 'UNSUPPORTED_PLATFORM') cb({ ok: false, state: 'unsupported', message: 'Chức năng này chỉ chạy trên Windows.' });
                    else if (r.reason === 'NO_WINDOW_FOUND') cb({ ok: false, state: 'failed', message: 'Thấy DAW đang chạy nhưng không có cửa sổ nào để ẩn (có thể đã ẩn sẵn).' });
                    else cb({ ok: false, state: 'failed', message: 'Không ẩn được DAW: ' + (r.reason || 'lỗi không rõ') });
                } catch (e) { cb({ ok: false, state: 'failed', message: String((e && e.message) || e) }); }
            });
        } catch (e) { cb({ ok: false, state: 'failed', message: String((e && e.message) || e) }); }
    }

    function show(cb) {
        try {
            if (!saved) { cb({ ok: true, state: 'visible', message: 'DAW không bị ẩn.' }); return; }
            const cur = saved;
            windowHider.show(cur.exePath, cur.handles, (r) => {
                try {
                    if (r.ok) { saved = null; saveState(); dropTray(); cb({ ok: true, state: 'visible', message: 'Đã hiện lại DAW.' }); }
                    else if (r.state === 'not_found') { // DAW đã tắt / cửa sổ không còn => bỏ trạng thái ẩn, không để khay treo mãi
                        saved = null; saveState(); dropTray();
                        cb({ ok: false, state: 'not_found', message: 'DAW đã đóng hoặc cửa sổ không còn — đã xoá trạng thái ẩn.' });
                    } else cb({ ok: false, state: 'failed', message: 'Không hiện được DAW: ' + (r.reason || 'lỗi không rõ') });
                } catch (e) { cb({ ok: false, state: 'failed', message: String((e && e.message) || e) }); }
            });
        } catch (e) { cb({ ok: false, state: 'failed', message: String((e && e.message) || e) }); }
    }

    // Gọi lúc thoát app: hiện lại DAW (đồng bộ) để không bỏ DAW vô hình.
    function restoreOnQuit() {
        try {
            if (!saved) return;
            windowHider.showSync(saved.exePath, saved.handles);
            saved = null; saveState(); dropTray();
        } catch (e) { say('khôi phục khi thoát lỗi (bỏ qua)', e && e.message); }
    }

    return { hide, show, status, restoreOnQuit, restoreTrayIfHidden, _internals: () => ({ saved, tray }) };
}

module.exports = { createDawTrayManager, TRAY_ICON_PNG_BASE64 };
