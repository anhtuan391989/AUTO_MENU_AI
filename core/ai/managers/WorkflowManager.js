/**
 * Quản lý Luồng tổng thể
 */
const SongEngine = require('../engines/SongEngine');
const AutomationEngine = require('../decision/AutomationEngine');
const SystemListener = require('../listeners/SystemListener');
const DatabaseService = require('../services/DatabaseService');

class WorkflowManager {
  constructor() {
    this.currentSongId = null;
    this.isRunning = false;
  }

  async start(songId, audioBuffer, title = "", artist = "") {
    if (this.isRunning) return { error: "Đang chạy" };
    
    this.isRunning = true;
    this.currentSongId = songId;
    SystemListener.setBusy();

    try {
      const song = await SongEngine.analyzeFull(songId, audioBuffer, title, artist);
      const serverStatus = await SongEngine.checkServerStatus(songId);
      
      if (song.key && this.get('autoSubmit')) {
        await AutomationEngine.process(songId, {
          key: song.key,
          mode: song.mode,
          confidence: 0.8
        });
      }

      return {
        success: true,
        song: song.toJSON(),
        serverStatus
      };
    } finally {
      this.isRunning = false;
      SystemListener.setIdle();
    }
  }

  async checkStatus(songId) {
    return await DatabaseService.getSongKey(songId);
  }

  get(key) {
    return require('../services/SettingService').get(key);
  }

  stop() {
    this.isRunning = false;
    this.currentSongId = null;
  }
}

module.exports = new WorkflowManager();