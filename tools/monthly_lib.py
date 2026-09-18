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
    # Excel để locale tiếng Việt gõ ngày thành CHUỖI '06-thg 02-26'. Sổ booking tiệc có
    # 38 dòng như vậy — không đọc được thì cả 38 lead lặng lẽ rơi khỏi phễu.
    m = re.match(r"^(\d{1,2})-thg (\d{1,2})-(\d{2}|\d{4})$", s)
    if m:
        y = int(m.group(3))
        y = y + 2000 if y < 100 else y
        try:
            return date(y, int(m.group(2)), int(m.group(1))).strftime("%Y-%m-%d")
        except ValueError:
            return None
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
def _load_dim_store():
    """Đọc dim_store từ 01_master.xlsx — NGUỒN DUY NHẤT của chiều cửa hàng.

    Trước đây bảng này có ba bản sao: sheet dim_store ở 01_master.xlsx, hằng
    STORE_ALIAS/BRAND_OF_STORE ở chính file này, và DIM_STORE + TARGET_ALIAS ở
    build_hub.py. Thêm một cửa hàng phải sửa ba chỗ; quên một chỗ là doanh thu
    cửa hàng đó lặng lẽ rơi khỏi một nửa hệ thống. Nay chỉ còn một chỗ: cột
    `aliases` của sheet dim_store.
    """
    path = os.path.join(DATA_INPUT, "01_master.xlsx")
    if not os.path.exists(path):
        raise FileNotFoundError(
            "Không thấy data_input/01_master.xlsx — đây là nơi khai dim_store, "
            "không có nó thì không lane nào ánh xạ được tên cửa hàng.")
    import openpyxl

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["dim_store"]
    hdr, rows = None, []
    for r in ws.iter_rows(values_only=True):
        if hdr is None:
            hdr = {str(c).strip(): j for j, c in enumerate(r) if c}
            continue
        if not r or hdr["code"] >= len(r) or not r[hdr["code"]]:
            continue
        rows.append({k: (r[j] if j < len(r) else None) for k, j in hdr.items()})
    wb.close()

    meta, alias = {}, {}
    for r in rows:
        code = str(r["code"]).strip()
        meta[code] = {
            "code": code,
            "brand": str(r.get("brand") or "OTHER").strip(),
            "tier": str(r.get("tier") or "core").strip(),
            "name": str(r.get("name") or code).strip(),
            "open": str(r["open"])[:7] if r.get("open") else None,
            "alias_re": (str(r["alias_re"]).strip() if r.get("alias_re") else None),
        }
        for a in str(r.get("aliases") or "").split("|"):
            a = norm(a)
            if a:
                alias[a] = code
    if not meta:
        raise ValueError("sheet dim_store rỗng — không ánh xạ được cửa hàng nào")
    return meta, alias


STORE_META, STORE_ALIAS = _load_dim_store()
BRAND_OF_STORE = {c: m["brand"] for c, m in STORE_META.items()}
#: Cửa hàng chính — dùng cho phép so sánh loại trừ satellite/popup.
CORE_STORES = [c for c, m in STORE_META.items() if m["tier"] in ("core", "flagship")]

# store_code() dò theo CHUỖI CON nên bí danh DÀI phải xét trước: "39 ntmk" phải
# thắng "ntmk". Trước đây thứ tự là thứ tự gõ tay trong dict — một bí danh ngắn
# của cửa hàng khai trước có thể nuốt tên của cửa hàng khai sau mà không ai biết.
_ALIAS_ORDER = sorted(STORE_ALIAS, key=len, reverse=True)

# Cột `alias_re` — mẫu nhận cửa hàng từ CHUỖI TỰ DO (tên chiến dịch ads, tên sheet),
# khác hẳn `aliases` vốn khớp một ô "tên cửa hàng". Hai chế độ khớp, nhưng vẫn khai
# ở một chỗ. Trước đây bảng này có hai bản: GADS_STORE ở tools/build_month.py và
# GSTORE ở build_mkt.py — và chúng ĐÃ lệch: bản kia có `minh khai`, bản này không.
STORE_RE = [(c, re.compile(m["alias_re"], re.I))
            for c, m in STORE_META.items() if m.get("alias_re")]


