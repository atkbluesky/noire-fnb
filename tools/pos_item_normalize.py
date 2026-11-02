# -*- coding: utf-8 -*-
"""
CHUẨN HOÁ BÁO CÁO BÁN HÀNG BỐ CỤC MỚI CỦA iPOS (từ T10/2026)
=============================================================
    python tools/pos_item_normalize.py 2026-10          chuyển file của tháng đó
    python tools/pos_item_normalize.py 2026-10 --dry    chỉ kiểm tra, không ghi gì

Export T10/2026 đổi bố cục so với mẫu chuẩn (S01_item):
  · sheet `Tất cả cửa hàng` KHÔNG còn cột `Cửa hàng` và `Giờ`;
  · `Thời gian` là số mili-giây (epoch, giờ VN = UTC+7) thay vì `dd/mm/yyyy HH:MM:SS`;
  · đổi tên: `Giá gốc` · `Phiếu GG` · `VAT (%)` · `Thuế khấu trừ` · `Mã hoá đơn` · `Số HĐ`.

Không có cột `Cửa hàng` thì build_month.py bỏ mọi dòng và build_hub.py dừng hẳn; update.py còn
dời file vào _REJECT vì sai mẫu. Công cụ này đưa file về ĐÚNG mẫu chuẩn để hệ thống đọc như mọi
tháng, không phải sửa bộ đọc:

  · `Cửa hàng`, `Giờ` (= Giờ vào) lấy từ bảng kê hoá đơn CÙNG THÁNG theo `Mã hoá đơn` — không đoán;
  · `Ngày` đổi từ mili-giây; đã đối soát T10/2026: khớp `Ngày chứng từ` 100%, trùng `Giờ ra` 100%;
  · cột file gốc không có (`Mã combo`, `Nhân viên`, `Ghi chú`, `Tổng tiền (không bao gồm VAT)`,
    `Tổng tiền (bao gồm hoa hồng)`) ĐỂ TRỐNG. Bộ đọc lấy `Nhân viên` ở bảng kê, không lấy ở đây.

DỪNG, không ghi gì nếu: thiếu bảng kê, có dòng món không khớp hoá đơn, hoặc `Tổng tiền` theo cửa
hàng lệch bảng kê quá 1 đồng. Bản gốc iPOS dời sang L0_input/_GOC_iPOS/ (giữ cấu trúc thư mục).
File đã đúng mẫu thì bỏ qua — chạy lại nhiều lần vô hại.
"""
from __future__ import annotations

import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import L0_ROOT, l0_month_file, norm, store_code  # noqa: E402

VN = timezone(timedelta(hours=7))
ALL_SHEET = "tất cả cửa hàng"
TOL = 1  # đồng

# Mẫu chuẩn (như `Báo cáo bán hàng tháng 9.2026.xlsx`) → tên cột ở bố cục mới; None = file gốc không có.
STD_COLS = [
    ("Cửa hàng", None), ("Mã hàng", "Mã hàng"), ("Tên hàng", "Tên hàng"), ("Nhóm món", "Nhóm món"),
    ("Loại món", "Loại món"), ("Mã combo", None), ("PTTT", "PTTT"), ("Nguồn", "Nguồn"),
    ("Khu vực", "Khu vực"), ("Bàn", "Bàn"), ("Hoá đơn", "Mã hoá đơn"), ("Số hoá đơn", "Số HĐ"),
    ("Ngày", None), ("Giờ", None), ("Số lượng", "Số lượng"), ("Đơn vị tính", "Đơn vị tính"),
    ("Giá", "Giá gốc"), ("Giá bán", "Giá bán"), ("Thành tiền", "Thành tiền"), ("Giảm giá", "Giảm giá"),
    ("Chiết khấu", "Chiết khấu"), ("Phí hỗ trợ marketing", "Phí hỗ trợ marketing"),
    ("Phiếu giảm giá", "Phiếu GG"), ("Phí dịch vụ", "Phí dịch vụ"), ("VAT %", "VAT (%)"),
    ("Thuế", "Thuế"), ("Khấu trừ thuế", "Thuế khấu trừ"), ("Giảm giá VAT", "Giảm giá VAT"),
    ("Phí ship", "Phí ship"), ("Tổng tiền (không bao gồm VAT)", None), ("Hoa hồng", "Hoa hồng"),
    ("Tổng tiền (bao gồm hoa hồng)", None), ("Tên CTKM", "Tên CTKM"), ("Mã voucher", "Mã voucher"),
    ("Tên khách", "Tên khách"), ("Số khách", "Số khách"), ("Số điện thoại", "Số điện thoại"),
    ("Tổng tiền", "Tổng tiền"), ("Nhân viên", None), ("Ghi chú", None),
    ("Tiền VAT ngược", "Tiền VAT ngược"),   # cột mới của iPOS — giữ lại, loader bỏ qua cột lạ
]


def _clean(v):
    return str(v).replace("​", "").replace("﻿", "").strip() if v is not None else ""


def _all_sheet_rows(path):
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    names = [n for n in wb.sheetnames if norm(n) == ALL_SHEET]
    if not names:
        wb.close()
        raise ValueError(f"{os.path.basename(path)}: không có sheet 'Tất cả cửa hàng'")
    ws = wb[names[0]]
    ws.reset_dimensions()
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()
    return rows


def _is_new_layout(head):
    cols = {_clean(c) for c in head}
    return "Mã hàng" in cols and "Thời gian" in cols and "Cửa hàng" not in cols and "Giờ" not in cols


