/**
 * adminAuthUI.js — TASK A52 (Claude A, SETUP OWNER)
 * ---------------------------------------------------------------------------
 * Popup đăng nhập Admin + form đổi password, cho khu vực "AI 🔒" trong Setup.
 *
 * PHẠM VI A52: chỉ dựng SẴN component (login popup + change password), lưu ở
 * window.AdminAuthUI để task A53 (Setup UI / AI Tab Lock) gọi khi user bấm tab
 * "AI 🔒" — A52 KHÔNG tự gắn vào bất kỳ nút/tab nào (đúng như đã thống nhất, để
 * tránh 2 task chồng lấn phạm vi).
 *
 * KỸ THUẬT: toàn bộ modal được dựng bằng JS (createElement), KHÔNG cần thêm bất
 * kỳ đoạn markup nào vào setup.html — chỉ cần 1 dòng <script src="js/adminAuthUI.js">
 * ở cuối setup.html để nạp file này (dòng bổ sung duy nhất, không sửa nội dung
 * HTML hiện có). CSS được inject bằng <style> riêng, toàn bộ class có tiền tố
 * "a52-" để không đụng bất kỳ style nào đã có trong css/setup.css.
 *
 * BẢO MẬT (đúng mục 5 trong đặc tả Task A — "không fake authentication chỉ bằng
 * JavaScript boolean ở renderer"): file này KHÔNG tự quyết định đúng/sai password.
 * Mọi lần bấm "LOGIN" đều gọi electronAPI.adminAuthVerify(password) — xác thực
 * THẬT xảy ra ở main process (core/shared/AdminAuth.js, scrypt hash), renderer chỉ
 * hiển thị kết quả trả về. Password KHÔNG được console.log ở bất kỳ đâu trong file
 * này.
 *
 * API công khai:
 *   window.AdminAuthUI.requestLogin(onSuccess)
 *     -> mở popup đăng nhập. Gọi onSuccess() nếu xác thực đúng. Không có
 *        onSuccess nào được gọi nếu user bấm Cancel hoặc đóng popup.
 *   window.AdminAuthUI.openChangePassword()
 *     -> mở form đổi password (yêu cầu đã đăng nhập đúng trong phiên hiện tại,
 *        vẫn bắt nhập lại current password để xác thực quyền Admin — đúng mục 7).
 */
