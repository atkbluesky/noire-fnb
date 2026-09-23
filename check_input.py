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
  5. CỔNG CHUẨN HOÁ: thư mục nào có file KHÔNG đúng mẫu chuẩn — file nào đã có bộ chuyển để
     nạp vào schema chuẩn, file nào chưa (đang không được đọc). Chi tiết: python tools/l0_ingest.py

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
    # ── Cổng chuẩn hoá đầu vào: file lạ trong thư mục nguồn ──────────────────────
    try:
        import l0_ingest as ING
        from monthly_lib import SOURCES
        stray = [(sid, os.path.basename(p)) for sid in SOURCES for p in ING.stray_files(sid)]
        if stray:
            has = {a["source"] for a in ING.ADAPTERS}
            print("\n■ CỔNG CHUẨN HOÁ — file không đúng mẫu tên chuẩn")
            for sid, f in stray:
                mark = "đã có bộ chuyển → nạp vào file chuẩn" if sid in has else "CHƯA CÓ BỘ CHUYỂN — KHÔNG được đọc"
                print(f"   {sid:18} {f[:52]:54} {mark}")
            print("   chi tiết:  python tools/l0_ingest.py")
    except Exception as e:  # noqa: BLE001
        print(f"\n⚠ không chạy được cổng chuẩn hoá: {str(e)[:80]}")
    print("\nCập nhật dashboard:  nháy đúp CAP_NHAT.bat  (hoặc python update.py)")
    return 1 if bad_req else 0


if __name__ == "__main__":
    sys.exit(main())