def _read_bills(path):
    """{mã hoá đơn: (cửa hàng, giờ vào, ngày chứng từ, net)} — bỏ dòng tổng (không có Số HĐ)."""
    rows = _all_sheet_rows(path)
    hi = next(i for i, r in enumerate(rows) if "Mã hoá đơn" in {_clean(c) for c in r})
    ix = {_clean(c): j for j, c in enumerate(rows[hi])}
    out = {}
    for r in rows[hi + 1:]:
        if _clean(r[ix["Số HĐ"]]):
            out[_clean(r[ix["Mã hoá đơn"]])] = (_clean(r[ix["Cửa hàng"]]), _clean(r[ix["Giờ vào"]]),
                                                _clean(r[ix["Ngày chứng từ"]]), r[ix["Tổng tiền"]] or 0)
    return out


def _stamp(ms):
    return datetime.fromtimestamp(ms / 1000, VN)


def convert(rows, bills):
    """→ (dòng mẫu chuẩn gồm cả dòng tổng cuối, [lỗi])."""
    head = [_clean(c) for c in rows[0]]
    ix = {c: j for j, c in enumerate(head)}
    errs = [f"thiếu cột {src}" for _, src in STD_COLS if src and src not in ix]
    for need in ("Mã hoá đơn", "Thời gian", "Tổng tiền"):
        if need not in ix:
            errs.append(f"thiếu cột {need}")
    if errs:
        return [], errs
    out, orphan, off_day = [], 0, 0
    item_net, bill_net = defaultdict(float), defaultdict(float)
    for inv, b in bills.items():
        bill_net[store_code(b[0]) or b[0]] += b[3]
    for r in rows[1:]:
        cell = lambda name: r[ix[name]] if ix[name] < len(r) else None  # noqa: E731
        if not _clean(cell("Mã hàng")):               # dòng tổng cuối sheet: giữ, cột định danh để trống
            out.append([None if src is None else cell(src) for _, src in STD_COLS])
            continue
        b = bills.get(_clean(cell("Mã hoá đơn")))
        if not b:
            orphan += 1
            continue
        when = _stamp(cell("Thời gian"))
        off_day += when.strftime("%d/%m/%Y") != b[2]
        filled = {"Cửa hàng": b[0], "Ngày": when.strftime("%d/%m/%Y %H:%M:%S"), "Giờ": b[1]}
        out.append([filled.get(std, "") if src is None else cell(src) for std, src in STD_COLS])
        item_net[store_code(b[0]) or b[0]] += cell("Tổng tiền") or 0
    if orphan:
        errs.append(f"{orphan} dòng món không khớp hoá đơn trong bảng kê cùng tháng")
    if off_day:
        errs.append(f"{off_day} dòng món có ngày khác Ngày chứng từ của hoá đơn")
    for c in sorted(set(item_net) | set(bill_net)):
        if abs(item_net[c] - bill_net[c]) > TOL:
            errs.append(f"{c}: Tổng tiền món {item_net[c]:,.0f} ≠ bảng kê {bill_net[c]:,.0f}")
    return out, errs


def write_std(path, rows):
    from openpyxl import Workbook
    wb = Workbook(write_only=True)
    ws = wb.create_sheet("Tất cả cửa hàng")
    ws.append([c for c, _ in STD_COLS])
    for r in rows:
        ws.append(r)
    wb.save(path)


def normalize(month, dry=False):
    item_f, bill_f = l0_month_file("S01_item", month), l0_month_file("S02_bill", month)
    if not item_f:
        print(f"✖ không có Báo cáo bán hàng tháng {month}")
        return 2
    rows = _all_sheet_rows(item_f)
    if not _is_new_layout(rows[0]):
        print(f"✔ {os.path.basename(item_f)} đã đúng mẫu chuẩn — không cần chuyển")
        return 0
    if not bill_f:
        print(f"✖ thiếu bảng kê hoá đơn tháng {month} — không có nguồn để lấy Cửa hàng và Giờ")
        return 2
    bills = _read_bills(bill_f)
    out, errs = convert(rows, bills)
    if errs:
        print(f"✖ KHÔNG chuyển {os.path.basename(item_f)}:")
        print("\n".join(f"   · {e}" for e in errs))
        return 2
    print(f"✔ {os.path.basename(item_f)}: {len(rows) - 2} dòng món khớp {len(bills)} hoá đơn · "
          "Tổng tiền từng cửa hàng khớp bảng kê")
    if dry:
        print("  (--dry: chưa ghi gì)")
        return 0
    rel = os.path.relpath(item_f, L0_ROOT)
    keep = os.path.join(L0_ROOT, "_GOC_iPOS", rel)
    if os.path.exists(keep):
        print(f"✖ đã có bản gốc ở {keep} — dời đi rồi chạy lại, công cụ không ghi đè bản gốc")
        return 2
    tmp = item_f + ".tmp"                     # đuôi .tmp: hệ thống không coi là file dữ liệu
    write_std(tmp, out)
    os.makedirs(os.path.dirname(keep), exist_ok=True)
    os.rename(item_f, keep)
    os.rename(tmp, item_f)
    print(f"  bản gốc iPOS → L0_input/{os.path.relpath(keep, L0_ROOT)}")
    print("  xong — chạy tiếp CAP_NHAT.bat (hoặc python update.py)")
    return 0


if __name__ == "__main__":
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    args = sys.argv[1:]
    mon = next((a for a in args if len(a) == 7 and a[4] == "-"), None)
    if not mon:
        print(__doc__)
        sys.exit(2)
    sys.exit(normalize(mon, dry="--dry" in args))
