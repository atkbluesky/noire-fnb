# -*- coding: utf-8 -*-
"""
NOIRE ANALYTICS HUB — THƯ VIỆN DÙNG CHUNG CỦA LANE ETL
======================================================
Mọi script trong tools/ đọc hợp đồng dữ liệu từ ../data_contract.json — cùng một
file mà scripts/build-data.mjs đọc. Thêm/sửa một sheet thì sửa ở hợp đồng, không
sửa rải rác trong code.

Cung cấp:
  · CONTRACT / SHEETS / tier_of / key_of / cols_of   — đọc hợp đồng
  · STORE_ALIAS · store_code()                       — tên POS → mã cửa hàng
  · write_workbook()                                 — ghi .xlsx đúng thứ tự cột + sheet hướng dẫn
  · read_utf16_csv()                                 — CSV export của Meta (UTF-16, có dòng sep=,)
  · read_html_table()                                — file .xls của Zalo OA thật ra là HTML
  · norm() · to_num() · month_of()                   — chuẩn hoá vặt
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import date, datetime
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_INPUT = os.path.join(ROOT, "data_input")
MONTHLY_DIR = os.path.join(DATA_INPUT, "monthly")

with open(os.path.join(ROOT, "data_contract.json"), encoding="utf-8") as _f:
    CONTRACT = json.load(_f)
SHEETS: dict = CONTRACT["sheets"]


def tier_of(name: str) -> str:
    return SHEETS.get(name, {}).get("tier", "any")


def key_of(name: str) -> list:
    return SHEETS.get(name, {}).get("key", [])


def cols_of(name: str) -> list:
    return SHEETS.get(name, {}).get("cols", [])


def month_col_of(name: str):
    return SHEETS.get(name, {}).get("monthCol")


def sheets_of_tier(tier: str) -> list:
    return [k for k, v in SHEETS.items() if v.get("tier") == tier]


# ══════════════════════════════════════════════════════════════════════
# Chuẩn hoá
# ══════════════════════════════════════════════════════════════════════
def norm(s) -> str:
    """Thường hoá, bỏ dấu tổ hợp, gộp khoảng trắng. Dùng để so khớp tên."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFKC", str(s))
    s = s.replace("​", "").replace("﻿", "")
    return re.sub(r"\s+", " ", s).strip().lower()


def to_num(v, default=None):
    """Ép về số. Chấp nhận '1.234,56', '1,234.56', '12%', '—', ô rỗng."""
    if v is None:
        return default
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    s = str(v).strip()
    if s in ("", "-", "--", "—", "nan", "None", "N/A", "#N/A"):
        return default
    pct = s.endswith("%")
    s = s.rstrip("%").replace(" ", "").replace(" ", "")
    # '1.234.567,89' (VN) vs '1,234,567.89' (EN)
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rindex(",") > s.rindex(".") \
            else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".") if len(s.split(",")[-1]) != 3 else s.replace(",", "")
    try:
        n = float(s)
    except ValueError:
        return default
    return n / 100 if pct else n


def month_of(v):
    """Bất cứ thứ gì trông như ngày/tháng → 'YYYY-MM'. Không nhận diện được thì None."""
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return f"{v.year:04d}-{v.month:02d}"
    s = str(v).strip()
    m = re.match(r"^(\d{4})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = re.search(r"(?:tháng|thang|t)\s*(\d{1,2})[.\-/\s]+(\d{4})", s, re.I)
    if m:
        return f"{int(m.group(2)):04d}-{int(m.group(1)):02d}"
    return None


def date_of(v):
    """→ 'YYYY-MM-DD' hoặc None."""
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})", s)
    if m:
        return f"{int(m.group(3)):04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def days_in_month(m: str) -> int:
    y, mm = int(m[:4]), int(m[5:7])
    nxt = date(y + (mm == 12), 1 if mm == 12 else mm + 1, 1)
    return (nxt - date(y, mm, 1)).days


