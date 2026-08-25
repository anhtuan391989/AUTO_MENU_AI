const { ipcMain } = require('electron'); // trong main process của Electron
const CommandEngine = require('./commandEngine');
const { parseCommand } = require('./aiLayer');
const MidiDriver = require('./drivers/midiDriver');
const OscDriver = require('./drivers/oscDriver');
const HotkeyDriver = require('./drivers/hotkeyDriver');
const MouseDriver = require('./drivers/mouseDriver');

const engine = new CommandEngine();
engine.registerDriver(new MidiDriver());
engine.registerDriver(new OscDriver());
engine.registerDriver(new HotkeyDriver());
engine.registerDriver(new MouseDriver());

// Ghi log mọi kết quả, đồng thời đẩy về renderer để hiển thị cho người dùng
engine.on('feedback', (entry) => {
  console.log('[CommandEngine]', entry);
  // mainWindow.webContents.send('command-feedback', entry);
});

/**
 * Đây là điểm nối bạn đang thiếu: Menu AI hiện tại chỉ HIỂN THỊ câu trả lời của AI.
 * Handler dưới đây nhận nguyên văn text người dùng gõ trong menu, để AI layer phân tích
 * thành intent chuẩn hoá, rồi đưa thẳng cho Command Engine thực thi — thay vì dừng lại
 * ở bước hiển thị.
 */
ipcMain.handle('ai-command', async (_event, userText) => {
  const parsed = await parseCommand(userText);

  if (!parsed.ok) {
    // AI không nhận diện được lệnh -> trả về để menu hiển thị như bình thường,
    // không có gì để Command Engine thực thi cả.
    return { ok: false, stage: 'ai', detail: parsed.detail };
  }

  const result = await engine.dispatch(parsed.intent);
  return { ok: result.ok, stage: 'execution', ...result, intent: parsed.intent };
});
