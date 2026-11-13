/**
 * TextImporter — Dán nguyên khối text từ web → tự nhận diện cột → lưu thư viện
 *
 * Hỗ trợ các định dạng phổ biến khi copy từ hopamviet / hopamchuan / bảng tính:
 *   "Tên bài | Ca sĩ | Key"
 *   "Tên bài - Ca sĩ (Key)"
 *   "Tên bài;Ca sĩ;Key;BPM"
 *   "Tên bài        Ca sĩ        C        80"  (cách nhiều / tab)
 *   "1. Tên bài - Ca sĩ [Am]"
 *
 * Cách dùng:
 *   node import_text.js            (chế độ tương tác — dán text, Enter 2 lần để kết thúc)
 *   node import_text.js file.txt   (đọc từ file)
 *   echo "..." | node import_text.js  (đọc từ stdin)
 */

const fs = require('fs');
const readline = require('readline');
const SongLibrary = require('./lib/song_library');

const KEY_PATTERN = /\b([A-G][#b]?m?)\b/;
const BPM_PATTERN = /\b(\d{2,3})\s*(?:bpm|BPM)?\b/;

/** Tự đoán key từ một chuỗi — trả về null nếu không rõ
 *  Ưu tiên key nằm trong ngoặc [Am] / (C#) trước, mới đến key đứng riêng lẻ */
function guessKey(str) {
  if (!str) return null;
  // Loại trừ số BPM
  const cleaned = str.replace(/\d{2,3}\s*(bpm|BPM)?/g, '');
  // 1. Ưu tiên key trong ngoặc [ ] hoặc ( )
  const bracket = cleaned.match(/[\(\[]([A-G][#b]?m?)[\)\]]/);
  if (bracket) return bracket[1];
  // 2. Key đứng riêng lẻ (có ranh giới từ) — lấy match cuối cùng (thường ở cuối dòng)
  const matches = [...cleaned.matchAll(/(?<![A-Za-z0-9])([A-G][#b]?m?)(?![A-Za-z0-9])/g)];
  if (matches.length > 0) return matches[matches.length - 1][1];
  return null;
}

function guessBPM(str) {
  const m = (str || '').match(BPM_PATTERN);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Phân tích 1 dòng text thành object bài hát
 * Chiến lược: tách theo dấu phân cách phổ biến, sau đó đoán mỗi cột là gì
 */
function parseLine(line) {
  line = line.trim();
  if (!line) return null;

  // Bỏ số thứ tự đầu dòng: "1. ", "1) ", "1 - "
  line = line.replace(/^\d+[\.\)\-]\s*/, '');

  // Thử tách theo dấu phân cách rõ ràng
  const separators = ['|', ';', '\t'];
  let parts = null;
  for (const sep of separators) {
    if (line.includes(sep)) {
      parts = line.split(sep).map(s => s.trim()).filter(Boolean);
      break;
    }
  }

  // Nếu không có dấu rõ ràng, thử tách theo nhiều khoảng trắng
  if (!parts) {
    const multiSpace = line.split(/\s{2,}|\t/).map(s => s.trim()).filter(Boolean);
    if (multiSpace.length >= 2) parts = multiSpace;
  }

  // Nếu vẫn 1 khối, thử tách theo dấu gạch ngang: "Tên bài - Ca sĩ"
  if (!parts || parts.length < 2) {
    const dashSplit = line.split(/\s+[-–—]\s+/);
    if (dashSplit.length >= 2) parts = dashSplit.map(s => s.trim());
  }

  if (!parts || parts.length === 0) return null;

  const song = { title: '', artist: '', key: '', bpm: null, source: '', note: '' };

  if (parts.length === 1) {
    // Chỉ 1 khối: cố gắng tách key trong ngoặc: "Tên bài (Am)" / "Tên bài [C]"
    const m = parts[0].match(/^(.+?)\s*[\(\[]([A-G][#b]?m?)[\)\]]\s*$/);
    if (m) {
      song.title = m[1].trim();
      song.key = m[2];
    } else {
      song.title = parts[0];
      const k = guessKey(parts[0]);
      if (k && k !== parts[0]) song.key = k;
    }
    return song.title ? song : null;
  }

  // Phần tử đầu gần như chắc chắn là tên bài
  song.title = parts[0];

  // Phần tử cuối: đoán là key hoặc bpm hoặc cả 2
  const last = parts[parts.length - 1];
  const keyInLast = guessKey(last);
  const bpmInLast = guessBPM(last);
  if (keyInLast) song.key = keyInLast;
  if (bpmInLast) song.bpm = bpmInLast;

  // Phần ở giữa (nếu có): ca sĩ + có thể cả key/bpm
  if (parts.length >= 3) {
    song.artist = parts[1];
    // Kiểm tra phần giữa có key không (trường hợp 4 cột: title;artist;key;bpm)
    if (!song.key && parts.length >= 3) {
      for (let i = 2; i < parts.length - 1; i++) {
        const k = guessKey(parts[i]);
        if (k) { song.key = k; break; }
      }
    }
  } else if (parts.length === 2) {
    // 2 phần: title + (artist hoặc key)
    if (!song.key) {
      const k = guessKey(parts[1]);
      if (k) song.key = k;
      else song.artist = parts[1];
    } else {
      // Phần 2 có key → phần 2 có thể là "Ca sĩ (Key) 76 BPM" — tách ca sĩ ra
      let artistPart = parts[1]
        .replace(/[\(\[][A-G][#b]?m?[\)\]]/g, '')
        .replace(/\b[A-G][#b]?m?\b/g, '')
        .replace(/\b\d{2,3}\s*(bpm|BPM)?\b/g, '')
        .replace(/[|;,\-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (artistPart) song.artist = artistPart;
    }
  }

  // Dọn dẹp: nếu title trùng với key đoán được (sai), bỏ key
  if (song.key && song.title.toUpperCase() === song.key.toUpperCase()) song.key = '';

  return song.title ? song : null;
}

function parseBlock(text) {
  const lines = text.split(/\r?\n/);
  const songs = [];
  for (const line of lines) {
    const s = parseLine(line);
    if (s) songs.push(s);
  }
  return songs;
}

async function main() {
  let input = '';

  if (process.argv[2]) {
    // Đọc từ file
    input = fs.readFileSync(process.argv[2], 'utf8');
  } else if (!process.stdin.isTTY) {
    // Đọc từ stdin (pipe)
    input = fs.readFileSync(0, 'utf8');
  } else {
    // Chế độ tương tác
    console.log('========================================');
    console.log('  📥 IMPORT BÀI HÁT TỪ TEXT');
    console.log('========================================');
    console.log('Dán (paste) nội dung copy từ web vào đây.');
    console.log('Khi xong, nhấn Enter trên 1 dòng trống để kết thúc.\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const lines = [];
    let emptyCount = 0;
    for await (const line of rl) {
      if (line.trim() === '') {
        emptyCount++;
        if (emptyCount >= 1 && lines.length > 0) break;
        continue;
      }
      emptyCount = 0;
      lines.push(line);
    }
    rl.close();
    input = lines.join('\n');
  }

  if (!input.trim()) {
    console.log('❌ Không có dữ liệu đầu vào.');
    process.exit(1);
  }

  const songs = parseBlock(input);
  if (songs.length === 0) {
    console.log('❌ Không nhận diện được bài hát nào. Hãy kiểm tra định dạng.');
    console.log('Mẹo: mỗi bài 1 dòng, các cột cách nhau bằng | hoặc ; hoặc tab');
    process.exit(1);
  }

  console.log(`\n✅ Nhận diện được ${songs.length} bài hát:\n`);
  songs.forEach((s, i) => {
    console.log(`  ${String(i + 1).padStart(3)}. ${s.title}${s.artist ? ' — ' + s.artist : ''}${s.key ? ' | Key: ' + s.key : ''}${s.bpm ? ' | ' + s.bpm + ' BPM' : ''}`);
  });

  const lib = new SongLibrary();
  const { added, updated } = lib.addMany(songs);
  console.log(`\n📚 Kết quả lưu vào thư viện:`);
  console.log(`   + Thêm mới : ${added} bài`);
  console.log(`   ~ Cập nhật : ${updated} bài`);
  console.log(`   📁 File   : song_library.csv / song_library.json`);
}

if (require.main === module) {
  main().catch(e => { console.error('Lỗi:', e.message); process.exit(1); });
}

module.exports = { parseLine, parseBlock, guessKey, guessBPM };