def store_in_text(text):
    """Dò mã cửa hàng trong một chuỗi tự do. Không thấy → None."""
    t = norm(text)
    if not t:
        return None
    for code, rx in STORE_RE:
        if rx.search(t):
            return code
    return None


def store_code(name, strict=False):
    """Tên cửa hàng bất kỳ → mã dim_store. Không khớp: None (hoặc ném lỗi nếu strict)."""
    n = norm(name).replace("  ", " ")
    if not n:
        return None
    if n in STORE_ALIAS:
        return STORE_ALIAS[n]
    for a in _ALIAS_ORDER:
        if a in n:
            return STORE_ALIAS[a]
    if strict:
        raise KeyError(f"Cửa hàng chưa khai ở dim_store.aliases: {name!r}")
    return None


# ══════════════════════════════════════════════════════════════════════
# Bản chất chương trình khuyến mãi — đọc từ $promo_nature của hợp đồng
#
# Trước đây bảng luật này có NĂM bản sao: build_hub.py, tools/build_month.py,
# scripts/build-data.mjs, src/types/hub.ts, src/views/PromotionView.tsx.
# ══════════════════════════════════════════════════════════════════════
_NAT = CONTRACT["$promo_nature"]
#: Thứ tự hiển thị = thứ tự khai ở hợp đồng.
NATURE_META: list = _NAT["labels"]
NATURES = [n["code"] for n in NATURE_META]
NATURE_DEFAULT = _NAT["default"]
_NATURE_RULES = [(r["nature"], [re.compile(p) for p in r["re"]]) for r in _NAT["rules"]]
# Luật PARTNER mang thêm Mã ĐT (danh mục đối tác L0 S15) — cùng bảng luật, cùng thứ tự.
_PARTNER_RULES = [(r["nature"], r.get("partner"), [re.compile(p) for p in r["re"]])
                  for r in _NAT["rules"]]
PARTNER = CONTRACT["$partner"]
PARTNER_OTHER = PARTNER["other"]["code"]
_PARTNER_POS = [(p["partner"], p.get("delivery_partner"),
                 [re.compile(x) for x in p.get("source_re", [])],
                 [re.compile(x) for x in p.get("pttt_re", [])]) for p in PARTNER["pos"]]


def classify_nature(name):
    """Tên CTKM → một nhãn bản chất. Tên rỗng → None (hoá đơn không gắn CTKM).

    Luật xét TỪ TRÊN XUỐNG đúng thứ tự khai ở hợp đồng, khớp đầu tiên thắng.
    Không khớp luật nào mà vẫn có tên CTKM = marketing thương mại."""
    n = norm(name)
    if not n:
        return None
    for nat, pats in _NATURE_RULES:
        if any(p.search(n) for p in pats):
            return nat
    return NATURE_DEFAULT


def classify_partner(name):
    """Tên CTKM → Mã ĐT nếu CTKM thuộc bản chất PARTNER, ngược lại None.

    Đi đúng bảng luật của classify_nature (khớp đầu tiên thắng), nên một tên
    không bao giờ là PARTNER ở M7 mà lại không có đối tác ở M9."""
    n = norm(name)
    if not n:
        return None
    for nat, code, pats in _PARTNER_RULES:
        if any(p.search(n) for p in pats):
            return (code or PARTNER_OTHER) if nat == "PARTNER" else None
    return None


def partner_of_bill(camp, source, pttt, guests, commission):
    """Một hoá đơn POS → (Mã ĐT, basis) hoặc (None, None). Thứ tự: CTKM → Nguồn → PTTT.

    Hoá đơn nền tảng có Hoa hồng trên POS hoặc không có khách ngồi là đơn GIAO HÀNG
    (GrabFood) — tách khỏi Grab Dine Out theo `delivery_partner` của hợp đồng."""
    code = classify_partner(camp)
    if code:
        return code, "CTKM"
    s, p = norm(source), norm(pttt)
    for part, deliv, src_re, pay_re in _PARTNER_POS:
        basis = ("NGUON" if s and any(x.search(s) for x in src_re)
                 else "PTTT" if p and any(x.search(p) for x in pay_re) else None)
        if basis:
            delivery = (commission or 0) > 0 or not guests
            return (deliv if delivery and deliv else part), basis
    return None, None


