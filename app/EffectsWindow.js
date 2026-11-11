"use strict";

/* ==========================================================
   EFFECTS WINDOW — "Bảng Hiệu Ứng Độc Lập" là CỬA SỔ RIÊNG (không còn là lớp phủ trong menu).

   - Không viền (frameless), kéo tự do bằng thanh tiêu đề (xem ui/effects.html).
   - KHÔNG có parent: không bị gắn chặt vào menu, không chiếm chỗ trong menu.
   - Checkbox "Luôn hiển thị" (Always on Top):
       BẬT  -> cửa sổ luôn nổi và VẪN HIỆN khi menu thu xuống taskbar.
       TẮT  -> cửa sổ thường; tự ẩn khi menu thu xuống taskbar, tự hiện lại khi menu mở lại.
   - Bảng CHỈ MỞ khi người dùng bấm nút HIỆU ỨNG trên Menu. "Luôn hiển thị" chỉ có nghĩa là luôn nổi trên mọi ứng dụng khác (Always on Top),
     KHÔNG làm bảng tự mở cùng Menu (EFFECT-NO-AUTOOPEN-01: đã gỡ tính năng tự mở của EFFECT-AOT-PERSIST phần 2).
   - EFFECT-AOT-PERSIST: trạng thái "Luôn hiển thị" được GHI NHỚ qua các lần mở app (lần tích cuối cùng thắng). Việc đọc/ghi file do main.js
     tiêm vào (loadAlwaysOnTop / saveAlwaysOnTop) — module này không chạm file. Lỗi đọc/ghi không bao giờ làm hỏng cửa sổ.
   - EFFECT-POS-01: VỊ TRÍ cửa sổ được GHI NHỚ (lần kéo cuối cùng thắng): kéo xong thì lưu, lần mở sau hiện đúng chỗ cũ. Việc đọc/ghi file do main.js
     tiêm vào (loadPosition / savePosition). Vị trí đã lưu mà nằm ngoài mọi màn hình đang cắm => bỏ qua, dùng vị trí mặc định. Mọi lỗi đều bị bỏ qua.
   - Module thuần Node (BrowserWindow/screen được truyền vào) để test được bằng đối tượng giả.
   ========================================================== */

const WIDTH = 380;
const HEIGHT = 560;
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

// EFFECT-POS-01: vị trí đã lưu chỉ dùng được khi phần thanh tiêu đề (góc trên-trái) vẫn nằm trong 1 màn hình đang cắm
// (tránh cửa sổ rơi ra ngoài khi đổi/tháo màn hình). Trả về {x,y} đã làm tròn, hoặc null nếu không dùng được.
function sanitizeSavedPosition(pos, displays) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    if (!Array.isArray(displays) || displays.length === 0) return null;
    const ok = displays.some((d) => {
        const a = d && d.workArea;
        if (!a) return false;
        return x + 100 > a.x && x < a.x + a.width - 100 && y >= a.y - 10 && y < a.y + a.height - 50;
    });
    return ok ? { x, y } : null;
}

const POS_SAVE_DELAY_MS = 400;

function createEffectsWindowManager({ BrowserWindow, screen, getMainWin, preloadPath, htmlPath, onStateChange, loadAlwaysOnTop, saveAlwaysOnTop, loadPosition, savePosition }) {
    let win = null;
    // EFFECT-LIT-01 — báo trạng thái mở/đóng ra ngoài (menu dùng để sáng/tắt nút EFFECT). Lỗi ở callback không được làm hỏng cửa sổ.
    function emitState(open) { try { if (typeof onStateChange === "function") onStateChange(!!open); } catch (err) { console.error("effects onStateChange lỗi:", err); } }
    // EFFECT-AOT-PERSIST: nạp trạng thái "Luôn Hiện" đã lưu ở lần tích cuối (chỉ nhận đúng true; mọi lỗi/thiếu => false như cũ).
    let alwaysOnTop = false;
    try { if (typeof loadAlwaysOnTop === "function") alwaysOnTop = loadAlwaysOnTop() === true; } catch (err) { console.error("effects loadAlwaysOnTop lỗi (bỏ qua):", err); }
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
        // EFFECT-POS-01: ưu tiên vị trí đã lưu ở lần kéo cuối (nếu còn nằm trong màn hình đang cắm).
        try {
            if (typeof loadPosition === "function") {
                const displays = screen && screen.getAllDisplays ? screen.getAllDisplays() : [];
                const saved = sanitizeSavedPosition(loadPosition(), displays);
                if (saved) pos = saved;
            }
        } catch (err) { console.error("effects đọc vị trí đã lưu lỗi (dùng mặc định):", err); }

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
        // EFFECT-POS-01: lưu vị trí sau khi kéo xong (chờ 400ms không còn di chuyển mới ghi) và 1 lần nữa khi đóng.
        let posTimer = null;
        function savePosNow() {
            try {
                if (typeof savePosition !== "function" || !alive(thisWin)) return;
                if (!thisWin.isVisible() || typeof thisWin.getPosition !== "function") return; // đang ẩn/chưa hiện => toạ độ không phải do người dùng kéo
                const p = thisWin.getPosition();
                if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
                savePosition({ x: Math.round(p[0]), y: Math.round(p[1]) });
            } catch (err) { console.error("effects lưu vị trí lỗi (bỏ qua):", err); }
        }
        thisWin.on("move", () => {
            if (typeof savePosition !== "function") return;
            if (posTimer) clearTimeout(posTimer);
            posTimer = setTimeout(() => { posTimer = null; savePosNow(); }, POS_SAVE_DELAY_MS);
            if (posTimer && typeof posTimer.unref === "function") posTimer.unref();
        });
        thisWin.on("close", () => {
            if (posTimer) { clearTimeout(posTimer); posTimer = null; }
            savePosNow();
        });
        thisWin.on("closed", () => {
            if (posTimer) { clearTimeout(posTimer); posTimer = null; }
            if (win === thisWin) {
                win = null;
                unbindMain();
                emitState(false);
            }
        });

        bindMain(main);
        emitState(true);
        return { ok: true, open: true };
    }

    function close() {
        const w = win;
        win = null;
        unbindMain();
        if (alive(w)) {
            try { w.close(); } catch (err) { console.error("effects close lỗi:", err); }
        }
        emitState(false);
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
        // EFFECT-AOT-PERSIST: ghi nhớ lần tích cuối cùng (cả khi cửa sổ đang đóng). Ghi lỗi chỉ báo log, không ảnh hưởng kết quả.
        try { if (typeof saveAlwaysOnTop === "function") saveAlwaysOnTop(enabled); } catch (err) { console.error("effects saveAlwaysOnTop lỗi (bỏ qua):", err); }
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

    return { open, close, toggle, getAlwaysOnTop, setAlwaysOnTop, isFromEffects, isFromMain, isOpen: () => alive(win), getWebContents: () => (alive(win) ? win.webContents : null) };
}

module.exports = { createEffectsWindowManager, computeInitialPosition, sanitizeSavedPosition, WIDTH, HEIGHT };
