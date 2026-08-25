import requests
import time
import json
import subprocess
import os
from datetime import datetime

# ================= CẤU HÌNH =================
REPO_OWNER = "anhtuan391989"
REPO_NAME = "AUTO_MENU_AI"
BRANCH = "main"
CHECK_INTERVAL = 60  # Kiểm tra mỗi 60 giây = 1 phút
LOCAL_REPO_PATH = os.path.dirname(os.path.abspath(__file__))  # Thư mục chứa script
HISTORY_FILE = os.path.join(LOCAL_REPO_PATH, "update_history.log")
STATE_FILE = os.path.join(LOCAL_REPO_PATH, ".monitor_state.json")
# ============================================

GITHUB_API = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}"

def load_last_state():
    """Nạp trạng thái lần kiểm tra trước"""
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"last_sha": None, "last_check": None}

def save_state(sha):
    """Lưu trạng thái hiện tại"""
    data = {
        "last_sha": sha,
        "last_check": datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    }
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def log_message(message):
    """Ghi thông báo ra màn hình và tệp lịch sử"""
    now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    line = f"[{now}] {message}"
    print(line)
    with open(HISTORY_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def get_latest_commit_sha():
    """Lấy mã commit mới nhất từ GitHub"""
    url = f"{GITHUB_API}/commits/{BRANCH}"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        return resp.json()["sha"]
    except Exception as e:
        log_message(f"⚠️ Lỗi kết nối GitHub: {str(e)}")
        return None

def get_commit_details(sha):
    """Lấy chi tiết nội dung commit"""
    url = f"{GITHUB_API}/commits/{sha}"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return {
            "message": data["commit"]["message"],
            "author": data["commit"]["author"]["name"],
            "date": data["commit"]["author"]["date"],
            "changed_files": len(data["files"]),
            "files": [f["filename"] for f in data["files"]]
        }
    except Exception as e:
        return {"error": str(e)}

def pull_latest_changes():
    """Tự động kéo code mới nhất về máy"""
    try:
        result = subprocess.run(
            ["git", "pull", "origin", BRANCH],
            cwd=LOCAL_REPO_PATH,
            capture_output=True,
            text=True,
            timeout=120
        )
        return result.returncode == 0, result.stdout + "\n" + result.stderr
    except Exception as e:
        return False, str(e)

def check_key_changes(files):
    """Kiểm tra xem có tệp cấu hình / Key bị thay đổi không"""
    key_related = []
    for f in files:
        fn = f.lower()
        if any(word in fn for word in [".env", "config", "setting", "key", "secret", "auth", ".json"]):
            key_related.append(f)
    return key_related

def main():
    log_message("🚀 Bắt đầu giám sát GitHub AUTO_MENU_AI — kiểm tra mỗi phút")
    log_message(f"📌 Kho: {REPO_OWNER}/{REPO_NAME} | Nhánh: {BRANCH}")
    log_message("-" * 70)

    last_state = load_last_state()
    last_sha = last_state["last_sha"]

    while True:
        current_sha = get_latest_commit_sha()

        if current_sha is None:
            log_message("⏳ Thử lại sau 1 phút...")
            time.sleep(CHECK_INTERVAL)
            continue

        if last_sha is None:
            log_message(f"✅ Lần đầu chạy — phiên bản hiện tại: {current_sha[:12]}")
            save_state(current_sha)
            last_sha = current_sha

        elif current_sha != last_sha:
            log_message("🔔 PHÁT HIỆN CẬP NHẬT MỚI trên GitHub!")
            details = get_commit_details(current_sha)

            if "error" not in details:
                log_message(f"📝 Nội dung: {details['message']}")
                log_message(f"👤 Người sửa: {details['author']}")
                log_message(f"📂 Số tệp thay đổi: {details['changed_files']}")
                for f in details["files"]:
                    log_message(f"   └─ {f}")

                # Kiểm tra tệp liên quan đến Key
                key_files = check_key_changes(details["files"])
                if key_files:
                    log_message("⚠️ CẢNH BÁO: Phát hiện thay đổi tệp cấu hình/Key!")
                    for f in key_files:
                        log_message(f"   ⚠️ {f}")

            log_message("🔄 Đang kéo code mới về máy...")
            ok, output = pull_latest_changes()
            if ok:
                log_message("✅ CẬP NHẬT THÀNH CÔNG! Đã đồng bộ với GitHub.")
            else:
                log_message(f"❌ Lỗi khi kéo code: {output[:300]}")

            save_state(current_sha)
            last_sha = current_sha
            log_message("-" * 70)

        else:
            # Thông báo nhẹ mỗi 5 phút để biết vẫn hoạt động
            pass

        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log_message("👋 Đã dừng giám sát.")