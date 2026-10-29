/**
 * Mô hình bài hát
 */
class Song {
  constructor(id, title = "", artist = "") {
    this.id = id;
    this.title = title;
    this.artist = artist;
    this.key = null;
    this.mode = null;
    this.bpm = null;
    this.status = "pending";
    this.weight = 0;
    this.analyzedAt = null;
  }

  setKey(key, mode, status = "provisional") {
    this.key = key;
    this.mode = mode;
    this.status = status;
    this.analyzedAt = Date.now();
  }

  setBpm(bpm) {
    this.bpm = Math.round(bpm * 100) / 100;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      artist: this.artist,
      key: this.key,
      mode: this.mode,
      bpm: this.bpm,
      status: this.status,
      weight: this.weight
    };
  }
}

module.exports = Song;