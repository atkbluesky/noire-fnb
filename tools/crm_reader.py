# -*- coding: utf-8 -*-
"""
NOIRE — ĐỌC DỮ LIỆU CRM KHÁCH HÀNG (M8)
=======================================
Ba nguồn L0, một đầu ra thống nhất theo THÁNG:

  S27_crm_customer   `CRM khách hàng T9.2026.xlsx`   file CRM iPOS 4 sheet (từ T9/2026)
  S28_crm_history    `CRM_Dashboard_T1-T8.2026.xlsx`  lịch sử đã làm sạch (T1–T8)
  S29_member_revenue `revenue-report_thanh vien T*.csv` doanh thu thành viên theo cửa hàng (T1–T8)

Đầu ra `read_crm(month)` → { crm_month, crm_store, crm_snapshot, crm_dist, crm_rank }.
Quy tắc: tháng có file S27 → lấy S27; không có → ghép S28 + S29. Ô nguồn không có
số để None (KHÔNG ghi 0). Số nguồn có lỗi định dạng ngàn (`1.517` đọc thành 1,517 số
thực) được đưa về số nguyên và đối chiếu lại bằng tổng.
"""
from __future__ import annotations

import csv
import io
import os
import re

from monthly_lib import (
    l0_files, l0_latest, l0_month_file, l0_by_month, month_of, norm, store_code, to_num,
)

_WARN = []


def _w(msg):
    _WARN.append(msg)
    print(f"      ! CRM: {msg}")


def warnings():
    return list(_WARN)


# ──────────────────────────── tiện ích ────────────────────────────
def _load(path):
    from openpyxl import load_workbook
    return load_workbook(path, read_only=False, data_only=True)


def _rows(ws):
    return [tuple(r) for r in ws.iter_rows(values_only=True)]


def _txt(v):
    return "" if v is None else str(v).strip()


