module.exports = {

    APP_READY: "APP_READY",

    AUDIO_STARTED: "AUDIO_STARTED",

    AUDIO_STOPPED: "AUDIO_STOPPED",

    AUDIO_BUFFER_READY: "AUDIO_BUFFER_READY",

    SONG_DETECTED: "SONG_DETECTED",

    SONG_CHANGED: "SONG_CHANGED",

    PROJECT_OPENED: "PROJECT_OPENED",

    PROJECT_CLOSED: "PROJECT_CLOSED",

    PLUGIN_OPENED: "PLUGIN_OPENED",

    PLUGIN_CLOSED: "PLUGIN_CLOSED",

    KEY_UPDATED: "KEY_UPDATED",

    BPM_UPDATED: "BPM_UPDATED",

    MOD_UPDATED: "MOD_UPDATED",

    CONFIDENCE_UPDATED: "CONFIDENCE_UPDATED",

    CACHE_HIT: "CACHE_HIT",

    CACHE_MISS: "CACHE_MISS",

    ANALYSIS_STARTED: "ANALYSIS_STARTED",

    ANALYSIS_FINISHED: "ANALYSIS_FINISHED",

    DECISION_READY: "DECISION_READY",

    AUTOMATION_STARTED: "AUTOMATION_STARTED",

    AUTOMATION_FINISHED: "AUTOMATION_FINISHED",

    ERROR: "ERROR",

    AI_STARTED: "AI_STARTED",

    AI_STOPPED: "AI_STOPPED",

    // -- Do AnalysisState phát ra khi phát hiện THAY ĐỔI thật sự (khác với *_UPDATED ở trên,
    //    vốn bắn mỗi lần có dữ liệu mới, kể cả khi giá trị không đổi) --
    KEY_CHANGED: "KEY_CHANGED",

    BPM_CHANGED: "BPM_CHANGED",

    MOD_CHANGED: "MOD_CHANGED",

    // -- Sự kiện tổng hợp: bắn ra bất kỳ khi nào KEY_CHANGED/BPM_CHANGED/MOD_CHANGED xảy ra,
    //    kèm toàn bộ snapshot -- để module nào chỉ cần "có gì đổi thì báo tôi" không cần
    //    đăng ký lắng nghe riêng lẻ cả 3 sự kiện trên. --
    ANALYSIS_UPDATED: "ANALYSIS_UPDATED",

    // -- Do InferenceEngine phát ra: đã PHÂN LOẠI ý nghĩa (NEW_SONG/KEY_CHANGE/MODULATION/
    //    BPM_CHANGE/NOISE), kèm AnalysisResult đầy đủ. DecisionEngine nên lắng nghe sự kiện
    //    này thay vì tự lắng nghe KEY_CHANGED/BPM_CHANGED/MOD_CHANGED riêng lẻ. --
    ANALYSIS_RESULT: "ANALYSIS_RESULT",

    // -- Do ResultQueue (Analysis Aggregator) phát ra: 1 hoặc nhiều AnalysisResult đã được
    //    gom/lọc/ưu tiên xong sau cửa sổ gom ngắn. DecisionEngine nên lắng nghe sự kiện này
    //    thay vì tự lắng nghe ANALYSIS_RESULT thô (dễ bị dồn dập/trùng lặp). --
    ANALYSIS_READY: "ANALYSIS_READY",

    // -- Do WorkflowManager phát ra: các DecisionAction đã được loại trùng liên tiếp,
    //    giữ nguyên thứ tự, đã đẩy vào TaskQueue -- sẵn sàng để thực thi (chưa thực thi
    //    ở bước này). --
    WORKFLOW_READY: "WORKFLOW_READY",

    // -- Do PluginController phát ra: 1 lệnh Plugin trừu tượng { command, value, ... }
    //    cho mỗi DecisionAction ở chế độ AI_CONTROL. app/main.js lắng nghe sự kiện này
    //    để relay qua IPC "plugin-command" sang renderer (Bridge). Hằng số này BỊ THIẾU
    //    trong bản gốc dù đã được publish/subscribe ở nơi khác -> sửa trong Bước 1/2
    //    của Architecture Stabilization (không đổi hành vi, chỉ khai báo đúng hằng số
    //    đã được dùng sẵn ở app/main.js và core/ai/plugin/PluginController.js). --
    PLUGIN_COMMAND: "PLUGIN_COMMAND",

};