# ══════════════════════════════════════════════════════════════════════
# Phễu booking tiệc — đọc từ $booking của hợp đồng
#
# Chốt là gì, dòng nào là đặt bàn chứ không phải tiệc, chiến dịch ads nào thuộc phễu
# booking: khai MỘT lần ở data_contract.json. ETL gắn nhãn sẵn vào sheet `booking`
# và `ads_campaign_detail`, loader và màn hình M10 chỉ đọc nhãn — không tự đoán lại.
# ══════════════════════════════════════════════════════════════════════
BOOKING = CONTRACT["$booking"]
_BK_STAGE = {m: s["code"] for s in BOOKING["stages"] for m in s["match"]}
_BK_SEG = BOOKING["segment"]
_BK_ADS_RE = [re.compile(p) for p in BOOKING["ads"]["re"]]
_BK_ADS_EX = [re.compile(p) for p in BOOKING["ads"]["exclude_re"]]
_BK_PAGES = set(BOOKING["ads"]["pages"])
_BK_RKIND = [(k["code"], [re.compile(p) for p in k["re"]]) for k in BOOKING["result_kinds"]]
_BK_LOST = [(k["label"], [re.compile(p) for p in k["re"]]) for k in BOOKING["lost_reasons"]]


def booking_stage(status):
    """Status thô trong sổ booking → won | open | lost."""
    return _BK_STAGE.get(norm(status), BOOKING["stage_default"])


_BK_ETYPE = {k: v for k, v in BOOKING["etype_alias"].items() if not k.startswith("$")}
_BK_ETYPE_SEEN = {}


def booking_etype(etype):
    """Loại sự kiện gõ tay → tên chuẩn ($booking.etype_alias). 'TBA' → None."""
    n = norm(etype)
    if not n:
        return None
    if n in _BK_ETYPE:
        return _BK_ETYPE[n]
    return _BK_ETYPE_SEEN.setdefault(n, str(etype).strip())


def booking_segment(etype, guests):
    """'table' nếu là đặt bàn nhỏ (loại bữa ăn thường VÀ ít khách), còn lại 'event'."""
    if guests is not None and guests < _BK_SEG["table_max_guests"] \
            and norm(etype) in _BK_SEG["table_types"]:
        return "table"
    return "event"


def ads_page(campaign):
    """Mã fanpage đứng đầu tên chiến dịch kiểu mới `NEC | Messages | 2026` → 'NEC'."""
    m = re.match(r"^\s*([a-z]{2,5})\s*\|", norm(campaign))
    return m.group(1).upper() if m else None


def ads_is_booking(campaign):
    n = norm(campaign)
    if any(p.search(n) for p in _BK_ADS_EX):
        return False
    return (ads_page(campaign) or "").lower() in _BK_PAGES or any(p.search(n) for p in _BK_ADS_RE)


def ads_result_kind(result_type):
    """Cột 'Loại kết quả' của Meta → msg | lead | like | engage | click | other."""
    n = norm(result_type)
    for code, pats in _BK_RKIND:
        if n and any(p.search(n) for p in pats):
            return code
    return BOOKING["result_default"]


def booking_lost_reason(*texts):
    """Lý do mất lead (gõ tự do ở 'Reason if lost' / 'Comment') → một nhóm chuẩn."""
    n = norm(" · ".join(str(t) for t in texts if t))
    if not n:
        return BOOKING["lost_blank"]
    for label, pats in _BK_LOST:
        if any(p.search(n) for p in pats):
            return label
    return BOOKING["lost_default"]


# ══════════════════════════════════════════════════════════════════════
# TẦNG L0 — MỘT thư mục thả file, MỘT sổ đăng ký, MỘT bộ hàm đọc
#
#   L0_input/                     ← nơi DUY NHẤT thả file Excel thô
#   data_sources.json             ← sổ đăng ký (sinh từ tools/l0_registry.py)
#   l0_files / l0_latest / l0_by_month / l0_scan   ← mọi script đọc qua đây
#
# Lịch sử (16/09/2026): trước đây có hai cây dữ liệu (HIGHGATE và L0_input), bốn
# hàm find_root() khác nhau, đường dẫn nối cứng ở từng script — năm nguồn chết âm
# thầm vì phòng ban đánh lại số thư mục. Nay gốc cố định là L0_input/.
# ══════════════════════════════════════════════════════════════════════
import fnmatch  # noqa: E402
import glob as _glob  # noqa: E402

