# -*- coding: utf-8 -*-
"""
DỰNG FILE TRACKING SALES TỪ L0_input
====================================
    python tools/tracking.py

NOIRE_Tracking_Sales_2026.xlsx là xương sống doanh thu (store_month · daily · target)
nhưng KHÔNG phải file thô — nó do tool `09 Tracking Sales Tool/build_tracking.py` sinh
từ file export doanh thu ngày + config_targets.csv.

Script này chạy CHÍNH tool đó (không chép logic sang đây — chép là thành hai bản và
sẽ lệch), chỉ đổi ba đường dẫn:
    nguồn   ← L0_input/01_DOANH_THU/01_Doanh_Thu_Ngay/   (S03_daily, lấy file mới nhất)
    target  ← L0_input/01_DOANH_THU/02_Target/config_targets.csv   (S00_targets)
    đầu ra  → _cache/tracking/NOIRE_Tracking_Sales_2026.xlsx

Tool nằm ở thư mục khác thì đặt biến môi trường NOIRE_TRACKING_TOOL trỏ tới build_tracking.py.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import ROOT, l0_dir, l0_latest  # noqa: E402

OUT = Path(ROOT) / "_cache" / "tracking" / "NOIRE_Tracking_Sales_2026.xlsx"
TOOL_CANDIDATES = [
    os.environ.get("NOIRE_TRACKING_TOOL"),
    os.path.join(ROOT, "..", "..", "..", "09 Tracking Sales Tool", "build_tracking.py"),
    r"D:\PROJECT\3. HIGHGATE 5.2026\09 Tracking Sales Tool\build_tracking.py",
]


def find_tool():
    for c in TOOL_CANDIDATES:
        if c and os.path.isfile(c):
            return os.path.abspath(c)
    return None


def inputs_signature():
    """Chữ ký đầu vào — update.py dùng để biết có cần dựng lại hay không."""
    src, tgt = l0_latest("S03_daily"), l0_latest("S00_targets")
    sig = []
    for p in (src, tgt):
        if p:
            st = os.stat(p)
            sig.append(f"{os.path.basename(p)}:{st.st_size}:{int(st.st_mtime)}")
    return "|".join(sig)


def build():
    tool = find_tool()
    if not tool:
        print("  ✖ không thấy build_tracking.py — đặt NOIRE_TRACKING_TOOL trỏ tới file đó.")
        return 2
    src_dir, tgt = l0_dir("S03_daily"), l0_latest("S00_targets")
    if not src_dir or not l0_latest("S03_daily"):
        print("  ✖ L0_input/01_DOANH_THU/01_Doanh_Thu_Ngay/ chưa có file revenue-report-group-by-date*.xlsx")
        return 2
    spec = importlib.util.spec_from_file_location("noire_build_tracking", tool)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.RAW_HINTS = [Path(src_dir)]
    mod.ROOT = Path(src_dir)            # chặn bước dò đệ quy toàn ổ đĩa khi không thấy file
    mod.TARGETS = Path(tgt) if tgt else Path(src_dir) / "config_targets.csv"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    mod.OUT_FILE = OUT
    try:
        mod.main()
    except SystemExit as e:             # tool dùng sys.exit() để báo lỗi
        if e.code not in (None, 0):
            print(f"  ✖ build_tracking.py dừng: {e.code}")
            return 2
    return 0 if OUT.exists() else 2


if __name__ == "__main__":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    sys.exit(build())
