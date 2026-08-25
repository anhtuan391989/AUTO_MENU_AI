// renderer/menu.js — phần xử lý khi người dùng gõ lệnh trong Menu AI

async function onSubmitCommand(userText) {
  showLoading(true);

  const result = await window.aiMenu.sendCommand(userText);

  showLoading(false);

  if (!result.ok && result.stage === 'ai') {
    // AI không nhận diện được lệnh -> giữ hành vi cũ: chỉ hiển thị
    showMessage(`Không nhận diện được lệnh: ${result.detail}`);
    return;
  }

  if (result.ok) {
    showMessage(`Đã thực thi "${result.intent.action}" qua ${result.driverUsed}`);
  } else {
    showMessage(`Lệnh nhận diện được nhưng thực thi thất bại: ${result.detail}`);
  }
}