SOURCES_PATH = os.path.join(ROOT, "data_sources.json")
with open(SOURCES_PATH, encoding="utf-8") as _f:
    SOURCES_DOC = json.load(_f)
SOURCES = {s["id"]: s for s in SOURCES_DOC["sources"]}

L0_ROOT = os.environ.get("NOIRE_ROOT") or os.path.join(ROOT, "L0_input")
L0_WHY = "biến môi trường NOIRE_ROOT" if os.environ.get("NOIRE_ROOT") else "L0_input/ trong dự án"

#: File khung / file tạm — KHÔNG phải dữ liệu. `~$…` là file khoá Excel tạo ra khi
#: đang mở file; đọc nhầm nó là lỗi "file hỏng" khó hiểu nhất.
_PLACEHOLDER = {".gitkeep", ".gitignore", "readme.md", "thumbs.db", ".ds_store",
                "desktop.ini", "_huong_dan.txt"}
_NUM_PREFIX = re.compile(r"^\s*\d+\s*[._)-]?\s*")


def _is_data(path: str) -> bool:
    b = os.path.basename(path)
    # `_MAU_…` = file mẫu nhập liệu đặt sẵn trong thư mục nguồn — KHÔNG phải số liệu.
    return (os.path.isfile(path) and not b.startswith("~$") and not b.startswith(".")
            and not b.upper().startswith("_MAU_")
            and b.lower() not in _PLACEHOLDER and not b.lower().endswith((".bak", ".tmp")))


def _seg_key(name: str) -> str:
    """Tên thư mục bỏ số thứ tự đầu → khoá so khớp. `6. Digital Ads` ≡ `03 Digital Ads`."""
    return _NUM_PREFIX.sub("", norm(name).replace("_", " "))


def resolve_path(root: str, rel: str):
    """Ghép `root` với đường dẫn tương đối, chấp nhận lệch số thứ tự ở mỗi cấp."""
    cur = root
    for seg in str(rel).replace("\\", "/").split("/"):
        if not seg:
            continue
        nxt = os.path.join(cur, seg)
        if os.path.isdir(nxt):
            cur = nxt
            continue
        want, hit = _seg_key(seg), None
        try:
            for child in os.listdir(cur):
                if os.path.isdir(os.path.join(cur, child)) and _seg_key(child) == want:
                    hit = child
                    break
        except OSError:
            return None
        if hit is None:
            return None
        cur = os.path.join(cur, hit)
    return cur


def l0_dir(sid, *sub):
    """Thư mục của một nguồn trong L0_input. Không có → None."""
    s = SOURCES.get(sid)
    rel = "/".join([s["dir"], *sub]) if s else "/".join([sid, *sub])
    return resolve_path(L0_ROOT, rel)


def l0_files(sid):
    """Mọi file DỮ LIỆU khớp mẫu của nguồn. Mẫu `a | b` = nhiều mẫu; có `/` = thư mục con."""
    d = l0_dir(sid)
    if not d:
        return []
    out = set()
    for pat in [p.strip() for p in SOURCES[sid]["pattern"].split("|") if p.strip()]:
        if "/" in pat:
            cands = _glob.glob(os.path.join(d, pat))
        else:
            cands = [os.path.join(d, f) for f in os.listdir(d)
                     if fnmatch.fnmatch(f.lower(), pat.lower())]
        out.update(c for c in cands if _is_data(c))
    return sorted(out)


def l0_latest(sid):
    """File sửa gần nhất của nguồn — dùng cho nguồn luỹ kế / cấu hình."""
    fs = l0_files(sid)
    return max(fs, key=os.path.getmtime) if fs else None


def file_month(sid, path):
    """Tháng của một file theo `month_regex` của nguồn (xét cả tên thư mục con)."""
    rx = SOURCES[sid].get("month_regex")
    if not rx:
        return None
    rel = os.path.relpath(path, l0_dir(sid) or os.path.dirname(path))
    m = re.search(rx, rel, re.I)
    if not m:
        return None
    a, b = m.group(1), m.group(2)
    y, mo = (a, b) if len(a) == 4 else (b, a)
    mo = int(mo)
    return f"{int(y):04d}-{mo:02d}" if 1 <= mo <= 12 else None


