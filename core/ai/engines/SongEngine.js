/**
 * Tổng hợp phân tích toàn bài hát
 */
const KeyEngine = require("./KeyEngine");
const BPMEngine = require("./BPMEngine");
const HarmonyEngine = require("./HarmonyEngine");
const Song = require("../models/Song");

class SongEngine {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  async analyzeFull(songId, audioBuffer, title = "", artist = "") {
    const song = new Song(songId, title, artist);
    
    const [keyResult, bpmResult] = await Promise.all([
      KeyEngine.analyze(songId, audioBuffer),
      BPMEngine.analyze(audioBuffer)
    ]);

    song.setKey(keyResult.key, keyResult.mode, keyResult.submitted ? "provisional" : "pending");
    song.setBpm(bpmResult.value);

    return song;
  }

  async checkServerStatus(songId) {
    return await KeyEngine.getConfirmedKey(songId);
  }
}

module.exports = new SongEngine();