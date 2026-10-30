/**
 * setupStartupPaths.js — TASK A55
 * ---------------------------------------------------------------------------
 * Biến nhóm "Startup & Paths" (tạo bởi A54, chỉ UI tĩnh disabled) thành cấu hình
 * runtime thật: load giá trị đã lưu -> cho sửa -> validate -> save -> phản ánh
 * đúng trạng thái Saved/lỗi. KHÔNG launch/kill DAW, KHÔNG quản lý process nào ở
 * đây (đúng phạm vi A55 — xem app/main.js: chỉ có check-path-exists/check-path-is-file,
 * không có spawn nào mới).
 *
 * Nguồn dữ liệu DUY NHẤT: window.getStartupPaths()/window.setStartupPaths() (đã thêm ở
 * ui/js/appSettings.js) — tái dùng nguyên vẹn cơ chế appSettings/IPC saveSettingsSync/
 * writeSettingsFile (atomic write) đã có sẵn trong repo, KHÔNG tạo configuration system
 * thứ 2, KHÔNG dùng localStorage/sessionStorage cho dữ liệu này.
 */
(function () {
    'use strict';

    function ids() {
        return {
            autoStart: document.getElementById('spAutoStart'),
            dawExePath: document.getElementById('spDawExePath'),
            dawProjectPath: document.getElementById('spDawProjectPath'),
            pluginPaths: document.getElementById('spPluginPaths'),
            midiConfigPath: document.getElementById('spMidiConfigPath'),
            audioConfigPath: document.getElementById('spAudioConfigPath'),
            logsPath: document.getElementById('spLogsPath'),
            statusBadge: document.getElementById('spStatusBadge'),
            saveBtn: document.getElementById('spSaveBtn'),
            saveMessage: document.getElementById('spSaveMessage'),
            dawExePathStatus: document.getElementById('spDawExePathStatus'),
            dawProjectPathStatus: document.getElementById('spDawProjectPathStatus'),
            pluginPathsStatus: document.getElementById('spPluginPathsStatus'),
            midiConfigPathStatus: document.getElementById('spMidiConfigPathStatus'),
            audioConfigPathStatus: document.getElementById('spAudioConfigPathStatus'),
            logsPathStatus: document.getElementById('spLogsPathStatus'),
        };
    }

    // Tách textarea (mỗi dòng 1 path) thành mảng, GIỮ NGUYÊN THỨ TỰ người dùng nhập, chỉ bỏ
    // dòng trắng (dòng trắng không phải lỗi, chỉ là chưa nhập, không tính vào danh sách).
    function parsePluginPaths(text) {
        return (text || '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }

    function loadIntoUI() {
        const el = ids();
        if (!el.autoStart || typeof window.getStartupPaths !== 'function') return;

        const cfg = window.getStartupPaths();
        el.autoStart.checked = cfg.autoStart === true;
        el.dawExePath.value = cfg.dawExecutable || '';
        el.dawProjectPath.value = cfg.dawProject || '';
        el.pluginPaths.value = Array.isArray(cfg.pluginPaths) ? cfg.pluginPaths.join('\n') : '';
        el.midiConfigPath.value = cfg.midiConfig || '';
        el.audioConfigPath.value = cfg.audioConfig || '';
        el.logsPath.value = cfg.logs || '';

        updateOverallBadge(cfg);
        clearFieldStatuses();
    }

    function updateOverallBadge(cfg) {
        const el = ids();
        if (!el.statusBadge) return;
        const anyConfigured = !!(cfg.dawExecutable || cfg.dawProject || (cfg.pluginPaths && cfg.pluginPaths.length) ||
            cfg.midiConfig || cfg.audioConfig || cfg.logs || cfg.autoStart);
        el.statusBadge.textContent = anyConfigured ? 'Configured' : 'Not configured';
    }

    function clearFieldStatuses() {
        const el = ids();
        [el.dawExePathStatus, el.dawProjectPathStatus, el.pluginPathsStatus,
            el.midiConfigPathStatus, el.audioConfigPathStatus, el.logsPathStatus]
            .forEach((s) => { if (s) s.textContent = ''; });
    }

    // Validate 1 path bằng IPC thật (checkPathExists — đã có sẵn từ TASK B30.2, tái dùng
    // nguyên vẹn). value rỗng -> "Not configured" (không phải lỗi, cho phép để trống).
    async function validateGenericPath(value) {
        if (!value) return { status: 'not_configured' };
        if (!window.electronAPI || typeof window.electronAPI.checkPathExists !== 'function') {
            return { status: 'pending_backend' };
        }
        try {
            const exists = await window.electronAPI.checkPathExists(value);
            return { status: exists ? 'configured' : 'invalid' };
        } catch {
            return { status: 'pending_backend' };
        }
    }

    // DAW Executable: ngoài tồn tại, còn PHẢI là file (không phải thư mục) — dùng
    // checkPathIsFile (mới thêm ở A55) thay vì checkPathExists.
    async function validateDawExecutable(value) {
        if (!value) return { status: 'not_configured' };
        if (!window.electronAPI || typeof window.electronAPI.checkPathIsFile !== 'function') {
            return { status: 'pending_backend' };
        }
        try {
            const isFile = await window.electronAPI.checkPathIsFile(value);
            if (isFile === null) return { status: 'not_configured' };
            return { status: isFile ? 'configured' : 'invalid' };
        } catch {
            return { status: 'pending_backend' };
        }
    }

    function statusLabel(status) {
        switch (status) {
            case 'configured': return 'Configured';
            case 'invalid': return 'Invalid path';
            case 'not_configured': return 'Not configured';
            default: return 'Pending backend';
        }
    }

    async function handleSave() {
        const el = ids();
        if (!el.saveBtn) return;

        el.saveBtn.disabled = true;
        if (el.saveMessage) { el.saveMessage.textContent = ''; el.saveMessage.className = 'hint-text'; }
        clearFieldStatuses();

        try {
            const dawExecutable = el.dawExePath.value.trim();
            const dawProject = el.dawProjectPath.value.trim();
            const pluginPaths = parsePluginPaths(el.pluginPaths.value);
            const midiConfig = el.midiConfigPath.value.trim();
            const audioConfig = el.audioConfigPath.value.trim();
            const logs = el.logsPath.value.trim();

            // ---- Validate TẤT CẢ trước, không ghi gì nếu có bất kỳ field nào Invalid ----
            const [dawExeResult, dawProjectResult, midiResult, audioResult, logsResult] = await Promise.all([
                validateDawExecutable(dawExecutable),
                validateGenericPath(dawProject),
                validateGenericPath(midiConfig),
                validateGenericPath(audioConfig),
                validateGenericPath(logs),
            ]);
            const pluginResults = await Promise.all(pluginPaths.map((p) => validateGenericPath(p)));

            if (el.dawExePathStatus) el.dawExePathStatus.textContent = statusLabel(dawExeResult.status);
            if (el.dawProjectPathStatus) el.dawProjectPathStatus.textContent = statusLabel(dawProjectResult.status);
            if (el.midiConfigPathStatus) el.midiConfigPathStatus.textContent = statusLabel(midiResult.status);
            if (el.audioConfigPathStatus) el.audioConfigPathStatus.textContent = statusLabel(audioResult.status);
            if (el.logsPathStatus) el.logsPathStatus.textContent = statusLabel(logsResult.status);
            if (el.pluginPathsStatus) {
                const invalidCount = pluginResults.filter((r) => r.status === 'invalid').length;
                el.pluginPathsStatus.textContent = pluginPaths.length === 0
                    ? 'Not configured'
                    : (invalidCount > 0 ? `${invalidCount} path không hợp lệ` : 'Configured');
            }

            const allResults = [dawExeResult, dawProjectResult, midiResult, audioResult, logsResult, ...pluginResults];
            const hasInvalid = allResults.some((r) => r.status === 'invalid');

            if (hasInvalid) {
                // Đúng yêu cầu A55 mục 9: validation fail -> KHÔNG ghi config mới, giữ nguyên
                // config cũ, chỉ hiển thị field nào sai (đã set ở trên).
                if (el.saveMessage) {
                    el.saveMessage.textContent = 'Chưa lưu — có đường dẫn không hợp lệ, xem trạng thái từng trường phía trên.';
                    el.saveMessage.className = 'hint-text sp-save-error';
                }
                return;
            }

            const { ok, value } = window.setStartupPaths({
                autoStart: el.autoStart.checked === true,
                dawExecutable,
                dawProject,
                pluginPaths,
                midiConfig,
                audioConfig,
                logs,
            });

            if (ok) {
                if (el.saveMessage) { el.saveMessage.textContent = 'Saved'; el.saveMessage.className = 'hint-text sp-save-ok'; }
                updateOverallBadge(value);
            } else {
                // Đúng yêu cầu A55 mục 9: save fail -> KHÔNG báo Saved, hiển thị lỗi, không mất
                // config cũ (setStartupPaths chỉ mutate appSettings trong RAM khi setSetting()
                // gọi saveSetup(); nếu ghi file thất bại, bản RAM có thể lệch bản trên đĩa —
                // để an toàn, load lại từ đĩa ngay để UI luôn khớp với những gì THẬT SỰ đã lưu).
                if (el.saveMessage) {
                    el.saveMessage.textContent = 'Lưu thất bại — vui lòng thử lại.';
                    el.saveMessage.className = 'hint-text sp-save-error';
                }
                if (typeof window.loadSetup === 'function') window.loadSetup();
                loadIntoUI();
            }
        } finally {
            el.saveBtn.disabled = false;
        }
    }

    function init() {
        const el = ids();
        if (!el.saveBtn) return; // panel chưa có trong DOM (không nên xảy ra, nhưng an toàn)
        loadIntoUI();
        el.saveBtn.addEventListener('click', handleSave);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
