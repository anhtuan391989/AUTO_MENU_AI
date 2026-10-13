(function() {
    'use strict';

    const updateTitle = () => {
        // Tìm player của YouTube
        let player = document.querySelector("#movie_player");
        
        // Vì chạy ở world MAIN, ta có thể dùng hàm JS nội bộ của YouTube
        if (player && typeof player.getCurrentTime === 'function') {
            let videoData = player.getVideoData();
            if (!videoData) return;
            
            let vid = videoData.video_id;
            let sec = Math.floor(player.getCurrentTime());
            let prefix = `[${vid}][${sec}] `;
            
            // Lọc bỏ prefix cũ (nếu có) để lấy tiêu đề gốc của video
            let baseTitle = document.title.replace(/^\[.*?\]\[.*?\]\s*/, "");
            let finalTitle = prefix + baseTitle;
            
            // Cập nhật tiêu đề tab nếu có sự thay đổi
            if (document.title !== finalTitle) {
                document.title = finalTitle;
            }
        }
    };

    // Chạy bộ đếm 500ms
    setInterval(updateTitle, 500);

    // Gắn Observer khi DOM đã sẵn sàng để ghi đè lại nếu YouTube cố tình đổi title
    document.addEventListener("DOMContentLoaded", () => {
        const target = document.querySelector('title');
        if (target) {
            const observer = new MutationObserver(() => {
                updateTitle();
            });
            // Chỉ theo dõi nội dung (childList) bên trong thẻ <title>
            observer.observe(target, { childList: true });
        }
    });
})();