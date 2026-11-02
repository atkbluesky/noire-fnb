# -*- coding: utf-8 -*-
"""
CHUẨN HOÁ FILE `CRM khách hàng T*.xlsx` BỐ CỤC 5 SHEET (từ bản đủ tháng T10/2026) VỀ BỐ CỤC T9
==============================================================================================
    python tools/crm_normalize.py 2026-10          chuyển file của tháng đó
    python tools/crm_normalize.py 2026-10 --dry    chỉ kiểm tra, không ghi gì

Bản xuất đủ tháng T10/2026 đổi bố cục so với mẫu `tools/crm_reader.py` đang đọc (T9):
  · 5 sheet tên mới (`Tổng Quan & Phân Khúc` · `Biểu Đồ & Nhân Khẩu Học` · `Doanh thu thành viên` ·
    `Biến động khách hàng` · `Báo cáo voucher`) — không còn tiền tố `1.` `2.` `3.`;
  · sheet Biến động và Voucher là chuỗi `a,b,c` trong ô A, chữ KHÔNG dấu.
Bộ đọc cần sheet `2. Biến động khách hàng` → không có thì `read_crm` trả rỗng và `update.py` GỠ
số CRM của tháng. Công cụ này dựng lại file theo đúng bố cục T9 để bộ đọc dùng chung một luật:

  · `1. Bức tranh khách hàng`  ← tổng quan (tổng khách · tổng chi tiêu · tổng hoá đơn) + 3 phân khúc;
  · `2. Biến động khách hàng`  ← chỉ số tháng · lượt chi tiêu theo cửa hàng · lên hạng · doanh thu thành viên.

KHÔNG chuyển, để trống (không đoán số):
  · nhân khẩu học / kênh kết nối / mức chi tiêu — file mới chỉ có TỶ LỆ ƯỚC TÍNH TỪ BIỂU ĐỒ, không có số khách;
  · báo cáo voucher — bản mới chỉ có e-voucher THEO CHƯƠNG TRÌNH (phát · dùng · giá trị), khác phạm vi số
    voucher T6–T9 (mọi voucher dùng tại quầy, kèm doanh thu trước/sau giảm). Ghép vào sẽ ra số giảm giả.

DỪNG, không ghi gì nếu các tổng trong file không khớp nhau (lần đầu + 2 + ≥3 = tổng lượt · Σ cửa hàng · Σ hoá đơn
thành viên · Σ đăng ký theo ngày · Σ chi tiêu phân khúc) hoặc kỳ báo cáo không phải cả tháng.
Bản gốc dời sang L0_input/_GOC_iPOS/ (giữ cấu trúc thư mục). File đã đúng bố cục T9 thì bỏ qua.
"""
from __future__ import annotations

import calendar
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import L0_ROOT, l0_month_file, norm, store_code  # noqa: E402


def _txt(v):
    return "" if v is None else str(v).strip()