# ══════════════════════════════════════════════════════════════════════
# Bản đồ cửa hàng — tên trong file export ↔ mã trong dim_store
#
# BẪY ĐÃ CHẶN: tên cửa hàng KHÔNG nhất quán giữa các nguồn. SKC trong POS ghi là
# "Café & Lounge" chứ không phải "Café & Bistro"; JFB The Crest có hai dấu cách.
# Vì vậy phải so khớp bằng bảng alias đã chuẩn hoá, tuyệt đối không dò chuỗi tên.
# ══════════════════════════════════════════════════════════════════════
STORE_ALIAS = {
    "noire cafe & bistro - the mett": "NCB_MET",
    "noire café & bistro - the mett": "NCB_MET",
    "the mett": "NCB_MET",
    "noire et": "NCB_ET",
    "noire cafe & bistro - empress tower": "NCB_ET",
    "noire café & bistro - empress tower": "NCB_ET",
    "empress tower": "NCB_ET",
    "noire cafe & lounge - skc": "NCB_SKC",
    "noire café & lounge - skc": "NCB_SKC",
    "noire cafe & bistro - skc": "NCB_SKC",
    "skc": "NCB_SKC",
    "noire cafe & bistro - gateway": "NCB_GW",
    "noire café & bistro - gateway": "NCB_GW",
    "gateway": "NCB_GW",
    "noire cafe & bistro - the 9 stellars": "NCB_9ST",
    "noire café & bistro - the 9 stellars": "NCB_9ST",
    "9 stellars": "NCB_9ST",
    "noire cafe & bistro - nguyễn đình chiểu": "NCB_NDC",
    "noire café & bistro - nguyễn đình chiểu": "NCB_NDC",
    "noire cafe & bistro - nguyen dinh chieu": "NCB_NDC",
    "nđ chiểu": "NCB_NDC",
    "noire dining & cafe - 39 nguyễn thị minh khai": "NDC_NTMK",
    "noire dining & café - 39 nguyễn thị minh khai": "NDC_NTMK",
    "39 nguyễn thị minh khai": "NDC_NTMK",
    "39 nguyen thi minh khai": "NDC_NTMK",
    "39 ntmk": "NDC_NTMK",
    "noire 39 ntmk": "NDC_NTMK",
    "noire dining": "NDC_NTMK",
    "noire dining & cafe - the berkley": "NDC_BKL",
    "noire dining & café - the berkley": "NDC_BKL",
    "the berkley": "NDC_BKL",
    "noire berkley": "NDC_BKL",
    "noire japanese fusion & bar - the crest": "NJFB_CRE",
    "the crest": "NJFB_CRE",
    "noire jfb crest": "NJFB_CRE",
    "noire japanese fusion & bar - ssv": "NJFB_SSV",
    "ssv": "NJFB_SSV",
    "noire jfb ssv": "NJFB_SSV",
    "ifc signature by noire": "IFC_SIG",
    "ifc signature": "IFC_SIG",
    "vifc cafe by noire": "IFC_SIG",
}

BRAND_OF_STORE = {
    "NCB_MET": "NCB", "NCB_ET": "NCB", "NCB_SKC": "NCB",
    "NCB_GW": "NCB", "NCB_9ST": "NCB", "NCB_NDC": "NCB",
    "NDC_NTMK": "NDC", "NDC_BKL": "NDC",
    "NJFB_CRE": "NJFB", "NJFB_SSV": "NJFB",
    "IFC_SIG": "OTHER",
}


def store_code(name, strict=False):
    """Tên cửa hàng bất kỳ → mã dim_store. Không khớp: None (hoặc ném lỗi nếu strict)."""
    n = norm(name).replace("  ", " ")
    if n in STORE_ALIAS:
        return STORE_ALIAS[n]
    for alias, code in STORE_ALIAS.items():
        if alias in n:
            return code
    if strict:
        raise KeyError(f"Cửa hàng chưa khai trong STORE_ALIAS: {name!r}")
    return None


# ══════════════════════════════════════════════════════════════════════
# Đọc file lạ
# ══════════════════════════════════════════════════════════════════════
def read_utf16_csv(path):
    """
    CSV export của Meta Business Suite: mã hoá UTF-16, dòng đầu là `sep=,`,
    dòng thứ hai là tiêu đề biểu đồ, dòng thứ ba mới là header thật.
    Trả về (title, header, rows).
    """
    with open(path, "rb") as f:
        raw = f.read()
    for enc in ("utf-16", "utf-16-le", "utf-8-sig", "utf-8"):
        try:
            text = raw.decode(enc)
            if "\x00" not in text:
                break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"Không đọc được mã hoá của {path}")

    lines = [ln.strip("\r") for ln in text.split("\n")]
    lines = [ln for ln in lines if ln.strip() and not ln.lower().startswith("sep=")]

    def split_csv(ln):
        out, cur, q = [], "", False
        for ch in ln:
            if ch == '"':
                q = not q
            elif ch == "," and not q:
                out.append(cur)
                cur = ""
            else:
                cur += ch
        out.append(cur)
        return [c.strip() for c in out]

    title = split_csv(lines[0])[0] if lines else ""
    header = split_csv(lines[1]) if len(lines) > 1 else []
    rows = [split_csv(ln) for ln in lines[2:]]
    return title, header, rows


