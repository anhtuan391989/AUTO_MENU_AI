/**
 * DEMO — Tích hợp SongLibrary vào Menu của AUTO_MENU_AI
 * Chạy song song với module dò key (giả lập ở đây bằng setInterval).
 *
 * Chạy: node demo_menu.js
 */

const readline = require('readline');
const SongLibrary = require('./lib/song_library');

const lib = new SongLibrary();

// ============================================================
//  🎧 MODULE DÒ KEY — GIẢ LẬP (giữ nguyên code của bạn ở đây)
//  Quan trọng: KHÔNG sửa gì trong phần này, nó chạy độc lập.
// ============================================================
let currentDetectedKey = null;
let detectionRunning = true;

function startKeyDetection() {
  // Đây chỉ là giả lập — thay bằng code dò key thực tế của bạn
  const possibleKeys = ['C', 'G', 'Am', 'F', 'Dm', 'Em', 'Bb', 'A'];
  setInterval(() => {
    if (!detectionRunning) return;
    // Giả lập: key thay đổi ngẫu nhiên như khi phân tích âm thanh thực
    currentDetectedKey = possibleKeys[Math.floor(Math.random() * possibleKeys.length)];
  }, 3000);
}

// ============================================================
//  📂 MENU THƯ VIỆN BÀI HÁT
// ============================================================
function printMenu(filter = {}) {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║        🎵 AUTO_MENU_AI — THƯ VIỆN BÀI HÁT      ║');
  console.log('╠══════════════════════════════════════════════╣');

  const list = lib.getMenuList(filter);
  if (list.length === 0) {
    console.log('║  (chưa có bài nào — dùng import_text.js để thêm) ║');
  } else {
    list.forEach(item => {
      const line = ` [${String(item.index).padStart(2)}] ${item.display}`;
      console.log('║ ' + line.padEnd(46) + ' ║');
    });
  }

  console.log('╠══════════════════════════════════════════════╣');
  const detKey = currentDetectedKey ? `🎧 Dò real-time: ${currentDetectedKey}` : '🎧 Dò key: đang phân tích...';
  console.log('║ ' + detKey.padEnd(46) + ' ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\nLệnh: <số> chọn bài | s:<từ> tìm | k:<key> lọc tông | src:<hopamviet|hopamchuan> | all xem tất cả | q thoát');
}

function handleCommand(cmd) {
  cmd = cmd.trim();
  if (!cmd) return true;

  // Thoát
  if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
    detectionRunning = false;
    console.log('👋 Tạm biệt!');
    return false;
  }

  // Xem tất cả
  if (cmd === 'all') { printMenu(); return true; }

  // Tìm kiếm: s:mưa
  if (cmd.startsWith('s:')) {
    const results = lib.search(cmd.slice(2));
    console.log(`\n🔍 Kết quả tìm kiếm (${results.length}):`);
    results.forEach((s, i) => console.log(`  ${i + 1}. ${s.title} — ${s.artist || '?'} | Key: ${s.key || '?'}`));
    return true;
  }

  // Lọc theo tông: k:C  /  k:Am
  if (cmd.startsWith('k:')) {
    printMenu({ key: cmd.slice(2).trim() });
    return true;
  }

  // Lọc theo nguồn: src:hopamviet
  if (cmd.startsWith('src:')) {
    printMenu({ source: cmd.slice(4).trim() });
    return true;
  }

  // Chọn bài theo số
  const num = parseInt(cmd, 10);
  if (!isNaN(num)) {
    const song = lib.getByIndex(num);
    if (song) {
      console.log(`\n🎶 ĐÃ CHỌN: ${song.title} — ${song.artist || '?'}`);
      console.log(`   Key tham khảo (từ web): ${song.key || 'chưa có'}`);
      console.log(`   BPM: ${song.bpm || '?'}`);
      console.log(`   Nguồn: ${song.source || '?'}`);
      if (currentDetectedKey) {
        const match = song.key && song.key.toUpperCase() === currentDetectedKey.toUpperCase();
        console.log(`   🎧 Dò thực tế: ${currentDetectedKey} ${match ? '✅ khớp' : '⚠️ khác — ưu tiên giá trị dò thực tế'}`);
      }
    } else {
      console.log('❌ Không có bài số ' + num);
    }
    return true;
  }

  // Mặc định: tìm kiếm tự do
  const results = lib.search(cmd);
  if (results.length > 0) {
    console.log(`\n🔍 "${cmd}" — ${results.length} kết quả:`);
    results.forEach((s, i) => console.log(`  ${i + 1}. ${s.title} — ${s.artist || '?'} | Key: ${s.key || '?'}`));
  } else {
    console.log(`Không tìm thấy "${cmd}"`);
  }
  return true;
}

async function main() {
  startKeyDetection();
  printMenu();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('> ');
  rl.prompt();

  for await (const line of rl) {
    const cont = handleCommand(line);
    if (!cont) break;
    rl.prompt();
  }
  rl.close();
  process.exit(0);
}

if (require.main === module) main();
