# -*- coding: utf-8 -*-
"""
NOIRE ANALYTICS HUB — KIỂM KÊ FILE EXCEL THÔ (L0_input)
=======================================================
    python check_input.py

Soi L0_input/ theo sổ đăng ký data_sources.json và trả lời:
  1. Nguồn nào chưa có file?
  2. Nguồn theo tháng thiếu THÁNG nào (tới tháng đã khép sổ gần nhất)?
  3. Tháng nào có nhiều file (hệ thống lấy bản mới nhất, bỏ qua bản nào)?
  4. File nào đặt tên không đọc được tháng (bị bỏ qua)?

Chỉ đọc thư mục, không mở Excel, không sửa gì. Mã thoát 1 = thiếu nguồn bắt buộc.
Logic nằm ở tools/l0_report.py — update.py in đúng báo cáo này sau mỗi lần cập nhật.
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "tools"))
from l0_report import build_report  # noqa: E402


def main():
    lines, bad_req, _ = build_report()
    print("\n".join(lines))
    # Độ đủ của một tháng — mặc định tháng đã khép sổ gần nhất (python check_input.py 2026-08)
    try:
        from month_audit import render
        from monthly_lib import last_closed_month
        month = next((a for a in sys.argv[1:] if len(a) == 7 and a[4] == "-"), last_closed_month())
        print("")
        print("\n".join(render(month)[0]))
    except Exception as e:  # noqa: BLE001
        print(f"\n⚠ không chạy được kiểm tra độ đủ tháng: {str(e)[:80]}")
    print("\nCập nhật dashboard:  nháy đúp CAP_NHAT.bat  (hoặc python update.py)")
    return 1 if bad_req else 0


if __name__ == "__main__":
    sys.exit(main())