def _n(v):
    """Số thường (tiền, tỷ lệ). Chuỗi `350,319,415` / `5.783 khách` đều đọc được."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    s = _txt(v)
    if not s:
        return None
    m = re.search(r"-?\d[\d.,]*", s)
    return to_num(m.group(0)) if m else None


def cnt(v):
    """ĐẾM (khách, hoá đơn, lượt): luôn là số nguyên. Excel đọc `1.517` (ngàn kiểu VN)
    thành 1,517 → số lẻ không thể là số đếm → ×1000. Số nguyên (kể cả `577.0`) giữ nguyên."""
    x = _n(v)
    if x is None:
        return None
    if isinstance(v, (int, float)) and abs(x - round(x)) > 1e-9:
        x = round(x * 1000)
    return int(round(x))


def _find(rows, *needles, col=None, start=0):
    """Chỉ số dòng đầu tiên (từ `start`) mà một ô (hoặc ô ở `col`) chứa mọi `needles`."""
    nd = [norm(x) for x in needles]
    for i in range(start, len(rows)):
        cells = [rows[i][col]] if col is not None and col < len(rows[i]) else rows[i]
        for c in cells:
            t = norm(c)
            if t and all(x in t for x in nd):
                return i
    return None


def _hdr(rows, *needles, start=0):
    """Dòng tiêu đề: dòng có MỌI needle, mỗi needle ở một ô. → (i, {needle: cột})."""
    nd = [norm(x) for x in needles]
    for i in range(start, len(rows)):
        cells = [norm(c) for c in rows[i]]
        pos = {}
        for x in nd:
            for j, c in enumerate(cells):
                if c == x or (c and x in c):
                    pos[x] = j
                    break
        if len(pos) == len(nd):
            return i, pos
    return None, {}


def _store(name):
    return store_code(_txt(name).replace("  ", " "))


def _kv(text, label):
    """`Tổng số khách hàng: 2,714 khách` → 2714 (đếm) · tìm theo nhãn trong cột A."""
    m = re.search(re.escape(label) + r"\s*:\s*(-?[\d.,]+)", text, re.I)
    return to_num(m.group(1)) if m else None


# ══════════════════════════════════════════════════════════════════════
# S27 — file CRM khách hàng tháng
# ══════════════════════════════════════════════════════════════════════
def _sheet(wb, prefix):
    for nm in wb.sheetnames:
        if norm(nm).startswith(prefix):
            return _rows(wb[nm])
    return None


def parse_crm_file(path, month):
    wb = _load(path)
    out = {}
    try:
        s1, s2, s3, s4 = (_sheet(wb, f"{i}.") for i in "1234")
    finally:
        wb.close()
    if s2 is None:
        _w(f"{os.path.basename(path)}: không thấy sheet `2. Biến động khách hàng`")
        return None

    # ── kỳ báo cáo phải đúng tháng của file ──
    head = " ".join(_txt(c) for r in s2[:3] for c in r)
    pm = re.search(r"(\d{2})/(\d{2})/(\d{4})\s*[–-]\s*(\d{2})/(\d{2})/(\d{4})", head)
    if pm and f"{pm.group(3)}-{pm.group(2)}" != month:
        _w(f"{os.path.basename(path)}: kỳ báo cáo {pm.group(0)} KHÔNG phải {month}")

    # ── sheet 2 · chỉ số tổng quan ──
    def val(label, col=1):
        i = _find(s2, label, col=0)
        return None if i is None else s2[i][col]

    month_rec = dict(month=month, src="S27")
    member = cnt(val("khách hàng đăng ký mới"))
    month_rec["spend_total"] = cnt(val("tổng lượt chi tiêu"))
    month_rec["spend_first"] = cnt(val("chi tiêu lần đầu"))
    month_rec["spend_second"] = cnt(val("chi tiêu lần 2"))
    month_rec["spend_third"] = cnt(val("chi tiêu từ 3 lần"))
    out["member"] = member

    # ── sheet 2 · theo cửa hàng ──
    stores = {}
    i, p = _hdr(s2, "cửa hàng", "chi tiêu lần đầu", "chi tiêu lần 2", "chi tiêu từ 3 lần")
    if i is not None:
        for r in s2[i + 1:]:
            nm = _txt(r[p["cửa hàng"]])
            if not nm or norm(nm).startswith("tổng"):
                if norm(nm).startswith("tổng") or not any(c is not None for c in r):
                    break
                continue
            code = _store(nm)
            if not code:
                _w(f"cửa hàng lạ ở bảng lượt chi tiêu: {nm}")
                continue
            d = stores.setdefault(code, dict(month=month, store=code))
            d["spend_first"] = cnt(r[p["chi tiêu lần đầu"]])
            d["spend_second"] = cnt(r[p["chi tiêu lần 2"]])
            d["spend_third"] = cnt(r[p["chi tiêu từ 3 lần"]])
            d["spend_total"] = (d["spend_first"] or 0) + (d["spend_second"] or 0) + (d["spend_third"] or 0)
    # ── sheet 2 · doanh thu thành viên theo cửa hàng ──
    i, p = _hdr(s2, "cửa hàng", "doanh thu", "giảm giá", "số lượng hđ")
    mem_src = "sheet 2"
    if i is None and s4:
        i, p = _hdr(s4, "cửa hàng", "doanh thu", "giảm giá", "số lượng ho")
        src_rows, mem_src = s4, "sheet 4"
    else:
        src_rows = s2
    if i is not None:
        for r in src_rows[i + 1:]:
            nm = _txt(r[p["cửa hàng"]])
            if not nm:
                break
            if norm(nm).startswith("tổng"):
                break
            code = _store(nm)
            if not code:
                _w(f"cửa hàng lạ ở bảng doanh thu thành viên: {nm}")
                continue
            d = stores.setdefault(code, dict(month=month, store=code))
            d["mem_rev"] = _n(r[p["doanh thu"]])
            d["mem_disc"] = _n(r[p["giảm giá"]])
            d["mem_inv"] = cnt(r[p["số lượng hđ"] if "số lượng hđ" in p else p["số lượng ho"]])
    month_rec["mem_rev"] = sum(d.get("mem_rev") or 0 for d in stores.values()) or None
    month_rec["mem_disc"] = sum(d.get("mem_disc") or 0 for d in stores.values()) or None
    month_rec["mem_inv"] = sum(d.get("mem_inv") or 0 for d in stores.values()) or None

    # đối chiếu tổng dòng "Tổng cộng" ↔ cộng cửa hàng
    tot_sp = sum(d.get("spend_total") or 0 for d in stores.values())
    if month_rec["spend_total"] and tot_sp and tot_sp != month_rec["spend_total"]:
        _w(f"{month}: cộng cửa hàng {tot_sp} ≠ tổng lượt chi tiêu {month_rec['spend_total']}")
    if month_rec["mem_inv"] and month_rec["spend_total"] and month_rec["mem_inv"] != month_rec["spend_total"]:
        _w(f"{month}: hoá đơn thành viên {month_rec['mem_inv']} ≠ lượt chi tiêu {month_rec['spend_total']}")
    if s4:   # sheet 4 là bản sao bảng doanh thu — lệch nghĩa là một trong hai sai
        i4, p4 = _hdr(s4, "cửa hàng", "doanh thu", "giảm giá")
        if i4 is not None:
            r4 = sum(_n(r[p4["doanh thu"]]) or 0 for r in s4[i4 + 1:] if _txt(r[p4["cửa hàng"]]))
            if month_rec["mem_rev"] and abs(r4 - month_rec["mem_rev"]) > 1:
                _w(f"{month}: sheet 4 doanh thu thành viên {r4:,.0f} ≠ sheet 2 {month_rec['mem_rev']:,.0f}")

    # ── sheet 2 · hạng thành viên ──
    ranks = []
    i, p = _hdr(s2, "từ hạng", "lên hạng", "số khách hàng")
    if i is not None:
        for r in s2[i + 1:]:
            if not _txt(r[p["từ hạng"]]):
                break
            ranks.append(dict(month=month, kind="upgrade", from_rank=_rank(r[p["từ hạng"]]),
                              to_rank=_rank(r[p["lên hạng"]]), n=cnt(r[p["số khách hàng"]])))
    i, p = _hdr(s2, "hạng thành viên", "số giao dịch")
    if i is not None:
        for r in s2[i + 1:]:
            if not _txt(r[p["hạng thành viên"]]):
                break
            ranks.append(dict(month=month, kind="txn", from_rank=_rank(r[p["hạng thành viên"]]),
                              to_rank=None, n=cnt(r[p["số giao dịch"]])))

    # ── sheet 3 · voucher ──
    vouch = parse_voucher_sheet(s3, month) if s3 else None

    # ── sheet 1 · ảnh chụp khách hàng ──
    snap, dist = parse_snapshot_sheet(s1, month) if s1 else (None, [])

    return dict(month=month_rec, stores=list(stores.values()), ranks=ranks, voucher=vouch,
                snapshot=snap, dist=dist, member=member)


def _rank(v):
    """`Hạng Bronze (Thành viên Đồng)` → `Bronze`. `NỘI BỘ (GIÁM ĐỐC & QUẢN LÝ)` giữ nguyên."""
    s = _txt(v)
    m = re.match(r"hạng\s+([A-Za-z ]+?)\s*(?:\(|$)", s, re.I)
    return m.group(1).strip() if m else s


def _parse_voucher_csvlines(rows, month):
    """Định dạng mới: mỗi dòng là chuỗi `Nhãn,Giá trị` / `STT,Cửa hàng,Dùng,DT trước,DT sau,Phí,Tỷ lệ`."""
    lines = [",".join(_txt(c) for c in r if c is not None and _txt(c) != "") for r in rows]
    lines = [l for l in lines if l]

    def kv(label):
        for l in lines:
            p = l.split(",")
            if len(p) == 2 and norm(p[0]) == norm(label):
                return p[1]
        return None
    v = dict(issued=cnt(kv("Voucher phát hành")), used=cnt(kv("Voucher sử dụng")),
             rev_before=_n(kv("Doanh thu trước giảm giá")), rev_after=_n(kv("Doanh thu sau giảm giá")),
             disc=_n(kv("Chi phí giảm giá")), stores={})
    mode = False
    for l in lines:
        n = norm(l)
        if n.startswith("stt,cửa hàng"):
            mode = True; continue
        p = l.split(",")
        if mode and re.match(r"^\d+$", p[0]) and len(p) >= 6:
            code = _store(p[1])
            if not code:
                _w(f"cửa hàng lạ ở báo cáo voucher: {p[1]}")
                continue
            d = v["stores"].setdefault(code, dict(v_used=0, v_rev_before=0, v_disc=0, v_rev_after=0))
            d["v_used"] += cnt(p[2]) or 0
            d["v_rev_before"] += _n(p[3]) or 0
            d["v_rev_after"] += _n(p[4]) or 0
            d["v_disc"] += _n(p[5]) or 0
    su = sum(d["v_used"] for d in v["stores"].values())
    if v["used"] and su != v["used"]:
        _w(f"{month}: voucher theo cửa hàng cộng {su} ≠ tổng {v['used']}")
    return v if v["used"] is not None else None


def parse_voucher_sheet(rows, month):
    if any("voucher phát hành," in norm(_txt(r[0])) for r in rows if r and r[0] is not None):
        return _parse_voucher_csvlines(rows, month)
    full = "\n".join(_txt(r[0]) for r in rows if r and r[0] is not None)
    v = dict(
        issued=cnt(_kv(full, "Tổng voucher phát hành")),
        used=cnt(_kv(full, "Tổng voucher đã sử dụng")),
        rev_before=_kv(full, "Tổng doanh thu trước giảm giá"),
        disc=_kv(full, "Tổng chi phí giảm giá"),
        rev_after=_kv(full, "Tổng doanh thu sau giảm giá"),
        stores={},
    )
    i, p = _hdr(rows, "chi nhánh", "voucher dùng", "doanh thu trước giảm", "chi phí giảm giá", "doanh thu sau giảm")
    if i is not None:
        for r in rows[i + 1:]:
            nm = _txt(r[p["chi nhánh"]])
            if not nm or norm(nm).startswith("tổng"):
                break
            code = _store(nm)
            if not code:
                _w(f"cửa hàng lạ ở báo cáo voucher: {nm}")
                continue
            d = v["stores"].setdefault(code, dict(v_used=0, v_rev_before=0, v_disc=0, v_rev_after=0))
            d["v_used"] += cnt(r[p["voucher dùng"]]) or 0
            d["v_rev_before"] += _n(r[p["doanh thu trước giảm"]]) or 0
            d["v_disc"] += _n(r[p["chi phí giảm giá"]]) or 0
            d["v_rev_after"] += _n(r[p["doanh thu sau giảm"]]) or 0
        su = sum(d["v_used"] for d in v["stores"].values())
        if v["used"] and su != v["used"]:
            _w(f"{month}: voucher theo chi nhánh cộng {su} ≠ tổng {v['used']}")
    return v if v["used"] is not None else None


def parse_snapshot_sheet(rows, month):
    full = [(_txt(r[0]) if r else "") for r in rows]
    text = "\n".join(full)
    snap = dict(month=month,
                customers=cnt(_kv(text, "Tổng số khách hàng")),
                cum_rev=_kv(text, "Tổng doanh thu tích lũy"),
                cum_inv=cnt(_kv(text, "Tổng số hóa đơn")))
    if snap["cum_rev"] and snap["cum_inv"]:
        snap["aov"] = round(snap["cum_rev"] / snap["cum_inv"])
    # 3 phân khúc theo tần suất
    for r in rows:
        a = norm(r[0]) if r else ""
        key = ("seg3" if "3 lần" in a else "seg2" if "2 lần" in a else "seg1" if "lần đầu" in a else None)
        if a.startswith("khách ăn") and key:
            snap[key + "_n"] = cnt(r[1])
            snap[key + "_rev"] = _n(r[3])
            snap[key + "_inv"] = cnt(r[5])
    dist = []
    section = None
    for i, r in enumerate(rows):
        a = _txt(r[0]) if r else ""
        na = norm(a)
        if na.startswith("phân bố giới tính"):
            section = "gender"; continue
        if na.startswith("phân bố độ tuổi"):
            section = "age"; continue
        if na.startswith("kênh kết nối"):
            section = "channel"; continue
        if re.match(r"^4\.\s*phân bố mức chi tiêu", na):
            section = "spend"; continue
        if re.match(r"^[1-9]\.\s", na) and section:
            if not na.startswith("4."):
                section = None
        if section in ("gender", "age", "channel"):
            m = re.match(r"^(.+?)\s*:\s*(-?[\d.,]+)\s*khách", a)
            if m:
                lab = re.sub(r"\s*tuổi\s*$", "", m.group(1)).strip()
                n = to_num(m.group(2))
                if n is not None:
                    dist.append(dict(month=month, grp=section, label=lab, n=int(round(n))))
        elif section == "spend" and r and r[1] is not None and re.search(r"\d", _txt(r[1])) and na not in ("mức chi tiêu",):
            n = cnt(r[1])
            if n is not None and a:
                dist.append(dict(month=month, grp="spend", label=a, n=n))
    return snap, dist


# ══════════════════════════════════════════════════════════════════════
# S28 — lịch sử đã làm sạch
# ══════════════════════════════════════════════════════════════════════
_HIST_CACHE = {}


def _hist():
    path = l0_latest("S28_crm_history")
    if not path:
        return None
    if path in _HIST_CACHE:
        return _HIST_CACHE[path]
    wb = _load(path)
    try:
        sheets = {nm: _rows(wb[nm]) for nm in wb.sheetnames}
    finally:
        wb.close()
    H = dict(path=path, month={}, store_v={}, snap={}, dist={})
    year = "2026"

    def mon(v):
        return month_of(v)

    # KPI_Thang
    rows = sheets.get("KPI_Thang") or []
    i, p = _hdr(rows, "tháng", "khách đăng ký", "lượt chi tiêu", "lần đầu", "lần 2", "từ 3 lần")
    if i is not None:
        for r in rows[i + 1:]:
            m = mon(r[p["tháng"]])
            if not m:
                continue
            d = H["month"].setdefault(m, dict(month=m))
            d["spend_total"] = cnt(r[p["lượt chi tiêu"]]) if _n(r[p["lượt chi tiêu"]]) is not None else None
            for k, lab in (("spend_first", "lần đầu"), ("spend_second", "lần 2"), ("spend_third", "từ 3 lần")):
                d[k] = cnt(r[p[lab]]) if _n(r[p[lab]]) is not None else None   # `n.a.` → None
            H.setdefault("member", {})[m] = cnt(r[p["khách đăng ký"]])
    # DoanhThu_ThanhVien
    rows = sheets.get("DoanhThu_ThanhVien") or []
    i, p = _hdr(rows, "tháng", "doanh thu", "giảm giá", "hóa đơn")
    if i is not None:
        for r in rows[i + 1:]:
            m = mon(r[p["tháng"]])
            if not m:
                break                      # dòng TỔNG → hết bảng tháng, bên dưới là chi tiết cửa hàng
            d = H["month"].setdefault(m, dict(month=m))
            d["mem_rev"] = _n(r[p["doanh thu"]])
            d["mem_disc"] = _n(r[p["giảm giá"]])
            d["mem_inv"] = cnt(r[p["hóa đơn"]])
    # Voucher_T6_T8
    rows = sheets.get("Voucher_T6_T8") or []
    i, p = _hdr(rows, "tháng", "voucher phát hành", "voucher sử dụng", "dt trước giảm", "dt sau giảm", "phí giảm giá")
    if i is not None:
        for r in rows[i + 1:]:
            m = mon(r[p["tháng"]])
            if not m:
                if not any(c is not None for c in r):
                    break
                continue
            d = H["month"].setdefault(m, dict(month=m))
            d.update(v_issued=cnt(r[p["voucher phát hành"]]), v_used=cnt(r[p["voucher sử dụng"]]),
                     v_rev_before=_n(r[p["dt trước giảm"]]), v_rev_after=_n(r[p["dt sau giảm"]]),
                     v_disc=_n(r[p["phí giảm giá"]]))
    # chi tiết voucher theo cửa hàng — tiêu đề bảng nói tháng nào ("… THEO CỬA HÀNG T8")
    t = _find(rows, "chi tiết voucher theo cửa hàng")
    vm = None
    if t is not None:
        mm = re.search(r"T(\d{1,2})", _txt(rows[t][0]))
        vm = f"{year}-{int(mm.group(1)):02d}" if mm else None
    i, p = _hdr(rows, "cửa hàng", "voucher dùng", "dt trước giảm", "dt sau giảm", "phí giảm giá")
    if i is not None and vm:
        for r in rows[i + 1:]:
            nm = _txt(r[p["cửa hàng"]])
            if not nm or norm(nm).startswith("tổng"):
                break
            code = _store(nm)
            if code:
                H["store_v"].setdefault(vm, {})[code] = dict(
                    v_used=cnt(r[p["voucher dùng"]]), v_rev_before=_n(r[p["dt trước giảm"]]),
                    v_rev_after=_n(r[p["dt sau giảm"]]), v_disc=_n(r[p["phí giảm giá"]]))
    # PhanKhuc_KH → snapshot T7 + T8
    rows = sheets.get("PhanKhuc_KH") or []
    i, _p = _hdr(rows, "phân khúc", "kh t7", "kh t8")
    if i is not None:
        hdr = [norm(c) for c in rows[i]]
        cols = {}
        for j, c in enumerate(hdr):
            mm = re.match(r"^(kh|hóa đơn|chi tiêu) t(\d{1,2})$", c)
            if mm:
                cols[(mm.group(1), f"{year}-{int(mm.group(2)):02d}")] = j
        months = sorted({m for _, m in cols})
        for m in months:
            sn = H["snap"].setdefault(m, dict(month=m))
            for r in rows[i + 1:]:
                a = norm(r[0])
                key = ("seg3" if "3 lần" in a else "seg2" if "2 lần" in a else "seg1" if "lần đầu" in a else None)
                if a.startswith("khách ăn") and key:
                    sn[key + "_n"] = cnt(r[cols[("kh", m)]])
                    sn[key + "_inv"] = cnt(r[cols[("hóa đơn", m)]])
                    sn[key + "_rev"] = _n(r[cols[("chi tiêu", m)]])
                if a.startswith("tổng kh đã phân khúc"):
                    sn["cum_rev"] = _n(r[cols[("chi tiêu", m)]])
                    sn["cum_inv"] = cnt(r[cols[("hóa đơn", m)]])
            # tổng khách hệ thống
            k = _find(rows, "tổng kh hệ thống", col=0)
            if k is not None:
                # cột B = T7, C = T8 theo thứ tự tháng trong bảng đối soát
                hr = _find(rows, "chỉ số", col=0, start=k - 3)
                if hr is not None:
                    for j, c in enumerate(rows[hr]):
                        mm = re.match(r"^t(\d{1,2})\.\d{4}$", norm(c))
                        if mm and f"{year}-{int(mm.group(1)):02d}" == m:
                            sn["customers"] = cnt(rows[k][j])
            if sn.get("cum_rev") and sn.get("cum_inv"):
                sn["aov"] = round(sn["cum_rev"] / sn["cum_inv"])
    # ChanDung_T8 → phân bố
    rows = sheets.get("ChanDung_T8") or []
    if rows:
        title = " ".join(_txt(c) for r in rows[:2] for c in r)
        mm = re.search(r"T(\d{1,2})\.(\d{4})", title)
        dm = f"{mm.group(2)}-{int(mm.group(1)):02d}" if mm else None
        if dm:
            L = []
            i = next((k for k, r in enumerate(rows) if norm(r[0]) == "giới tính"), None)
            if i is not None:
                for r in rows[i + 1:]:
                    a = _txt(r[0])
                    if not a or norm(a) == "tổng":
                        break
                    L.append(dict(month=dm, grp="gender", label=a, n=cnt(r[1])))
            i = next((k for k, r in enumerate(rows) if len(r) > 4 and norm(r[4]) == "mức chi tiêu"), None)
            if i is not None:
                for r in rows[i + 1:]:
                    a = _txt(r[4])
                    if not a or norm(a) == "tổng":
                        break
                    L.append(dict(month=dm, grp="spend", label=a, n=cnt(r[5])))
            i = next((k for k, r in enumerate(rows) if norm(r[0]) == "kênh kết nối"), None)
            if i is not None:
                for r in rows[i + 1:]:
                    a = _txt(r[0])
                    if not a or a.lower().startswith("một khách"):
                        break
                    L.append(dict(month=dm, grp="channel", label=a, n=cnt(r[1])))
            i = next((k for k, r in enumerate(rows) if len(r) > 4 and norm(r[4]) == "nhóm độ tuổi"), None)
            if i is not None:
                for r in rows[i + 1:]:
                    a = _txt(r[4])
                    if not a or not r[5] and r[5] != 0:
                        break
                    if isinstance(r[5], (int, float)):        # `~60` · `<20` là ước lượng → bỏ
                        L.append(dict(month=dm, grp="age", label=a, n=cnt(r[5])))
            H["dist"][dm] = L
            sn = H["snap"].setdefault(dm, dict(month=dm))
            sn["customers"] = sn.get("customers") or sum(x["n"] or 0 for x in L if x["grp"] == "gender") or None
    _HIST_CACHE[path] = H
    return H


# ══════════════════════════════════════════════════════════════════════
# S29 — CSV doanh thu thành viên
# ══════════════════════════════════════════════════════════════════════
def _csv_month(path):
    m = re.search(r"T(\d{1,2})\.(\d{4})", os.path.basename(path))
    return f"{m.group(2)}-{int(m.group(1)):02d}" if m else None


def read_member_csv(month):
    for f in l0_files("S29_member_revenue"):
        if _csv_month(f) != month:
            continue
        raw = open(f, "rb").read()
        for enc in ("utf-16", "utf-8-sig", "utf-8"):
            try:
                text = raw.decode(enc)
                if "\x00" not in text:
                    break
            except UnicodeDecodeError:
                continue
        rd = list(csv.reader(io.StringIO(text), delimiter="\t"))
        if not rd:
            return {}
        h = [norm(c) for c in rd[0]]
        try:
            jn, jr, jd, ji = (h.index("cửa hàng"), h.index("doanh thu"), h.index("giảm giá"),
                              next(k for k, c in enumerate(h) if c.startswith("số lượng")))
        except (ValueError, StopIteration):
            _w(f"{os.path.basename(f)}: không nhận ra cột")
            return {}
        out = {}
        for r in rd[1:]:
            if len(r) <= max(jn, jr, jd, ji) or not r[jn].strip():
                continue
            code = _store(r[jn])
            if not code:
                _w(f"{os.path.basename(f)}: cửa hàng lạ {r[jn]}")
                continue
            d = out.setdefault(code, dict(month=month, store=code, mem_rev=0, mem_disc=0, mem_inv=0))
            d["mem_rev"] += to_num(r[jr], 0) or 0
            d["mem_disc"] += to_num(r[jd], 0) or 0
            d["mem_inv"] += int(to_num(r[ji], 0) or 0)
        return out
    return {}


# ══════════════════════════════════════════════════════════════════════
# S30 — báo cáo biến động khách hàng (1 sheet, mỗi dòng một chuỗi `a,b,c`)
# ══════════════════════════════════════════════════════════════════════
def _lines(ws):
    out = []
    for r in ws.iter_rows(values_only=True):
        cells = [_txt(c) for c in r if c is not None and _txt(c) != ""]
        if cells:
            out.append(",".join(cells) if len(cells) > 1 else cells[0])
    return out


def parse_variance_file(path, month):
    from calendar import monthrange
    wb = _load(path)
    try:
        ws = next((wb[n] for n in wb.sheetnames if "biến động" in norm(n)), wb[wb.sheetnames[0]])
        lines = _lines(ws)
    finally:
        wb.close()
    V = dict(month=month, stores={}, ranks=[], daily=0, covered_to=None)
    days = monthrange(int(month[:4]), int(month[5:7]))[1]
    for ln in lines:
        m = re.search(r"\((\d{2})/(\d{2})/(\d{4})\s*-\s*(\d{2})/(\d{2})/(\d{4})\)", ln)
        if m:
            if f"{m.group(6)}-{m.group(5)}" != month:
                _w(f"{os.path.basename(path)}: kỳ báo cáo {m.group(0)} KHÔNG phải {month}")
            V["covered_to"] = int(m.group(4))
    def kv(label):
        for ln in lines:
            p = ln.split(",")
            if len(p) == 2 and norm(p[0]) == norm(label):
                return cnt(p[1])
        return None
    V["member"] = kv("Khách đăng ký")
    V["spend_total"] = kv("Lượt chi tiêu")
    V["spend_first"] = kv("Lượt chi tiêu lần đầu")
    V["spend_second"] = kv("Lượt chi tiêu lần 2")
    V["spend_third"] = kv("Lượt chi tiêu từ 3 lần")
    mode = None
    for ln in lines:
        n = norm(ln)
        if n.startswith("stt,cửa hàng"):
            mode = "store"; continue
        if n.startswith("hạng ban đầu"):
            mode = "rank"; continue
        if n.startswith("ngày,số lượng"):
            mode = "daily"; continue
        p = ln.split(",")
        if mode == "store" and re.match(r"^\d+$", p[0]) and len(p) >= 6:
            code = _store(p[1])
            if not code:
                _w(f"{os.path.basename(path)}: cửa hàng lạ {p[1]}")
                continue
            f, s2, t, tot = (cnt(x) for x in p[2:6])
            V["stores"][code] = dict(month=month, store=code, spend_first=f, spend_second=s2,
                                     spend_third=t, spend_total=tot)
        elif mode == "store" and norm(ln).startswith("tổng"):
            mode = None
        elif mode == "rank" and len(p) == 3:
            V["ranks"].append(dict(month=month, kind="upgrade", from_rank=_rank(p[0]),
                                   to_rank=_rank(p[1]), n=cnt(p[2])))
        elif mode == "daily" and re.match(r"^\d{2}/\d{2}/\d{4}$", p[0]) and len(p) == 2:
            V["daily"] += cnt(p[1]) or 0
    # đối chiếu
    t3 = sum(V.get(k) or 0 for k in ("spend_first", "spend_second", "spend_third"))
    if V["spend_total"] and t3 != V["spend_total"]:
        _w(f"{month}: lần đầu+2+≥3 = {t3} ≠ lượt chi tiêu {V['spend_total']}")
    st = sum(d["spend_total"] or 0 for d in V["stores"].values())
    if V["spend_total"] and st != V["spend_total"]:
        _w(f"{month}: cộng cửa hàng {st} ≠ lượt chi tiêu {V['spend_total']}")
    if V["member"] and V["daily"] and V["daily"] != V["member"]:
        _w(f"{month}: đăng ký theo ngày {V['daily']} ≠ tổng {V['member']}")
    V["partial"] = V["covered_to"] is not None and V["covered_to"] < days
    V["days"] = days
    return V


# ══════════════════════════════════════════════════════════════════════
# Voucher trùng tháng khác?
# ══════════════════════════════════════════════════════════════════════
def _prev(month, k=1):
    y, m = int(month[:4]), int(month[5:7]) - k
    while m < 1:
        y, m = y - 1, m + 12
    return f"{y:04d}-{m:02d}"


def _voucher_key(v):
    return (v.get("issued"), v.get("used"), round(v.get("rev_before") or 0))


def _voucher_seen_before(month, v):
    """Báo cáo voucher y hệt một tháng ĐÃ có = người xuất chưa làm mới sheet (copy tháng trước)."""
    key = _voucher_key(v)
    H = _hist()
    if H:
        for m, d in H["month"].items():
            if m != month and d.get("v_issued") is not None and \
                    (d["v_issued"], d["v_used"], round(d.get("v_rev_before") or 0)) == key:
                return m
    for m, f in l0_by_month("S27_crm_customer").items():
        if m < month:
            try:
                p = parse_crm_file(f, m)
            except Exception:                                     # noqa: BLE001
                continue
            if p and p.get("voucher") and _voucher_key(p["voucher"]) == key:
                return m
    return None


# ══════════════════════════════════════════════════════════════════════
# Điểm vào
# ══════════════════════════════════════════════════════════════════════
def member_from_crm(month):
    f = l0_month_file("S27_crm_customer", month)
    if not f:
        return None
    p = parse_crm_file(f, month)
    return p["member"] if p else None


def member_from_history(month):
    """Khách đăng ký của tháng theo CRM_Dashboard (KPI_Thang) — chỉ dùng khi KHÔNG có số theo ngày.
    Lưu ý: T7 có số ngày (116) khác bản dashboard (124, nhập từ ảnh) — số theo ngày được ưu tiên."""
    H = _hist()
    return (H or {}).get("member", {}).get(month)


def read_crm(month):
    f27 = l0_month_file("S27_crm_customer", month)
    out = {}
    if f27:
        p = parse_crm_file(f27, month)
        if not p:
            return {}
        rec, stores = p["month"], {d["store"]: d for d in p["stores"]}
        notes = []
        v = p["voucher"]
        if v:
            dup = _voucher_seen_before(month, v)
            if dup:
                notes.append(f"sheet voucher trùng hệt {dup} (chưa xuất lại) — bỏ")
                _w(f"{os.path.basename(f27)}: sheet `3. Báo cáo voucher` TRÙNG HỆT {dup} "
                   f"({v['issued']:,} phát · {v['used']:,} dùng) — chưa xuất lại cho {month}, bỏ qua")
                v = None
        if v:
            rec.update(v_issued=v["issued"], v_used=v["used"], v_rev_before=v["rev_before"],
                       v_rev_after=v["rev_after"], v_disc=v["disc"])
            for code, vd in v["stores"].items():
                stores.setdefault(code, dict(month=month, store=code)).update(vd)
        # đối chiếu CSV nếu cả hai cùng có
        csv_rows = read_member_csv(month)
        for code, c in csv_rows.items():
            s = stores.get(code)
            if s and s.get("mem_rev") is not None and abs(s["mem_rev"] - c["mem_rev"]) > 1:
                _w(f"{month} {code}: doanh thu thành viên file CRM {s['mem_rev']:,.0f} ≠ CSV {c['mem_rev']:,.0f}")
        rec["note"] = "; ".join(notes) or None
        out["crm_month"] = [rec]
        out["crm_store"] = list(stores.values())
        if p["snapshot"] and p["snapshot"].get("customers"):
            out["crm_snapshot"] = [p["snapshot"]]
        if p["dist"]:
            out["crm_dist"] = p["dist"]
        if p["ranks"]:
            out["crm_rank"] = p["ranks"]
        return out

    # ── tháng chưa có file CRM tháng → lịch sử + CSV ──
    H = _hist()
    base = dict(H["month"].get(month, {})) if H else {}
    csv_rows = read_member_csv(month)
    if not base and not csv_rows:
        return {}
    rec = dict(month=month, src="S28+S29" if csv_rows else "S28")
    for k in ("spend_total", "spend_first", "spend_second", "spend_third", "mem_rev", "mem_disc",
              "mem_inv", "v_issued", "v_used", "v_rev_before", "v_rev_after", "v_disc"):
        rec[k] = base.get(k)
    notes = []
    if csv_rows:
        cr = sum(c["mem_rev"] for c in csv_rows.values())
        ci = sum(c["mem_inv"] for c in csv_rows.values())
        if rec["mem_rev"] is not None and abs(rec["mem_rev"] - cr) > 1:
            _w(f"{month}: CRM_Dashboard doanh thu thành viên {rec['mem_rev']:,.0f} ≠ CSV {cr:,.0f} — lấy CSV")
        rec["mem_rev"] = cr
        rec["mem_disc"] = sum(c["mem_disc"] for c in csv_rows.values())
        rec["mem_inv"] = ci
        if rec["spend_total"] is None:
            rec["spend_total"] = ci
    if rec["spend_first"] is None and rec["spend_total"] is not None:
        notes.append("thiếu cơ cấu lượt lần đầu/lần 2/từ 3 lần")
    stores = {code: dict(c) for code, c in csv_rows.items()}
    f30 = l0_month_file("S30_crm_variance", month)
    if f30:
        V = parse_variance_file(f30, month)
        if V.get("spend_first") is not None and rec["spend_first"] is None:
            rec.update(spend_first=V["spend_first"], spend_second=V["spend_second"], spend_third=V["spend_third"])
            if rec["spend_total"] is None:
                rec["spend_total"] = V["spend_total"]
            notes = [x for x in notes if not x.startswith("thiếu cơ cấu")]
            miss = (rec["spend_total"] or 0) - (V["spend_total"] or 0)
            if V["partial"] or miss > 0:
                notes.append(f"cơ cấu lượt từ báo cáo biến động 01–{V['covered_to']:02d}/{month[5:]} — "
                             f"thiếu {miss} lượt cuối tháng (tổng tháng {rec['spend_total']:,}, báo cáo {V['spend_total']:,})")
                _w(f"{month}: báo cáo biến động chỉ tới ngày {V['covered_to']} — cơ cấu lượt thiếu {miss} lượt")
            else:
                notes.append("cơ cấu lượt từ báo cáo biến động khách hàng")
        for code, d in V["stores"].items():
            stores.setdefault(code, dict(month=month, store=code)).update(
                {k: d[k] for k in ("spend_first", "spend_second", "spend_third", "spend_total")})
        if V["ranks"]:
            out["crm_rank"] = V["ranks"]
    rec["note"] = "; ".join(notes) or None
    out["crm_month"] = [rec]
    for code, vd in (H["store_v"].get(month, {}).items() if H else []):
        stores.setdefault(code, dict(month=month, store=code)).update(vd)
    if stores:
        out["crm_store"] = list(stores.values())
    if H and month in H["snap"] and H["snap"][month].get("customers"):
        out["crm_snapshot"] = [H["snap"][month]]
    if H and H["dist"].get(month):
        out["crm_dist"] = H["dist"][month]
    return out