def _num(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v
    s = _txt(v).replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _int(v):
    x = _num(v)
    return None if x is None else int(round(x))


def _cells(ws):
    return [list(r) for r in ws.iter_rows(values_only=True) if r and any(c not in (None, "") for c in r)]


def _lines(ws):
    """Sheet kiểu chuỗi `a,b,c` trong ô A → list các list đã tách, bỏ ô rỗng cuối."""
    out = []
    for r in ws.iter_rows(values_only=True):
        a = _txt(r[0]) if r else ""
        if not a:
            continue
        p = [x.strip() for x in a.split(",")]
        while p and not p[-1]:
            p.pop()
        if p:
            out.append(p)
    return out


def _sheet(wb, needle):
    return next((wb[n] for n in wb.sheetnames if needle in norm(n)), None)


def is_new_layout(wb):
    names = [norm(n) for n in wb.sheetnames]
    return any("biến động khách hàng" in n for n in names) and not any(n.startswith("2.") for n in names)


def _hang(s):
    """`Hang Bronze (Thanh vien Dong)` → `Hạng Bronze (Thanh vien Dong)` — bộ đọc tách tên hạng sau chữ `Hạng`."""
    return re.sub(r"^hang\s", "Hạng ", s, flags=re.I)


def parse(wb, month):
    errs, data = [], {}
    ov, bd, dt = _sheet(wb, "tổng quan"), _sheet(wb, "biến động"), _sheet(wb, "doanh thu thành viên")
    for nm, ws in (("Tổng Quan & Phân Khúc", ov), ("Biến động khách hàng", bd), ("Doanh thu thành viên", dt)):
        if ws is None:
            errs.append(f"thiếu sheet {nm}")
    if errs:
        return None, errs

    # ── Tổng quan + phân khúc ──
    rows = _cells(ov)
    def kv(label):
        r = next((r for r in rows if norm(r[0]) == norm(label)), None)
        return r[1] if r and len(r) > 1 else None
    data["customers"], data["cum_rev"], data["cum_inv"] = _int(kv("Tổng số khách hàng")), _num(kv("Tổng chi tiêu")), _int(kv("Tổng số hóa đơn"))
    data["segs"] = [r[:8] for r in rows if norm(r[0]).startswith("khách ăn")]
    if len(data["segs"]) != 3:
        errs.append(f"phân khúc: thấy {len(data['segs'])} dòng `Khách ăn…`, cần 3")
    elif data["cum_rev"] and abs(sum(_num(r[3]) or 0 for r in data["segs"]) - data["cum_rev"]) > 1:
        errs.append("Σ chi tiêu 3 phân khúc ≠ Tổng chi tiêu")

    # ── Biến động (chuỗi không dấu) ──
    L = _lines(bd)
    per = next((p[1] for p in L if norm(p[0]) == "ky bao cao" and len(p) > 1), "")
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})\s*-\s*(\d{2})/(\d{2})/(\d{4})", per)
    dim = calendar.monthrange(int(month[:4]), int(month[5:7]))[1]
    if not m or f"{m.group(3)}-{m.group(2)}" != month or m.group(1) != "01" or int(m.group(4)) != dim \
            or f"{m.group(6)}-{m.group(5)}" != month:
        errs.append(f"kỳ báo cáo `{per}` không phải trọn tháng {month}")
    data["period"] = f"01/{month[5:]}/{month[:4]} – {dim:02d}/{month[5:]}/{month[:4]}"
    def k2(label):
        p = next((p for p in L if norm(p[0]) == label and len(p) > 1), None)
        return _int(p[1]) if p else None
    data["member"] = k2("khach dang ky moi")
    data["total"] = k2("tong luot chi tieu")
    data["first"], data["second"], data["third"] = k2("luot chi tieu lan dau"), k2("luot chi tieu lan 2"), k2("luot chi tieu tu 3 lan")
    mode, data["stores"], data["ranks"], daily = None, [], [], 0
    for p in L:
        n = norm(",".join(p))
        if n.startswith("tu hang,len hang"):
            mode = "rank"; continue
        if n.startswith("stt,cua hang"):
            mode = "store"; continue
        if n.startswith("ngay,so luong"):
            mode = "daily"; continue
        if norm(p[0]).startswith("tong cong") or re.match(r"^\d\.\s", p[0]):
            mode = None; continue
        if mode == "rank" and len(p) >= 3:
            data["ranks"].append((_hang(p[0]), _hang(p[1]), _int(p[2])))
        elif mode == "store" and re.match(r"^\d+$", p[0]) and len(p) >= 6:
            if not store_code(p[1]):
                errs.append(f"cửa hàng lạ ở bảng lượt chi tiêu: {p[1]}")
            data["stores"].append((p[1], *(_int(x) for x in p[2:6])))
        elif mode == "daily" and re.match(r"^\d{4}-\d{2}-\d{2}$", p[0]) and len(p) >= 2:
            daily += _int(p[1]) or 0
    t3 = (data["first"] or 0) + (data["second"] or 0) + (data["third"] or 0)
    if data["total"] is None or t3 != data["total"]:
        errs.append(f"lần đầu + 2 + ≥3 = {t3} ≠ tổng lượt chi tiêu {data['total']}")
    if sum(s[4] or 0 for s in data["stores"]) != data["total"]:
        errs.append("Σ lượt chi tiêu theo cửa hàng ≠ tổng lượt chi tiêu")
    if data["member"] is None or daily != data["member"]:
        errs.append(f"Σ đăng ký theo ngày {daily} ≠ khách đăng ký mới {data['member']}")

    # ── Doanh thu thành viên ──
    rows = _cells(dt)
    hi = next((i for i, r in enumerate(rows) if norm(r[0]) == "cửa hàng"), None)
    data["mem"] = []
    if hi is None:
        errs.append("không thấy bảng Doanh thu thành viên")
    else:
        for r in rows[hi + 1:]:
            nm = _txt(r[0])
            if not nm or norm(nm).startswith("tổng"):
                break
            if not store_code(nm):
                errs.append(f"cửa hàng lạ ở bảng doanh thu thành viên: {nm}")
            data["mem"].append((nm, _num(r[1]), _num(r[2]), _int(r[3])))
        if sum(x[3] or 0 for x in data["mem"]) != data["total"]:
            errs.append("Σ hoá đơn thành viên ≠ tổng lượt chi tiêu")
    return data, errs


