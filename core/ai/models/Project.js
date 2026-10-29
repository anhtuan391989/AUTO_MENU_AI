/**
 * Dự án DAW
 */
const Song = require("./Song");

class Project {
  constructor(id, name = "") {
    this.id = id;
    this.name = name;
    this.songs = new Map();
    this.activeSongId = null;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  addSong(song) {
    this.songs.set(song.id, song);
    this.updatedAt = Date.now();
  }

  getSong(id) {
    return this.songs.get(id);
  }

  setActiveSong(id) {
    if (this.songs.has(id)) {
      this.activeSongId = id;
      return true;
    }
    return false;
  }

  getActiveSong() {
    return this.songs.get(this.activeSongId);
  }

  getAllSongs() {
    return Array.from(this.songs.values());
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      songs: this.getAllSongs().map(s => s.toJSON()),
      activeSongId: this.activeSongId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Project;