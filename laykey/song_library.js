/**
 * SongLibrary — Thư viện bài hát trung tâm
 * Đọc từ CSV (Excel) hoặc JSON, cung cấp:
 *   - getMenuList()   : danh sách hiển thị cho Menu
 *   - search(query)   : tìm theo tên bài / ca sĩ
 *   - filterByKey(key): lọc theo tông
 *   - filterBySource(src): lọc theo nguồn (hopamviet / hopamchuan)
 *   - addSong(song)   : thêm bài mới (tự lưu lại file)
 *
 * Hoàn toàn độc lập với module dò key — chạy song song không ảnh hưởng.
 */

const fs = require('fs');
const path = require('path');
const { parseCSV, toCSV } = require('./csv_parser');

const CSV_HEADERS = ['title', 'artist', 'key', 'bpm', 'source', 'note'];

class SongLibrary {
  constructor(opts = {}) {
    this.csvPath = opts.csvPath || path.join(__dirname, '..', 'song_library.csv');
    this.jsonPath = opts.jsonPath || path.join(__dirname, '..', 'song_library.json');
    this.songs = [];
    this._load();
  }

  _load() {
    // Ưu tiên CSV (dễ sửa bằng Excel), fallback JSON
    if (fs.existsSync(this.csvPath)) {
      try {
        const text = fs.readFileSync(this.csvPath, 'utf8');
        const rows = parseCSV(text);
        this.songs = rows.map(r => ({
          title: r.title || r['tên bài'] || r['ten bai'] || '',
          artist: r.artist || r['ca sĩ'] || r['ca si'] || '',
          key: r.key || r['tông'] || r['tone'] || r['key'] || '',
          bpm: parseInt(r.bpm, 10) || null,
          source: r.source || r['nguồn'] || r['nguon'] || '',
          note: r.note || r['ghi chú'] || r['ghi chu'] || ''
        })).filter(s => s.title);
        console.log(`[SongLibrary] Đã tải ${this.songs.length} bài từ CSV`);
        return;
      } catch (e) {
        console.warn('[SongLibrary] Lỗi đọc CSV:', e.message);
      }
    }
    if (fs.existsSync(this.jsonPath)) {
      try {
        this.songs = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
        console.log(`[SongLibrary] Đã tải ${this.songs.length} bài từ JSON`);
      } catch (e) {
        console.warn('[SongLibrary] Lỗi đọc JSON:', e.message);
      }
    }
  }

  save() {
    // Lưu cả CSV và JSON để tiện dùng
    fs.writeFileSync(this.csvPath, toCSV(this.songs, CSV_HEADERS), 'utf8');
    fs.writeFileSync(this.jsonPath, JSON.stringify(this.songs, null, 2), 'utf8');
    console.log(`[SongLibrary] Đã lưu ${this.songs.length} bài`);
  }

  addSong(song) {
    if (!song.title) throw new Error('Bài hát phải có title');
    // Trùng tên + ca sĩ thì cập nhật, không thì thêm mới
    const idx = this.songs.findIndex(s =>
      s.title.toLowerCase() === song.title.toLowerCase() &&
      (s.artist || '').toLowerCase() === (song.artist || '').toLowerCase()
    );
    if (idx >= 0) {
      this.songs[idx] = { ...this.songs[idx], ...song };
    } else {
      this.songs.push({ bpm: null, source: '', note: '', ...song });
    }
    this.save();
  }

  addMany(songs) {
    let added = 0, updated = 0;
    for (const s of songs) {
      if (!s.title) continue;
      const idx = this.songs.findIndex(x =>
        x.title.toLowerCase() === s.title.toLowerCase() &&
        (x.artist || '').toLowerCase() === (s.artist || '').toLowerCase()
      );
      if (idx >= 0) { this.songs[idx] = { ...this.songs[idx], ...s }; updated++; }
      else { this.songs.push({ bpm: null, source: '', note: '', ...s }); added++; }
    }
    this.save();
    return { added, updated };
  }

  /** Danh sách hiển thị cho Menu — kèm số thứ tự */
  getMenuList(filter = {}) {
    let list = this.songs;
    if (filter.source) list = list.filter(s => s.source === filter.source);
    if (filter.key) list = list.filter(s => (s.key || '').toUpperCase() === filter.key.toUpperCase());
    return list.map((s, i) => ({
      index: i + 1,
      display: `${s.title} — ${s.artist || '?'} | Key: ${s.key || '?'}${s.bpm ? ' | ' + s.bpm + ' BPM' : ''}`,
      ...s
    }));
  }

  search(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    return this.songs.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.artist || '').toLowerCase().includes(q)
    );
  }

  getByIndex(index) {
    return this.songs[index - 1] || null;
  }

  getKeys() {
    return [...new Set(this.songs.map(s => s.key).filter(Boolean))].sort();
  }

  getSources() {
    return [...new Set(this.songs.map(s => s.source).filter(Boolean))];
  }
}

module.exports = SongLibrary;
