/* ============================================================
   ROUTE-02 — SCRIPT CHẨN ĐOÁN THIẾT BỊ ÂM THANH (CHỈ ĐỌC)
   ------------------------------------------------------------
   Dán thủ công vào DevTools Console, chạy 1 lần, chụp kết quả.
   - KHÔNG ghi setting, KHÔNG lưu file, KHÔNG gửi dữ liệu ra ngoài,
     KHÔNG dùng clipboard, KHÔNG mở thử từng thiết bị.
   - Không thuộc repo, không tích hợp vào luồng chạy của app.

   CÁCH DÙNG
   1. Mở AUTO_MENU_AI (cửa sổ chính).
   2. Mở DevTools (Ctrl+Shift+I) -> tab "Console".
      (Code app không tắt menu mặc định của Electron, nên phím này
       thường hoạt động; nếu không mở được, báo lại.)
   3. Dán TOÀN BỘ file này vào Console, nhấn Enter.
   4. Chụp bảng "ROUTE-02" hiện ra (hoặc copy khối JSON bên dưới)
      và gửi lại.
   Kết quả có 4 cột: kind, label, deviceId, groupId.
   Lưu ý: nếu app chưa từng được cấp quyền micro, script xin quyền
   1 lần rồi dừng ngay, chỉ để tên thiết bị hiện đầy đủ.
   ============================================================ */
(async function route02EnumerateDevices() {
    const notes = [];
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.error("ROUTE-02: trình duyệt không có enumerateDevices().");
        return null;
    }

    let devices = await navigator.mediaDevices.enumerateDevices();

    // Chỉ xin quyền khi TẤT CẢ thiết bị đều chưa có tên (chưa được cấp quyền).
    if (devices.length > 0 && devices.every((d) => !d.label)) {
        try {
            const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
            tmp.getTracks().forEach((t) => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
            notes.push("Đã xin quyền micro 1 lần để lấy tên thiết bị (stream đã dừng ngay).");
        } catch (e) {
            notes.push("Không xin được quyền micro: " + e.message + " (tên thiết bị có thể trống).");
        }
    }

    const rows = devices
        .filter((d) => d.kind === "audioinput" || d.kind === "audiooutput")
        .map((d) => ({
            kind: d.kind,
            label: d.label || "(không có tên)",
            deviceId: d.deviceId,
            groupId: d.groupId,
        }));

    const summary = {
        audioinput: rows.filter((r) => r.kind === "audioinput").length,
        audiooutput: rows.filter((r) => r.kind === "audiooutput").length,
    };

    console.log("%c=== ROUTE-02 — audioinput + audiooutput ===", "font-weight:bold");
    console.table(rows);
    console.log("Tổng:", summary);
    if (notes.length) notes.forEach((n) => console.warn(n));
    console.log("%c=== ROUTE-02 — JSON (bôi đen, Ctrl+C, gửi lại) ===", "font-weight:bold");
    console.log(JSON.stringify({ collectedAt: new Date().toISOString(), summary, rows, notes }, null, 2));
    return rows;
})();
