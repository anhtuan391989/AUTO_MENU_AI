"use strict";

/* ==========================================================
   EFFECTS WINDOW — "Bảng Hiệu Ứng Độc Lập" là CỬA SỔ RIÊNG (không còn là lớp phủ trong menu).

   - Không viền (frameless), kéo tự do bằng thanh tiêu đề (xem ui/effects.html).
   - KHÔNG có parent: không bị gắn chặt vào menu, không chiếm chỗ trong menu.
   - Checkbox "Luôn hiển thị" (Always on Top):
       BẬT  -> cửa sổ luôn nổi và VẪN HIỆN khi menu thu xuống taskbar.
       TẮT  -> cửa sổ thường; tự ẩn khi menu thu xuống taskbar, tự hiện lại khi menu mở lại.
   - Trạng thái "Luôn hiển thị" chỉ sống trong phiên (không lưu file), giống Always on Top của menu.
   - Module thuần Node (BrowserWindow/screen được truyền vào) để test được bằng đối tượng giả.
   ========================================================== */

const WIDTH = 440;
const HEIGHT = 250;
const GAP = 10;

// Vị trí mở lần đầu: ngay DƯỚI menu nếu còn chỗ trong vùng làm việc, nếu không thì góc phải-trên
// vùng làm việc. Luôn kẹp trong workArea. Người dùng kéo đi đâu cũng được sau đó.
function computeInitialPosition(mainBounds, workArea) {
    const wa = workArea || { x: 0, y: 0, width: 1920, height: 1080 };
    let x;
    let y;
    if (mainBounds && Number.isFinite(mainBounds.x)) {
        x = mainBounds.x + 20;
        y = mainBounds.y + mainBounds.height + GAP;
        if (y + HEIGHT > wa.y + wa.height) {
            x = wa.x + wa.width - WIDTH - 20;
            y = wa.y + 20;
        }
    } else {
        x = wa.x + wa.width - WIDTH - 20;
        y = wa.y + 20;
    }
    x = Math.max(wa.x, Math.min(x, wa.x + wa.width - WIDTH));
    y = Math.max(wa.y, Math.min(y, wa.y + wa.height - HEIGHT));
    return { x: Math.round(x), y: Math.round(y) };
}

function createEffectsWindowManager({ BrowserWindow, screen, getMainWin, preloadPath, htmlPath }) {
    let win = null;
    let alwaysOnTop = false;
    let boundMain = null;

    function alive(w) {
        try { return !!w && !w.isDestroyed(); } catch { return false; }
    }

    // --- Theo dõi menu: chỉ ẩn/hiện cửa sổ hiệu ứng KHI KHÔNG bật "Luôn hiển thị" ---
    function onMainMinimize() {
        if (alive(win) && !alwaysOnTop) {
            try { win.hide(); } catch (err) { console.error("effects hide lỗi:", err); }
        }
    }

    function onMainRestore() {
        if (alive(win) && !alwaysOnTop) {
            try { if (!win.isVisible()) win.show(); } catch (err) { console.error("effects show lỗi:", err); }
        }
    }

    function onMainClosed() {
        close();
    }

    function bindMain(main) {
        if (!alive(main)) return;
        boundMain = main;
        main.on("minimize", onMainMinimize);
        main.on("restore", onMainRestore);
        main.on("show", onMainRestore);
        main.once("closed", onMainClosed);
    }

    function unbindMain() {
        const main = boundMain;
        boundMain = null;
        if (!main) return;
        try {
            main.removeListener("minimize", onMainMinimize);
            main.removeListener("restore", onMainRestore);
            main.removeListener("show", onMainRestore);
            main.removeListener("closed", onMainClosed);
        } catch { /* cửa sổ menu có thể đã bị huỷ — bỏ qua */ }
    }

    function open() {
        if (alive(win)) {
            try {
                if (!win.isVisible()) win.show();
                win.focus();
            } catch (err) { console.error("effects focus lỗi:", err); }
            return { ok: true, open: true };
        }

        const main = getMainWin();
        let pos;
        try {
            const mainBounds = alive(main) ? main.getBounds() : null;
            const display = mainBounds && screen && screen.getDisplayMatching
                ? screen.getDisplayMatching(mainBounds)
                : (screen && screen.getPrimaryDisplay ? screen.getPrimaryDisplay() : null);
            pos = computeInitialPosition(mainBounds, display && display.workArea);
        } catch (err) {
            console.error("effects tính vị trí lỗi (dùng mặc định):", err);
            pos = computeInitialPosition(null, null);
        }

        win = new BrowserWindow({
            width: WIDTH,
            height: HEIGHT,
            x: pos.x,
            y: pos.y,
            frame: false,
            resizable: false,
            maximizable: false,
            minimizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            show: false,
            backgroundColor: "#010813",
            title: "Bảng Hiệu Ứng",
            webPreferences: {
                preload: preloadPath,
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        const thisWin = win;
        thisWin.loadFile(htmlPath);
        if (alwaysOnTop) {
            try { thisWin.setAlwaysOnTop(true); } catch (err) { console.error("effects setAlwaysOnTop lỗi:", err); }
        }
        thisWin.once("ready-to-show", () => {
            try { if (alive(thisWin)) thisWin.show(); } catch (err) { console.error("effects show lỗi:", err); }
        });
        thisWin.on("closed", () => {
            if (win === thisWin) {
                win = null;
                unbindMain();
            }
        });

        bindMain(main);
        return { ok: true, open: true };
    }

    function close() {
        const w = win;
        win = null;
        unbindMain();
        if (alive(w)) {
            try { w.close(); } catch (err) { console.error("effects close lỗi:", err); }
        }
        return { ok: true, open: false };
    }

    function toggle() {
        return alive(win) ? close() : open();
    }

    function getAlwaysOnTop() {
        return { ok: true, value: alwaysOnTop };
    }

    function setAlwaysOnTop(enabled) {
        if (typeof enabled !== "boolean") {
            return { ok: false, value: alwaysOnTop, error: "Giá trị không hợp lệ" };
        }
        alwaysOnTop = enabled;
        if (alive(win)) {
            try {
                win.setAlwaysOnTop(enabled);
                if (!enabled) {
                    // Vừa tắt "Luôn hiển thị" trong lúc menu đang nằm dưới taskbar -> ẩn theo menu.
                    const main = getMainWin();
                    if (alive(main) && main.isMinimized()) win.hide();
                }
            } catch (err) {
                console.error("effects setAlwaysOnTop lỗi:", err);
                return { ok: false, value: alwaysOnTop, error: String((err && err.message) || err) };
            }
        }
        return { ok: true, value: alwaysOnTop };
    }

    // Chỉ chấp nhận lệnh điều khiển từ chính cửa sổ hiệu ứng.
    function isFromEffects(sender) {
        return alive(win) && !!sender && sender === win.webContents;
    }

    // Chỉ chấp nhận lệnh mở/đóng từ cửa sổ menu chính.
    function isFromMain(sender) {
        const main = getMainWin();
        return alive(main) && !!sender && sender === main.webContents;
    }

    return { open, close, toggle, getAlwaysOnTop, setAlwaysOnTop, isFromEffects, isFromMain, isOpen: () => alive(win) };
}

module.exports = { createEffectsWindowManager, computeInitialPosition, WIDTH, HEIGHT };
