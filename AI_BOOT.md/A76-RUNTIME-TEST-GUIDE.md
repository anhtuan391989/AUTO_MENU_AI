# A76 — Hướng dẫn tự kiểm tra AI trên máy Windows thật

Claude không có máy Windows/loa/mic để tự chạy phần này — cần bạn làm trên máy thật rồi gửi lại
kết quả (chụp màn hình hoặc mô tả ngắn từng dòng là đủ, không cần chi tiết kỹ thuật).

**Chuẩn bị 1 lần:** mở AUTO_MENU_AI → Setup → chọn MIC (mục "Audio Interface") → chọn
SYSTEM_AUDIO (mục "🎵 SYSTEM_AUDIO Input", chọn Mix 01 hoặc thiết bị bạn đã xác nhận ở A67). Có
sẵn 1 bài nhạc biết trước BPM (vd. tìm "120 BPM click track" trên YouTube) để test dễ so sánh.

Ghi lại kết quả vào đúng bảng dưới — chỉ cần PASS/FAIL + 1 câu mô tả ngắn, không cần log kỹ thuật.

---

## 1. SYSTEM_AUDIO khởi động
1. Mở Menu. 2. Mở Setup, xác nhận đã chọn SYSTEM_AUDIO. 3. Quay lại Menu, phát 1 đoạn nhạc.
4. Quan sát chữ cạnh BPM (NO SOURCE/STARTING/ANALYZING → số BPM thật).

| Bước | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| Mở Setup chọn SYSTEM_AUDIO | — | | |
| Phát nhạc | Chữ chuyển dần NO SOURCE→ANALYZING→ra số | | |

## 2. MIC có lẫn vào Music/BPM không
- **Case A:** chỉ phát nhạc (im lặng, không nói) — MIC VU đứng yên gần 0, Music VU nhảy.
- **Case B:** chỉ nói vào mic (tắt nhạc) — MIC VU nhảy, Music VU đứng yên gần 0, BPM không đổi vì nói.
- **Case C:** vừa nói vừa phát nhạc — cả 2 VU đều nhảy, độc lập nhau.

| Case | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| A — chỉ nhạc | MIC VU≈0, Music VU>0 | | |
| B — chỉ nói | MIC VU>0, Music VU≈0 | | |
| C — cả 2 | 2 VU độc lập | | |

## 3. BPM
Phát nhạc có BPM biết trước (vd 120). Chờ ~10-15 giây.

| Bước | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| Số BPM hiện ra | Gần đúng BPM thật bài nhạc | | |
| Tắt nhạc | BPM không đứng yên mãi ở số cũ — reset về trạng thái chờ | | |
| Phát lại | BPM detect lại | | |

## 4. KEY
| Bước | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| Phát nhạc, chờ Key hiện ra | Ra tên hợp âm/key | | |
| Tắt nhạc | Key không đứng yên mãi | | |

## 5. MOD (nếu bạn có dùng tính năng chuyển tone theo modulation)
| Bước | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| Phát nhạc có đổi tone (modulation) rõ | Mod bắt được | | |
| Tắt nhạc giữa chừng, phát lại | Không bị kẹt/báo sai | | |

## 6. AUTO DETECT
1. Đang phát nhạc, có BPM/Key/Mod hiện ra. 2. Bấm "Auto Detect". 3. Quan sát cả 3 có reset và dò
lại không (không chỉ Key).

| Bước | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| Bấm Auto Detect 1 lần | BPM+Key+Mod đều reset rồi dò lại | | |
| Bấm liên tiếp 3 lần | Không bị treo, không mất tiếng, không lỗi | | |

## 7. Đổi thiết bị / mất kết nối
| Bước | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| Rút/tắt thiết bị SYSTEM_AUDIO đang dùng | BPM/Key dừng, không đứng hình ở số cũ | | |
| Cắm/bật lại | Tự dò lại được, không cần khởi động lại app | | |
| Đổi sang thiết bị khác trong Setup | Chuyển hẳn sang nguồn mới, không lẫn nguồn cũ | | |

## 8. Danh sách thiết bị (DevTools)
1. Mở Menu → `Ctrl+Shift+I` → tab Console.
2. Gõ `enumerateAudioDevices().then(r => console.log(r))`, Enter.
3. So sánh với danh sách thật trong Windows Sound Settings.

| Kiểm tra | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| Danh sách audioinput | Đủ mic/Mix 01/thiết bị khác | | |
| Danh sách audiooutput | Đủ loa/tai nghe | | |

## 9. Audio Interface = MIC (không phải SYSTEM_AUDIO)
| Bước | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| Đổi MIC trong Setup sang thiết bị khác | Chỉ MIC đổi, SYSTEM_AUDIO không bị ảnh hưởng | | |

## 10. Setup Complete
| Bước | Mong đợi | Thực tế | PASS/FAIL |
|---|---|---|---|
| Xoá lựa chọn SYSTEM_AUDIO (chọn None) | Setup báo CHƯA hoàn tất | | |
| Chọn lại SYSTEM_AUDIO hợp lệ + mọi mục khác đã xong | Setup báo ĐÃ hoàn tất | | |

---

**Gửi lại:** bảng đã điền (chụp màn hình cũng được) + bất kỳ ảnh chụp lỗi nào nếu có FAIL. Không
cần làm hết 1 lúc — gửi dần, tôi sẽ cập nhật A76-REPORT.md theo từng phần.
