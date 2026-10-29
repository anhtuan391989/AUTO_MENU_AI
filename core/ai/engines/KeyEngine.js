/**
 * Công cụ phân tích Khóa & Giai điệu chính
 */
const AudioService = require("../services/AudioService");
const DatabaseService = require("../services/DatabaseService");
const SettingService = require("../services/SettingService");

class KeyEngine {
  constructor() {
    this.isRunning = false;
  }

  async analyze(songId, audioBuffer) {
    this.isRunning = true;
    try {
      const result = await AudioService.analyzeBuffer(audioBuffer);
      
      if (result.confidence >= SettingService.get("minConfidence")) {
        if (SettingService.get("autoSubmit")) {
          await DatabaseService.submitVote(
            songId,
            result.key,
            result.mode,
            result.confidence
          );
        }
      }
      
      return {
        songId,
        key: result.key,
        mode: result.mode,
        confidence: result.confidence,
        bpm: result.bpm,
        submitted: result.confidence >= SettingService.get("minConfidence")
      };
    } finally {
      this.isRunning = false;
    }
  }

  async getConfirmedKey(songId) {
    const result = await DatabaseService.getSongKey(songId);
    if (result.found && result.data) {
      return {
        key: result.data.key,
        mode: result.data.mode,
        status: result.data.status,
        weight: result.data.weight
      };
    }
    return { found: false, status: "not_found" };
  }
}

module.exports = new KeyEngine();