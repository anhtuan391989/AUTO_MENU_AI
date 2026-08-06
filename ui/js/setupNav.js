/* setupNav.js — MỚI THÊM, KHÔNG đụng tới setup.js/appSettings.js.
   Chỉ lo việc chuyển đổi hiển thị giữa các nhóm sidebar (GENERAL/AUDIO/AI/MIDI/...).
   Không chứa logic nghiệp vụ, không gọi electronAPI, không đọc/ghi setting nào. */
(function () {
    function activatePanel(panelId) {
        document.querySelectorAll(".setup-panel").forEach((el) => {
            el.classList.toggle("active", el.id === panelId);
        });
        document.querySelectorAll(".nav-item").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.panel === panelId);
        });

        // Giữ hành vi cũ: danh sách soundcard tự làm mới mỗi khi vào lại nhóm AUDIO
        // (bản cũ làm việc này mỗi lần MỞ MODAL Soundcard — nay panel luôn hiện sẵn,
        // nên mô phỏng lại bằng cách bấm hộ nút ẩn #openSoundcardModal, không viết lại logic).
        if (panelId === "panel-audio") {
            document.getElementById("openSoundcardModal")?.click();
        }
    }

    document.getElementById("sidebarNav")?.addEventListener("click", (e) => {
        const btn = e.target.closest(".nav-item");
        if (!btn) return;
        activatePanel(btn.dataset.panel);
    });
})();
