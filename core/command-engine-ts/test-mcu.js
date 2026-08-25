// test-mcu.js
// Script test THỦ CÔNG — KHÔNG phải code chính thức của app, chỉ để kiểm tra
// đường truyền loopMIDI -> Mackie Control -> Studio One có hoạt động không,
// trước khi viết mcuDriver.ts thật.
//
// CÁCH CHẠY (trên máy Windows, ngoài project, không phải trong sandbox này):
//   1. Cài Node.js nếu chưa có (nodejs.org).
//   2. Mở cmd/PowerShell, cd vào thư mục chứa file này.
//   3. npm install easymidi
//   4. node test-mcu.js
//
// Script sẽ tự liệt kê các cổng MIDI Output đang có trên máy bạn, tìm cổng tên
// "Mackie2DAW" (đúng tên bạn đặt trong loopMIDI), rồi lần lượt gửi Play -> đợi
// 2 giây -> Stop -> đợi 2 giây -> Record. Bạn chỉ cần nhìn Studio One để xem
// transport có phản hồi đúng theo từng lệnh không.

const easymidi = require('easymidi');

const PORT_NAME_HINT = 'Mackie2DAW'; // đổi lại nếu bạn đặt tên khác trong loopMIDI
const CHANNEL = 0; // easymidi dùng channel 0-15 (channel MIDI 1 = 0)

const NOTES = {
  play: 94,   // 0x5E
  stop: 93,   // 0x5D
  record: 95, // 0x5F
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pressButton(output, name, note) {
  console.log(`--> Gửi "${name}" (note ${note})...`);
  output.send('noteon', { note, velocity: 127, channel: CHANNEL });
  await sleep(100); // giữ 100ms rồi nhả ra, giống 1 lần bấm nút thật
  output.send('noteoff', { note, velocity: 0, channel: CHANNEL });
}

async function main() {
  const outputs = easymidi.getOutputs();
  console.log('Các cổng MIDI Output đang có trên máy:', outputs);

  const portName = outputs.find((p) => p.includes(PORT_NAME_HINT));
  if (!portName) {
    console.error(
      `Không tìm thấy cổng chứa tên "${PORT_NAME_HINT}". Kiểm tra lại: loopMIDI đã mở chưa? ` +
      `Tên cổng bạn đặt trong loopMIDI có đúng không? Sửa PORT_NAME_HINT ở đầu file cho khớp.`,
    );
    process.exit(1);
  }

  console.log(`Đang mở cổng: "${portName}"`);
  const output = new easymidi.Output(portName);

  await pressButton(output, 'PLAY', NOTES.play);
  console.log('Nhìn Studio One: transport có bắt đầu chạy không? Đợi 2 giây rồi gửi STOP...');
  await sleep(2000);

  await pressButton(output, 'STOP', NOTES.stop);
  console.log('Nhìn Studio One: transport có dừng lại không? Đợi 2 giây rồi gửi RECORD...');
  await sleep(2000);

  await pressButton(output, 'RECORD', NOTES.record);
  console.log('Nhìn Studio One: nút Record có bật lên không?');

  output.close();
  console.log('Xong. Nếu cả 3 lệnh Studio One đều phản hồi đúng -> setup Mackie Control đã chuẩn.');
}

main().catch((err) => {
  console.error('Lỗi khi chạy test:', err);
  process.exit(1);
});
