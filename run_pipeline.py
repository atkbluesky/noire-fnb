# -*- coding: utf-8 -*-
"""
NOIRE ANALYTICS HUB — LANE DỮ LIỆU THÔ, CHẠY BẰNG MỘT LỆNH
==========================================================
Lane này CHỈ chạy ở máy local và CHỈ có một nhiệm vụ: biến export gốc
(iPOS · Meta · Google · Zalo) thành bộ Excel đã xử lý trong  data_input/.

    L0 → check_input.py            soi thư mục, báo nguồn thiếu
    L2 → build_hub.py              POS: item · bill · daily · monthly · BOM · lead · target
    L2 → build_mkt.py              Marketing: ads · budget · voucher · OA · member · partner
    L1 → (đã gỡ) — nay dùng tools/build_month.py để dựng data_input/monthly/

Từ đó trở đi mọi thứ do Node lo:  data_input/*.xlsx → scripts/build-data.mjs
→ src/data/*.json → Vite. Xem docs/15_PROCESSED_INPUT_CONTRACT.md.

    QUAN TRỌNG — lane thô KHÔNG ĐƯỢC ghi thẳng vào src/data/.
    Trước đây bước "đồng bộ JSON" chép data.json đè lên bản do Node sinh ra,
    tạo lại đúng cảnh hai bản JSON lệch nhau mà kiến trúc hai lane sinh ra để xoá.
    Bàn giao duy nhất giữa hai lane là  data_input/*.xlsx.

Trình tự KHÔNG được đảo: build_mkt cần bill_index.pkl do build_hub sinh ra.

Tuỳ chọn:
    python run_pipeline.py --skip-check     bỏ bước soi L0
    python run_pipeline.py --hub-only       chỉ chạy khối POS
    python run_pipeline.py --no-export      dừng ở data*.json, không xuất Excel

Biến môi trường:
    NOIRE_ROOT      trỏ tới gốc dữ liệu khác (mặc định: L0_input/ trong dự án)
    NOIRE_CACHE     đổi chỗ để cache Excel
"""
import os, sys, subprocess
# Console Windows mặc định là cp1252 và không in được tiếng Việt: mọi print có dấu
# sẽ ném UnicodeEncodeError và giết cả script giữa chừng. Ép UTF-8 ngay từ đầu.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable or "python"


def run(script, *args):
    path = os.path.join(HERE, script)
    if not os.path.exists(path):
        print("  ✖ không thấy %s — bỏ qua" % script)
        return 1
    print("\n" + "─" * 78)
    print("▶ %s %s" % (script, " ".join(args)))
    print("─" * 78)
    return subprocess.call([PY, path, *args], cwd=HERE)


def main():
    a = sys.argv[1:]
    t0 = datetime.now()
    print("=" * 78)
    print("NOIRE ANALYTICS HUB — LANE THÔ   %s" % t0.strftime("%d/%m/%Y %H:%M"))
    print("Gốc dữ liệu: %s" % (os.environ.get("NOIRE_ROOT") or os.path.join(HERE, "L0_input")))
    print("=" * 78)

    if "--skip-check" not in a:
        run("check_input.py")

    rc = run("build_hub.py")
    if rc:
        print("\n✖ build_hub.py lỗi (mã %d) — DỪNG. Không chạy tiếp để tránh sinh số sai." % rc)
        return rc

    if "--hub-only" not in a:
        run("build_mkt.py")

    if "--no-export" not in a:
        # tools/export_workbooks.py ĐÃ GỠ (10/09/2026) — nó ghi 02_sales.xlsx và
        # 03_marketing.xlsx vào data_input/, nơi nay đã có monthly/YYYY-MM.xlsx.
        # Loader gộp mọi .xlsx trong data_input/ nên hai bộ file sẽ CỘNG ĐÔI.
        print("   ! Buoc xuat Excel da go. Dung: python tools/build_month.py YYYY-MM")

    dt = (datetime.now() - t0).total_seconds()
    print("\n" + "=" * 78)
    print("HOÀN TẤT trong %.0f giây" % dt)
    print("  · Đọc qa_log_*.txt để xem kết quả 11 chốt QA")
    print("  · Bàn giao sang lane chính:  npm run build:data")
    print("  · Xem bản web            :  npm run dev  →  http://localhost:3001")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
