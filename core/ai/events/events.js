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

};