// hotkey.driver.ts
// Gửi lệnh tới AHK service nền (đã đề cập ở phần trước) qua named pipe/socket
// thay vì spawn 1 file .ahk mới cho mỗi thao tác.

import type { Command } from '../modules/base.module';
import type { Driver } from '../engine/command-engine';

// Bảng map action -> tên phím tắt đã định nghĩa sẵn trong AHK service.
//
// CÁC DÒNG "studio_one_*" LÀ PLACEHOLDER — cần mở Studio One > Preferences >
// Keyboard Shortcuts (hoặc Options > Edit Commands tuỳ phiên bản), tìm đúng Key
// Command đang được gán cho từng hành động, rồi sửa lại giá trị cho khớp.
// Đây chỉ là bước gửi phím SAU KHI đã activate cửa sổ Studio One — không click,
// không di chuyển chuột.
const HOTKEY_MAP: Record<string, string> = {
  set_transport_status: 'space', // play/pause trong hầu hết DAW

  set_monitor_buttons: 'ctrl+m',

  // Studio One — mặc định thường gặp, CẦN BẠN XÁC NHẬN LẠI trong Keyboard Shortcuts:
  transport_play: 'space',
  transport_stop: 'space',
  transport_record: 'numpadmult', // phím * — kiểm tra lại, có bản gán phím khác
  save_song: 'ctrl+s',
  track_select_next: 'down',
  track_select_prev: 'up',
  trigger_macro: 'f1', // đổi theo đúng phím bạn gán cho Macro Toolbar/Command bạn muốn AI gọi
};

export const hotkeyDriver: Driver = {
  async send(command: Command): Promise<void> {
    const hotkey = HOTKEY_MAP[command.action];
    if (!hotkey) {
      throw new Error(`[hotkeyDriver] Không có hotkey map cho action "${command.action}"`);
    }
    // TODO: gửi qua named pipe/socket tới AHK service nền, ví dụ:
    // await ahkSocket.write(JSON.stringify({ hotkey, value: command.value }));
    console.log(`[hotkeyDriver] Gửi hotkey "${hotkey}" <- ${JSON.stringify(command.value)}`);
  },
};
