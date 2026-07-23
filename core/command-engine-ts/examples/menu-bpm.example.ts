// menu-bpm.example.ts
// Chạy ở RENDERER PROCESS (chính là menu UI của bạn).
// Ví dụ này dùng vanilla DOM cho dễ hiểu — áp dụng tương tự nếu bạn dùng
// React/Vue, chỉ cần đặt get() vào useEffect ban đầu và onChange() vào subscribe.

declare global {
  interface Window {
    dawAPI: Record<
      'status' | 'key' | 'bpm' | 'mod' | 'monitor' | 'knob',
      {
        get: () => Promise<unknown>;
        set: (value: unknown) => Promise<void>;
        onChange: (cb: (value: unknown) => void) => () => void;
      }
    >;
  }
}

async function initBpmControl(): Promise<() => void> {
  const bpmLabel = document.querySelector<HTMLElement>('#bpm-value')!;
  const bpmSlider = document.querySelector<HTMLInputElement>('#bpm-slider')!;

  // 1. Lấy giá trị hiện tại ngay khi menu mở lên
  const current = await window.dawAPI.bpm.get();
  bpmLabel.textContent = String(current);
  bpmSlider.value = String(current);

  // 2. User kéo slider trên menu -> gửi lệnh xuống module (qua IPC -> Command Engine -> driver)
  const handleInput = () => {
    window.dawAPI.bpm.set(Number(bpmSlider.value));
  };
  bpmSlider.addEventListener('input', handleInput);

  // 3. Module tự đổi giá trị (AI gọi, tap-tempo...) -> menu tự cập nhật lại, không cần user làm gì
  const unsubscribe = window.dawAPI.bpm.onChange((value) => {
    bpmLabel.textContent = String(value);
    bpmSlider.value = String(value);
  });

  // Trả về hàm dọn dẹp — gọi khi đóng menu/màn hình này
  return () => {
    bpmSlider.removeEventListener('input', handleInput);
    unsubscribe();
  };
}

initBpmControl();