class _TableParser(HTMLParser):
    """Bóc <table> đầu tiên bằng thư viện chuẩn — khỏi phải cài lxml."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self._row, self._cell, self._in = [], None, None, False

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th"):
            self._cell, self._in = "", True

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._row is not None:
            self._row.append((self._cell or "").strip())
            self._in = False
        elif tag == "tr" and self._row:
            self.rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._in:
            self._cell = (self._cell or "") + data


def read_html_table(path):
    """
    BẪY ĐÃ CHẶN: file `OA Zalo *.xls` mang đuôi Excel nhưng ruột là HTML.
    Mở bằng openpyxl sẽ ném lỗi khó hiểu. Trả về (header, rows).
    """
    with open(path, "rb") as f:
        raw = f.read()
    for enc in ("utf-8-sig", "utf-8", "utf-16", "cp1252"):
        try:
            html = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"Không đọc được mã hoá của {path}")
    p = _TableParser()
    p.feed(html)
    if not p.rows:
        return [], []
    return p.rows[0], p.rows[1:]


# ══════════════════════════════════════════════════════════════════════
# Ghi workbook
# ══════════════════════════════════════════════════════════════════════
_HDR_FILL = "FFF2EFE6"
_TITLE_FILL = "FF18181B"


def write_workbook(path, tables: dict, guide_lines=None, title=""):
    """
    Ghi một .xlsx. `tables` = {sheet_name: [dict, …]}.
    Cột được xếp theo thứ tự khai trong hợp đồng, cột lạ đẩy về cuối.
    Sheet rỗng vẫn được ghi (chỉ có header) để người dùng biết chỗ mà điền.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.remove(wb.active)

    if guide_lines:
        # Mô tả từng sheet để ngay trong file, không phải mở tài liệu song song.
        # KHÔNG đặt mô tả thành một ô ở dòng tiêu đề: loader sẽ đọc nó thành cột giả.
        guide_lines = list(guide_lines) + ["", "▸ CÁC SHEET TRONG FILE NÀY"]
        for nm in tables:
            spec = SHEETS.get(nm, {})
            req = spec.get("req") or spec.get("key") or []
            guide_lines.append(
                f"   {nm:<22} {len(tables[nm]):>5} dòng   bắt buộc: {', '.join(req) or '—'}")
            if spec.get("desc"):
                guide_lines.append(f"   {'':<22}         {spec['desc']}")
            if spec.get("derived"):
                guide_lines.append(
                    f"   {'':<22}         loader tự tính: {', '.join(spec['derived'])}")
        ws = wb.create_sheet("_HƯỚNG DẪN")
        ws.column_dimensions["A"].width = 118
        for i, line in enumerate([title] + [""] + list(guide_lines), start=1):
            c = ws.cell(row=i, column=1, value=line)
            c.alignment = Alignment(wrap_text=False, vertical="center")
            if i == 1:
                c.font = Font(bold=True, size=13, color="FFFFFFFF")
                c.fill = PatternFill("solid", start_color=_TITLE_FILL)
            elif line.startswith(("▸", "❶", "❷", "❸", "❹", "❺", "❻")):
                c.font = Font(bold=True)

    for name, rows in tables.items():
        ws = wb.create_sheet(name[:31])
        declared = cols_of(name)
        seen = []
        for r in rows:
            for k in r:
                if k not in seen:
                    seen.append(k)
        header = [c for c in declared if c in seen or not rows] + [c for c in seen if c not in declared]
        if not header:
            header = declared or ["(chưa có cột)"]

        for j, h in enumerate(header, start=1):
            c = ws.cell(row=1, column=j, value=h)
            c.font = Font(bold=True)
            c.fill = PatternFill("solid", start_color=_HDR_FILL)
            ws.column_dimensions[get_column_letter(j)].width = max(9, min(34, len(str(h)) + 4))

        for i, r in enumerate(rows, start=2):
            for j, h in enumerate(header, start=1):
                v = r.get(h)
                if isinstance(v, (list, dict)):
                    v = json.dumps(v, ensure_ascii=False)
                ws.cell(row=i, column=j, value=v)
        ws.freeze_panes = "A2"

    os.makedirs(os.path.dirname(path), exist_ok=True)
    wb.save(path)
    return path


def read_workbook(path, wanted=None):
    """Đọc .xlsx → {sheet: [dict, …]}. Bỏ qua sheet hướng dẫn và dòng rỗng hoàn toàn."""
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    out = {}
    for ws in wb.worksheets:
        name = ws.title.strip()
        if name.startswith("_HƯỚNG DẪN") or (wanted and name not in wanted):
            continue
        it = ws.iter_rows(values_only=True)
        try:
            head = next(it)
        except StopIteration:
            continue
        header = [str(c).strip() if c is not None else "" for c in head]
        if not any(header):
            continue
        rows = []
        for r in it:
            o, any_val = {}, False
            for j, h in enumerate(header):
                if not h:
                    continue
                v = r[j] if j < len(r) else None
                if isinstance(v, str):
                    v = v.replace("​", "").replace("﻿", "").strip()
                    v = None if v in ("", "—", "-") else v
                o[h] = v
                if v is not None:
                    any_val = True
            if any_val:
                rows.append(o)
        out[name] = rows
    wb.close()
    return out


def agg(rows, keys, sums=(), first=()):
    """Gộp list[dict] theo `keys`, cộng `sums`, giữ giá trị đầu tiên của `first`."""
    out = {}
    for r in rows:
        k = tuple(r.get(x) for x in keys)
        o = out.get(k)
        if o is None:
            o = {x: r.get(x) for x in keys}
            for s in sums:
                o[s] = 0.0
            for f in first:
                o[f] = r.get(f)
            out[k] = o
        for s in sums:
            v = to_num(r.get(s))
            if v is not None:
                o[s] = (o[s] or 0) + v
    return list(out.values())