def _group_by_month(sid):
    """Gom file theo tháng. Nguồn `monthly_folder` (một THƯ MỤC mỗi tháng) có nhiều
    file mỗi tháng là BÌNH THƯỜNG — chỉ nguồn `monthly` mới coi là trùng."""
    by = {}
    for f in l0_files(sid):
        m = file_month(sid, f)
        if m:
            by.setdefault(m, []).append(f)
    return by


def l0_by_month(sid):
    """{tháng: file} cho nguồn theo tháng. Hai file cùng tháng → lấy file MỚI NHẤT.

    Trước đây build_hub.py nạp HẾT mọi file khớp tháng: thả `accounting_sale T9.2026
    _ tới 13-09.xlsx` rồi thả thêm bản đủ tháng là doanh thu T9 bị CỘNG ĐÔI."""
    return {m: max(fs, key=os.path.getmtime) for m, fs in _group_by_month(sid).items()}


def l0_duplicates(sid):
    """{tháng: [file bị BỎ QUA vì đã có bản mới hơn cùng tháng]}."""
    out = {}
    if SOURCES[sid]["cadence"] != "monthly" or SOURCES[sid].get("many_per_month"):
        return out
    for m, fs in _group_by_month(sid).items():
        if len(fs) > 1:
            keep = max(fs, key=os.path.getmtime)
            out[m] = sorted(x for x in fs if x != keep)
    return out


def l0_month_file(sid, month):
    """File của một tháng (bản mới nhất nếu có nhiều)."""
    return l0_by_month(sid).get(month)


def l0_month_files(sid, month):
    """MỌI file của một tháng — cho nguồn `many_per_month` (vd. eVoucher mỗi brand một file)."""
    return sorted(_group_by_month(sid).get(month, []))


def file_sig(path):
    """Chữ ký file để biết file đã bị thay chưa (kích thước + giờ sửa)."""
    try:
        st = os.stat(path)
        return f"{st.st_size}:{int(st.st_mtime)}"
    except OSError:
        return None


def month_range(a, b):
    y, m = int(a[:4]), int(a[5:7])
    out = []
    while f"{y:04d}-{m:02d}" <= b:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def last_closed_month(today=None):
    """Tháng đã khép sổ gần nhất — mốc để BÁO THIẾU file theo tháng."""
    from datetime import date as _d
    t = today or _d.today()
    y, m = (t.year, t.month - 1) if t.month > 1 else (t.year - 1, 12)
    return f"{y:04d}-{m:02d}"


def l0_scan(until=None):
    """Kiểm kê toàn bộ L0_input theo sổ đăng ký. Mỗi nguồn trả một dict có
    state ∈ OK | THIEU_THANG | TRONG | KHONG_CO_THU_MUC."""
    from datetime import datetime as _dt
    until = until or last_closed_month()
    rep = []
    for sid, s in SOURCES.items():
        d = l0_dir(sid)
        r = dict(id=sid, name=s["name"], dir=s["dir"], required=bool(s.get("required")),
                 cadence=s["cadence"], pattern=s["pattern"], files=[], months=[],
                 missing=[], duplicates={}, unrecognised=[], latest=None)
        if not d:
            r["state"] = "KHONG_CO_THU_MUC"
            rep.append(r)
            continue
        fs = l0_files(sid)
        r["files"] = [os.path.relpath(f, d) for f in fs]
        if not fs:
            r["state"] = "TRONG"
            rep.append(r)
            continue
        lat = max(fs, key=os.path.getmtime)
        r["latest"] = dict(file=os.path.relpath(lat, d),
                           modified=_dt.fromtimestamp(os.path.getmtime(lat)).strftime("%Y-%m-%d %H:%M"))
        if s["cadence"] in ("monthly", "monthly_folder"):
            by = l0_by_month(sid)
            r["months"] = sorted(by)
            want = month_range(s["since"], until) if s.get("since", "9999") <= until else []
            r["missing"] = [m for m in want if m not in by]
            r["duplicates"] = {m: [os.path.relpath(x, d) for x in v]
                               for m, v in l0_duplicates(sid).items()}
            r["unrecognised"] = [os.path.relpath(f, d) for f in fs if not file_month(sid, f)]
        r["state"] = "THIEU_THANG" if r["missing"] else "OK"
        rep.append(r)
    return rep


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
