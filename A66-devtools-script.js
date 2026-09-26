/* ============================================================
   A66 — SCRIPT CHẨN ĐOÁN AUDIO ENDPOINT (CHỈ ĐỌC, KHÔNG GHI GÌ VÀO APP)
   ------------------------------------------------------------
   Đây KHÔNG phải code production — đây là 1 đoạn script để bạn TỰ TAY
   dán vào DevTools Console của AUTO_MENU_AI, chạy 1 lần, xem kết quả,
   rồi đóng lại. Không lưu vào file nào của app, không ảnh hưởng gì.

   CÁCH DÙNG:
   1. Mở AUTO_MENU_AI (cửa sổ chính, nơi có BPM/Key/VU).
   2. Nhấn Ctrl+Shift+I để mở DevTools.
   3. Bấm vào tab "Console".
   4. Copy TOÀN BỘ nội dung file này, dán vào Console, nhấn Enter.
   5. Chờ ~2 giây (nó sẽ xin quyền micro nếu chưa cấp — bấm Allow/Cho phép).
   6. Kết quả in ra dạng bảng — chụp màn hình HOẶC bấm nút "Copy JSON"
      xuất hiện trong console (nếu browser hỗ trợ copy(...)), rồi gửi
      lại cho Claude.
   ============================================================ */
(async function a66AudioEndpointInventory() {
    const result = { inputs: [], outputs: [], videoinputs: [], errors: [] };

    try {
        // Xin quyền mic 1 lần để label thiết bị hiện đầy đủ tên thật (nếu không xin quyền,
        // Windows/Chromium sẽ giấu bớt tên, chỉ hiện "Microphone 1", "Microphone 2"...)
        const tmpStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmpStream.getTracks().forEach(t => t.stop());
    } catch (e) {
        result.errors.push('Không xin được quyền micro: ' + e.message + ' (vẫn tiếp tục liệt kê, nhưng tên thiết bị có thể bị rút gọn)');
    }

    const devices = await navigator.mediaDevices.enumerateDevices();

    for (const d of devices) {
        const entry = { label: d.label || '(không có tên - do chưa cấp quyền)', deviceId: d.deviceId, groupId: d.groupId };
        if (d.kind === 'audioinput') result.inputs.push(entry);
        else if (d.kind === 'audiooutput') result.outputs.push(entry);
        else if (d.kind === 'videoinput') result.videoinputs.push(entry);
    }

    // Với MỖI audioinput, thử mở thật (getUserMedia) để lấy thêm channelCount/sampleRate —
    // đây là thông tin Windows Device Manager KHÔNG cho biết, chỉ Chromium mới biết vì nó
    // đã thực sự mở kết nối tới driver.
    for (const inp of result.inputs) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: inp.deviceId } }
            });
            const track = stream.getAudioTracks()[0];
            const settings = track.getSettings ? track.getSettings() : {};
            inp.channelCount = settings.channelCount ?? '(không rõ)';
            inp.sampleRate = settings.sampleRate ?? '(không rõ)';
            inp.sampleSize = settings.sampleSize ?? '(không rõ)';
            inp.echoCancellation = settings.echoCancellation ?? '(không rõ)';
            stream.getTracks().forEach(t => t.stop());
        } catch (e) {
            inp.openError = e.message;
        }
    }

    console.log('%c=== A66 — INPUT devices (audioinput) ===', 'color:#4CAF50;font-weight:bold');
    console.table(result.inputs);
    console.log('%c=== A66 — OUTPUT devices (audiooutput) ===', 'color:#2196F3;font-weight:bold');
    console.table(result.outputs);
    if (result.errors.length) {
        console.log('%c=== A66 — Lỗi/ghi chú ===', 'color:#F44336;font-weight:bold');
        result.errors.forEach(e => console.warn(e));
    }

    const json = JSON.stringify(result, null, 2);
    console.log('%c=== A66 — JSON đầy đủ (copy đoạn dưới đây gửi cho Claude) ===', 'color:#FF9800;font-weight:bold');
    console.log(json);

    try {
        await navigator.clipboard.writeText(json);
        console.log('%cĐã tự động copy JSON vào clipboard — chỉ cần dán (Ctrl+V) gửi cho Claude!', 'color:#4CAF50;font-weight:bold');
    } catch (e) {
        console.log('Không tự copy được vào clipboard — hãy tự bôi đen đoạn JSON ở trên và Ctrl+C.');
    }

    return result;
})();
