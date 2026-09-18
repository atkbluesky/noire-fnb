# -*- coding: utf-8 -*-
"""
NOIRE ANALYTICS HUB — LỐI VÀO CŨ, GIỮ ĐỂ KHÔNG GÃY THÓI QUEN
============================================================
Từ 16/09/2026 toàn bộ lane dữ liệu thô chạy qua MỘT lệnh: update.py
(hoặc nháy đúp CAP_NHAT.bat). File này chỉ chuyển tiếp sang đó.

    python run_pipeline.py            ≡  python update.py --force   (dựng lại TẤT CẢ)
    python run_pipeline.py --check    ≡  python update.py --check   (chỉ kiểm kê thiếu file)

Trước đây file này chạy check_input → build_hub → build_mkt nhưng KHÔNG dựng
data_input/monthly/ và KHÔNG đưa kết quả của build_hub/build_mkt vào data_input/ —
nên chạy xong dashboard vẫn không đổi. Hai đường chạy song song là thứ đã gây lệch số.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
    args = sys.argv[1:]
    fwd = ["--check"] if "--check" in args else ["--force"]
    sys.exit(subprocess.call([sys.executable, os.path.join(HERE, "update.py"), *fwd], cwd=HERE))