(function () {
    'use strict';

    if (window.AdminAuthUI) return; // tránh khởi tạo lại nếu script bị nạp 2 lần

    // ============== CSS (scoped, không đụng css/setup.css) ==============
    const style = document.createElement('style');
    style.textContent = `
        .a52-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.6);
            display: flex; align-items: center; justify-content: center;
            z-index: 99999; font-family: inherit;
        }
        .a52-box {
            background: #1e1e26; color: #eee; border-radius: 10px;
            padding: 22px 26px; width: 320px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            border: 1px solid #333;
        }
        .a52-title {
            font-size: 16px; font-weight: 700; letter-spacing: 0.5px;
            text-align: center; margin-bottom: 14px;
        }
        .a52-label { font-size: 12px; opacity: 0.8; margin: 10px 0 4px; }
        .a52-input {
            width: 100%; box-sizing: border-box; padding: 8px 10px;
            border-radius: 6px; border: 1px solid #444; background: #14141a;
            color: #fff; font-size: 14px;
        }
        .a52-input:focus { outline: none; border-color: #6a8dff; }
        .a52-error {
            color: #ff6b6b; font-size: 12px; min-height: 16px; margin-top: 8px;
        }
        .a52-success { color: #57e08a; font-size: 12px; min-height: 16px; margin-top: 8px; }
        .a52-row { display: flex; gap: 8px; margin-top: 16px; }
        .a52-btn {
            flex: 1; padding: 8px 10px; border-radius: 6px; border: 1px solid #444;
            background: #2a2a34; color: #fff; cursor: pointer; font-size: 13px;
        }
        .a52-btn:hover { background: #34343f; }
        .a52-btn:disabled { opacity: 0.5; cursor: default; }
        .a52-btn--primary { background: #3a5bd9; border-color: #3a5bd9; }
        .a52-btn--primary:hover { background: #4569ea; }
        .a52-link {
            display: block; text-align: center; margin-top: 14px; font-size: 11px;
            color: #8aa4ff; cursor: pointer; text-decoration: underline;
        }
    `;
    document.head.appendChild(style);

    function el(tag, className, text) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function closeOverlay(overlay) {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    // ============== LOGIN POPUP ==============
    function requestLogin(onSuccess) {
        const overlay = el('div', 'a52-overlay');
        const box = el('div', 'a52-box');

        box.appendChild(el('div', 'a52-title', 'ADMIN LOGIN'));
        box.appendChild(el('div', 'a52-label', 'Password'));

        const input = document.createElement('input');
        input.type = 'password';
        input.className = 'a52-input';
        input.autocomplete = 'off';
        input.placeholder = '••••••••••••';
        box.appendChild(input);

        const errorBox = el('div', 'a52-error', '');
        box.appendChild(errorBox);

        const row = el('div', 'a52-row');
        const cancelBtn = el('button', 'a52-btn', 'CANCEL');
        const loginBtn = el('button', 'a52-btn a52-btn--primary', 'LOGIN');
        row.appendChild(cancelBtn);
        row.appendChild(loginBtn);
        box.appendChild(row);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        input.focus();

        function setBusy(busy) {
            loginBtn.disabled = busy;
            cancelBtn.disabled = busy;
            input.disabled = busy;
            loginBtn.textContent = busy ? '...' : 'LOGIN';
        }

        async function attemptLogin() {
            const password = input.value; // không bao giờ console.log biến này
            if (!password) {
                errorBox.textContent = 'Vui lòng nhập password.';
                return;
            }
            errorBox.textContent = '';
            setBusy(true);

            try {
                const result = await window.electronAPI.adminAuthVerify(password);
                if (result && result.ok) {
                    closeOverlay(overlay);
                    if (typeof onSuccess === 'function') onSuccess();
                } else {
                    errorBox.textContent = 'Incorrect password';
                    input.value = '';
                    input.focus();
                }
            } catch (err) {
                errorBox.textContent = 'Lỗi hệ thống, thử lại.';
            } finally {
                setBusy(false);
            }
        }

        loginBtn.addEventListener('click', attemptLogin);
        cancelBtn.addEventListener('click', () => closeOverlay(overlay));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') attemptLogin();
            if (e.key === 'Escape') closeOverlay(overlay);
        });
    }

    // ============== CHANGE PASSWORD FORM ==============
    function openChangePassword() {
        const overlay = el('div', 'a52-overlay');
        const box = el('div', 'a52-box');

        box.appendChild(el('div', 'a52-title', 'ĐỔI PASSWORD ADMIN'));

        box.appendChild(el('div', 'a52-label', 'Password hiện tại'));
        const curInput = document.createElement('input');
        curInput.type = 'password';
        curInput.className = 'a52-input';
        curInput.autocomplete = 'off';
        box.appendChild(curInput);

        box.appendChild(el('div', 'a52-label', 'Password mới'));
        const newInput = document.createElement('input');
        newInput.type = 'password';
        newInput.className = 'a52-input';
        newInput.autocomplete = 'off';
        box.appendChild(newInput);

        box.appendChild(el('div', 'a52-label', 'Xác nhận password mới'));
        const confirmInput = document.createElement('input');
        confirmInput.type = 'password';
        confirmInput.className = 'a52-input';
        confirmInput.autocomplete = 'off';
        box.appendChild(confirmInput);

        const msgBox = el('div', 'a52-error', '');
        box.appendChild(msgBox);

        const row = el('div', 'a52-row');
        const cancelBtn = el('button', 'a52-btn', 'CANCEL');
        const saveBtn = el('button', 'a52-btn a52-btn--primary', 'SAVE');
        row.appendChild(cancelBtn);
        row.appendChild(saveBtn);
        box.appendChild(row);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        curInput.focus();

        function setBusy(busy) {
            saveBtn.disabled = busy;
            cancelBtn.disabled = busy;
            saveBtn.textContent = busy ? '...' : 'SAVE';
        }

        async function attemptSave() {
            const currentPassword = curInput.value;
            const newPassword = newInput.value;
            const confirmPassword = confirmInput.value;

            if (!currentPassword || !newPassword || !confirmPassword) {
                msgBox.className = 'a52-error';
                msgBox.textContent = 'Vui lòng nhập đủ 3 trường.';
                return;
            }
            if (newPassword !== confirmPassword) {
                msgBox.className = 'a52-error';
                msgBox.textContent = 'Xác nhận password mới không khớp.';
                return;
            }

            msgBox.textContent = '';
            setBusy(true);

            try {
                const result = await window.electronAPI.adminAuthChangePassword(currentPassword, newPassword);
                if (result && result.ok) {
                    msgBox.className = 'a52-success';
                    msgBox.textContent = 'Đổi password thành công.';
                    setTimeout(() => closeOverlay(overlay), 900);
                } else {
                    msgBox.className = 'a52-error';
                    msgBox.textContent = (result && result.reason) || 'Đổi password thất bại.';
                }
            } catch (err) {
                msgBox.className = 'a52-error';
                msgBox.textContent = 'Lỗi hệ thống, thử lại.';
            } finally {
                setBusy(false);
            }
        }

        saveBtn.addEventListener('click', attemptSave);
        cancelBtn.addEventListener('click', () => closeOverlay(overlay));
        confirmInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') attemptSave();
        });
    }

    window.AdminAuthUI = { requestLogin, openChangePassword };
})();