def write_t9(path, d, month):
    from openpyxl import Workbook
    wb = Workbook()
    s1 = wb.active
    s1.title = "1. Bức tranh khách hàng"
    for r in (["Bức tranh khách hàng"], ["1. Chỉ số tổng quan (Overview)"],
              [f"Tổng số khách hàng: {d['customers']:,} khách"],
              [f"Tổng doanh thu tích lũy: {d['cum_rev']:,.0f} VNĐ"],
              [f"Tổng số hóa đơn: {d['cum_inv']:,} hóa đơn"], [],
              ["2. Phân khúc theo tần suất đến quán"],
              ["Nhóm khách hàng", "Số lượng khách", "Tỷ lệ khách", "Chi tiêu (VNĐ)", "Tỷ lệ doanh thu", "Số hóa đơn",
               "Trung bình Hóa đơn/Khách", "AOV (VNĐ/Hóa đơn)"], *d["segs"]):
        s1.append(r)
    s2 = wb.create_sheet(f"2. Biến động KH T{int(month[5:])}.{month[:4]}")   # Excel giới hạn tên sheet 31 ký tự
    for r in ([f"Số liệu tổng hợp về khách đăng ký và lượt chi tiêu (kỳ báo cáo: {d['period']}):"], [],
              ["1. Chỉ số tổng quan"], ["Chỉ số", "Số lượng"],
              ["Khách hàng đăng ký mới", d["member"]], ["Tổng lượt chi tiêu", d["total"]],
              ["• Chi tiêu lần đầu", d["first"]], ["• Chi tiêu lần 2", d["second"]],
              ["• Chi tiêu từ 3 lần trở lên", d["third"]], [],
              ["2. Thống kê lượt chi tiêu theo cửa hàng"],
              ["STT", "Cửa hàng", "Chi tiêu lần đầu", "Chi tiêu lần 2", "Chi tiêu từ 3 lần", "Tổng lượt chi tiêu"],
              *([i + 1, *s] for i, s in enumerate(d["stores"])),
              [None, "Tổng cộng", d["first"], d["second"], d["third"], d["total"]], [],
              ["3. Biến động hạng thành viên"], ["Từ hạng", "Lên hạng", "Số khách hàng"], *(list(x) for x in d["ranks"]), [],
              ["4. Doanh thu thành viên theo cửa hàng"],
              ["Cửa hàng", "Doanh thu (VNĐ)", "Giảm giá (VNĐ)", "Tỷ lệ giảm giá", "Số lượng HĐ", "Bình quân HĐ (VNĐ)"],
              *([nm, rev, disc, None, inv, None] for nm, rev, disc, inv in d["mem"]),
              ["Tổng cộng"]):
        s2.append(r)
    g = wb.create_sheet("Ghi chú chuẩn hoá")
    for line in (f"Dựng bởi tools/crm_normalize.py từ bản xuất 5 sheet (bản gốc ở L0_input/_GOC_iPOS/).",
                 "KHÔNG chuyển: nhân khẩu học · kênh kết nối · mức chi tiêu — bản gốc chỉ có tỷ lệ ước tính từ biểu đồ.",
                 "KHÔNG chuyển: báo cáo voucher — bản gốc chỉ có e-voucher theo chương trình, khác phạm vi số voucher T6–T9."):
        g.append([line])
    wb.save(path)


def normalize(month, dry=False):
    from openpyxl import load_workbook
    f = l0_month_file("S27_crm_customer", month)
    if not f:
        print(f"✖ không có file CRM khách hàng tháng {month}")
        return 2
    wb = load_workbook(f, read_only=True, data_only=True)
    try:
        if not is_new_layout(wb):
            print(f"✔ {os.path.basename(f)} đã đúng bố cục bộ đọc — không cần chuyển")
            return 0
        d, errs = parse(wb, month)
    finally:
        wb.close()
    if errs:
        print(f"✖ KHÔNG chuyển {os.path.basename(f)}:")
        print("\n".join(f"   · {e}" for e in errs))
        return 2
    print(f"✔ {os.path.basename(f)}: {d['member']} đăng ký · {d['total']} lượt chi tiêu ({d['first']}/{d['second']}/{d['third']}) · "
          f"{len(d['stores'])} cửa hàng · {len(d['ranks'])} dòng lên hạng · tổng khớp")
    if dry:
        print("  (--dry: chưa ghi gì)")
        return 0
    keep = os.path.join(L0_ROOT, "_GOC_iPOS", os.path.relpath(f, L0_ROOT))
    if os.path.exists(keep):
        print(f"✖ đã có bản gốc ở {keep} — dời đi rồi chạy lại, công cụ không ghi đè bản gốc")
        return 2
    tmp = f + ".tmp"                          # đuôi .tmp: hệ thống không coi là file dữ liệu
    write_t9(tmp, d, month)
    os.makedirs(os.path.dirname(keep), exist_ok=True)
    os.rename(f, keep)
    os.rename(tmp, f)
    print(f"  bản gốc → L0_input/{os.path.relpath(keep, L0_ROOT)}")
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
