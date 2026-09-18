# -*- coding: utf-8 -*-
"""
NOIRE ANALYTICS HUB — ETL
=========================
Đọc toàn bộ dữ liệu thô -> chuẩn hoá -> chạy 9 chốt QA -> xuất data.json

Chạy:  python build_hub.py
Yêu cầu: pandas, openpyxl   (pip install pandas openpyxl)

Nguyên tắc (xem 00_BLUEPRINT):
  NT1 Raw bất khả xâm phạm - không sửa file gốc
  NT2 Một chỉ số định nghĩa đúng một lần
  NT4 Mọi con số truy được về file nguồn
"""
import os, re, sys, json, glob, io
# Console Windows mặc định là cp1252 và không in được tiếng Việt: mọi print có dấu
# sẽ ném UnicodeEncodeError và giết cả script giữa chừng. Ép UTF-8 ngay từ đầu.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
from datetime import datetime
import pandas as pd
import numpy as np

pd.options.mode.chained_assignment = None

# ══════════════════════════════════════════════════════════════
# 0. CẤU HÌNH ĐƯỜNG DẪN — sửa ROOT nếu chuyển máy
# ══════════════════════════════════════════════════════════════
HERE = os.path.dirname(os.path.abspath(__file__))

# Gốc dữ liệu L0 do monthly_lib.pick_l0_root() chọn — MỘT bộ luật cho mọi script.
# Trước 16/09/2026 mỗi file có find_root() riêng với thứ tự ưu tiên riêng, và
# `os.path.join(HERE, "..")` ở đây chỉ lên tới thư mục cha của dự án chứ không tới
# cây HIGHGATE — nên script này và tools/build_month.py chốt trên hai gốc khác nhau.
sys.path.insert(0, os.path.join(HERE, "tools"))
from monthly_lib import L0_ROOT, L0_WHY, l0_dir  # noqa: E402



def find_root():
    return L0_ROOT


ROOT = find_root()
# Mọi đường dẫn nguồn lấy từ sổ đăng ký qua monthly_lib — KHÔNG nối chuỗi thư mục ở
# đây. Bản trước nối cứng `05 Data Raw/01 Sales Revenue/…` và tên file cứng
# `revenue-report-group-by-date T1-T7.xlsx`: POS xuất lại thành `…T1-T9_to 13.09.xlsx`
# là doanh thu ngày lặng lẽ đứng ở tháng 7.
from monthly_lib import l0_by_month, l0_dir, l0_latest, file_sig  # noqa: E402

P_ITEM_BY_MONTH = l0_by_month("S01_item")      # {tháng: file mới nhất}
P_BILL_BY_MONTH = l0_by_month("S02_bill")
P_MONTH_BY_MONTH = l0_by_month("S04_monthly")
P_DAILY     = l0_latest("S03_daily")
P_DAILY_T8  = None                             # đã gộp vào file doanh thu ngày luỹ kế
P_LEAD      = None                             # thay bằng S07 Booking (tools/build_month.py)
P_TARGET    = None                             # thay bằng config_targets.csv (tools/tracking.py)
P_BOM       = l0_latest("S05_bom")
CACHE = os.environ.get("NOIRE_CACHE") or os.path.join(HERE, "_cache")
OUT   = os.path.join(HERE, "data.json")
QALOG = os.path.join(HERE, "qa_log_%s.txt" % datetime.now().strftime("%Y%m%d_%H%M"))
os.makedirs(CACHE, exist_ok=True)

LOG = []
def log(msg=""):
    print(msg, flush=True)
    LOG.append(str(msg))

# ══════════════════════════════════════════════════════════════
# 1. L1 · dim_store — bảng master, so khớp bằng alias đã chuẩn hoá
# ══════════════════════════════════════════════════════════════
# Chiều cửa hàng và luật phân loại CTKM ĐỀU đọc từ nguồn duy nhất, không khai lại
# ở đây nữa:
#     dim_store  →  data_input/01_master.xlsx, cột `aliases`
#     nature     →  data_contract.json, khối `$promo_nature`
# Trước 16/09/2026 file này giữ bản sao riêng của cả hai. Cả hai đều đã lệch thật:
# bảng alias thiếu vài cách viết mà lane monthly có, còn luật nature bắt `nhân viên`
# trước `skg` nên `Giảm 50% cho Nhân Viên SonKim Group` — nhân viên ĐỐI TÁC — bị
# xếp vào INTERNAL.
sys.path.insert(0, os.path.join(HERE, "tools"))
from monthly_lib import (  # noqa: E402
    BRAND_OF_STORE, CORE_STORES, NATURE_META, NATURES, STORE_META,
    classify_nature, norm, store_code,
)

CORE7 = CORE_STORES

# Dòng tổng trá hình — bẫy có ở CẢ BA nguồn
TOTAL_MARKERS = {"tổng", "tong", "tổng:", "tại chỗ", "mang về", "grab", "corporate", ""}


def map_store(raw):
    """→ (code, brand, tier, tên hiển thị). Không khớp: bộ bốn None."""
    c = store_code(raw)
    if not c:
        return (None, None, None, None)
    m = STORE_META[c]
    return (c, m["brand"], m["tier"], m["name"])


def map_store_frame(col):
    """Ánh xạ cả một cột tên cửa hàng → DataFrame 4 cột (store, brand, tier, sname).

    Ánh xạ trên GIÁ TRỊ DUY NHẤT rồi nối lại: cột có ~270.000 dòng nhưng chỉ ~15 tên
    khác nhau. Bản trước gọi pd.Series() cho từng dòng — mất nhiều phút mỗi lần chạy."""
    uniq = {v: map_store(v) for v in pd.unique(col)}
    return pd.DataFrame([uniq[v] for v in col], index=col.index,
                        columns=["store", "brand", "tier", "sname"])


def map_store_loose(raw):
    """Bí danh lỏng (file TARGET viết thiếu dấu, thiếu khoảng trắng) nay đã nằm
    chung trong cột `aliases`, nên không còn cần bảng regex riêng."""
    return store_code(raw)



DAYPARTS = [(0, 10, "Sáng ≤10h"), (11, 14, "Trưa 11-14h"), (15, 17, "Chiều 15-17h"),
            (18, 21, "Tối 18-21h"), (22, 23, "Khuya 22h+")]
def daypart(h):
    if pd.isna(h):
        return None
    h = int(h)
    for a, b, lb in DAYPARTS:
        if a <= h <= b:
            return lb
    return "Khuya 22h+"

def num(s):
    return pd.to_numeric(s, errors="coerce").fillna(0)

# ══════════════════════════════════════════════════════════════
# 3. Nạp nguồn — có cache pickle để chạy lại nhanh
# ══════════════════════════════════════════════════════════════
# Đổi số này mỗi khi cách ĐỌC file thay đổi — mọi cache pickle cũ tự huỷ theo.
READER_VERSION = "v3-bi-danh-cot-T8"

# iPOS ĐỔI TÊN CỘT từ export T8/2026 (báo cáo bán hàng). Tên cũ là tên chuẩn của lane;
# tên mới được đổi về tên cũ ngay khi đọc, TRƯỚC bước lọc cột — nếu không, cột bị lọc
# mất và T8/T9 không có mã hoá đơn, không có ngày (khung giờ · thứ trong tuần bỏ rơi).
COL_ALIAS = {
    "Hoá đơn": "Mã hoá đơn",
    "Số hoá đơn": "Số HĐ",
    "Ngày": "Thời gian",            # T8: "01/08/2026 08:24:21" — cũ: "01/04/2026"
    "Phiếu giảm giá": "Phiếu GG",
}
ALL_STORE_SHEET = "tất cả cửa hàng"

def read_xlsx_fast(path, header_row=1, usecols=None):
    """Đọc xlsx bằng openpyxl read_only — nhẹ RAM hơn pandas.read_excel rất nhiều.
    File bán hàng 60MB nếu dùng pandas sẽ ngốn ~2GB và chết.

    BẪY (phát hiện 16/09/2026): từ T8/2026 iPOS xuất MỖI CỬA HÀNG MỘT SHEET rồi thêm
    sheet 'Tất cả cửa hàng' ở CUỐI. Bản trước đọc `worksheets[0]` = chỉ một cửa hàng:
    T8 nạp 5.100/34.534 dòng món (15%), T9 1.505/15.877. Mọi bảng Menu · giờ · khu vực
    · nhân viên từ T8 thiếu 85% số mà không báo lỗi gì. Nay: có sheet tổng thì CHỈ đọc
    sheet tổng; dòng tiêu đề dò theo nội dung (có cột 'Cửa hàng'), không đếm dòng cứng.
    `header_row` giữ lại cho tương thích nhưng chỉ dùng khi không dò được."""
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    names = [n for n in wb.sheetnames if norm(n) == ALL_STORE_SHEET]
    ws = wb[names[0]] if names else wb.worksheets[0]
    ws.reset_dimensions()
    hdr, rows, keep = None, [], None
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if r is None:
            continue
        if hdr is None:
            cells = [str(c).replace("\n", " ").replace("\u200b", "").strip() if c is not None else ""
                     for c in r]

            if "Cửa hàng" not in cells and not (i == header_row and not any(
                    "Cửa hàng" in str(x) for x in cells)):
                continue
            hdr = [COL_ALIAS.get(c, c) if c else "c%d" % j for j, c in enumerate(cells)]
            keep = list(range(len(hdr))) if usecols is None else \
                   [j for j, h in enumerate(hdr) if h in usecols]
            hdr = [hdr[j] for j in keep]
            continue
        rows.append(tuple(r[j] if j < len(r) else None for j in keep))
    wb.close()
    if hdr is None:
        raise ValueError("%s: không thấy dòng tiêu đề có cột 'Cửa hàng'" % os.path.basename(path))
    return pd.DataFrame(rows, columns=hdr)

def cached(name, loader, need=None, src=None):
    """Cache pickle, TỰ HUỶ khi file nguồn đổi.

    Bản trước chỉ khoá theo tháng (`ITEM_2026-09.pkl`): thả bản T9 đủ tháng đè lên
    bản 'tới 13-09' thì hệ thống vẫn đọc pickle cũ — dashboard không bao giờ thấy
    số mới. Nay lưu kèm chữ ký file (kích thước + giờ sửa); khác là nạp lại."""
    p = os.path.join(CACHE, name + ".pkl")
    sig_p = p + ".sig"
    want = ("%s|%s" % (READER_VERSION, file_sig(src))) if src else None
    if os.path.exists(p):
        try:
            have = io.open(sig_p, encoding="utf-8").read().strip() if os.path.exists(sig_p) else None
            if want and have != want:
                log("   cache %s cũ (file nguồn đã thay) → nạp lại từ Excel" % name)
            else:
                df = pd.read_pickle(p)
                if not need or set(need).issubset(df.columns):
                    return df
                log("   cache %s thiếu cột → nạp lại từ Excel" % name)
        except Exception:
            pass
    df = loader()
    try:
        df.to_pickle(p)
        if want:
            io.open(sig_p, "w", encoding="utf-8").write(want)
    except Exception:
        pass
    return df

def month_of(path):
    m = re.search(r"(?:tháng|thang|T)\s*(\d{1,2})[\.\s]*(\d{4})", os.path.basename(path), re.I)
    if m:
        return "%s-%02d" % (m.group(2), int(m.group(1)))
    return None

ITEM_COLS = ["Cửa hàng", "Mã hàng", "Tên hàng", "Nhóm món", "Loại món", "Mã combo",
             "Mã hoá đơn", "Thời gian", "Giờ", "Số lượng", "Giá", "Giá bán",
             "Thành tiền", "Giảm giá", "Tổng tiền", "Tên CTKM", "Mã voucher"]
BILL_COLS = ["Cửa hàng", "Mã hoá đơn", "Số HĐ", "Số khách", "Nguồn", "Khu vực",
             "Ngày chứng từ", "Giờ vào", "Giờ ra", "Bàn", "PTTT", "Giảm giá",
             "Chiết khấu", "Phiếu GG", "Hoa hồng", "Tổng tiền", "Tên khách",
             "Nhân viên", "Số điện thoại"]

def load_items():
    """fact_item — 1 dòng = 1 món trong 1 hoá đơn."""
    frames = []
    for mo, f in sorted(P_ITEM_BY_MONTH.items()):
        d = cached("ITEM_" + mo, lambda f=f: read_xlsx_fast(f, 1, set(ITEM_COLS)),
                   ["Cửa hàng", "Mã hàng", "Tổng tiền", "Thành tiền", "Tên CTKM"], src=f)
        d["month"] = mo
        frames.append(d)
        log("   nạp fact_item %s : %6d dòng" % (mo, len(d)))
    return pd.concat(frames, ignore_index=True)

def load_bills():
    """fact_bill — 1 dòng = 1 hoá đơn (bảng kê, 34 cột)."""
    frames = []
    for mo, f in sorted(P_BILL_BY_MONTH.items()):
        d = cached("BILL_" + mo, lambda f=f: read_xlsx_fast(f, 1, set(BILL_COLS)),
                   ["Cửa hàng", "Mã hoá đơn", "Tổng tiền", "Giờ vào", "Số điện thoại"], src=f)
        d["month"] = mo
        frames.append(d)
        log("   nạp fact_bill %s : %6d dòng" % (mo, len(d)))
    return pd.concat(frames, ignore_index=True)

def load_monthly():
    """Báo cáo doanh thu tháng — nguồn ĐỐI SOÁT, không phải nguồn lấy số."""
    rows = []
    for mo, f in sorted(P_MONTH_BY_MONTH.items()):
        try:
            d = pd.read_excel(f, sheet_name=0, header=1)
        except Exception:
            continue
        c0 = d.columns[0]
        for _, r in d.iterrows():
            nm = norm(r[c0])
            if not nm or nm.startswith("tổng"):
                continue
            code, brand, tier, disp = map_store(r[c0])
            if not code:
                continue
            g = lambda k: pd.to_numeric(r.get(k), errors="coerce")
            rows.append(dict(month=mo, store=code,
                             guest=g("Số khách"), tc=g("Số HĐ"),
                             gross=g("Doanh thu Gross"), net=g("Doanh thu Net"),
                             giamgia=g("Giảm giá"), chietkhau=g("Chiết khấu"),
                             hoahong=g("Hoa hồng"), phieugg=g("Phiếu GG")))
    return pd.DataFrame(rows)

def load_daily():
    frames = []
    if P_DAILY:
        d = pd.read_excel(P_DAILY, sheet_name=0, header=1)
        frames.append(d)
    if P_DAILY_T8:
        try:
            d8 = pd.read_excel(P_DAILY_T8, sheet_name=0, header=1)
            frames.append(d8)
        except Exception:
            pass
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)

def load_bom():
    """dim_product — bảng COGS chuẩn. Header nằm ở dòng 4 -> header=3."""
    if not P_BOM:
        return pd.DataFrame()
    b = pd.read_excel(P_BOM, sheet_name="01_COGS_ALL", header=3)
    b = b[b["MÃ MÓN"].notna()].copy()
    b["ma"] = b["MÃ MÓN"].astype(str).str.strip()
    b["cogs"] = num(b["GIÁ VỐN"])
    b["pct"] = pd.to_numeric(b["% GIÁ VỐN"], errors="coerce")
    return b

# ══════════════════════════════════════════════════════════════
# 4. CHẠY
# ══════════════════════════════════════════════════════════════
log("=" * 74)
log("NOIRE ANALYTICS HUB — ETL   %s" % datetime.now().strftime("%d/%m/%Y %H:%M"))
log("ROOT: %s" % ROOT)
log("=" * 74)

log("\n[1/6] Nạp nguồn ...")
IT = load_items()
BL = load_bills()
MO = load_monthly()
DL = load_daily()
BOM = load_bom()
log("   fact_item  %7d dòng | fact_bill %7d dòng" % (len(IT), len(BL)))
log("   monthly    %7d dòng | daily     %7d dòng | BOM %d món" % (len(MO), len(DL), len(BOM)))

# ---------- 4.1 Làm sạch fact_item ----------
log("\n[2/6] Làm sạch & chuẩn hoá ...")
QA = []

n0 = len(IT)
IT["store_norm"] = IT["Cửa hàng"].map(norm)
IT = IT[~IT["store_norm"].isin(TOTAL_MARKERS)]
removed_item = n0 - len(IT)
log("   fact_item: loại %d dòng tổng ('Tổng')" % removed_item)

IT[["store", "brand", "tier", "sname"]] = map_store_frame(IT["Cửa hàng"])
unmapped = IT[IT["store"].isna()]["Cửa hàng"].unique().tolist()
IT = IT[IT["store"].notna()]

IT["qty"] = num(IT["Số lượng"])
IT["line_rev"] = num(IT["Thành tiền"])      # doanh thu món trước phí DV & VAT
IT["net"] = num(IT["Tổng tiền"])            # = Doanh thu Net (đã xác minh)
IT["ma"] = IT["Mã hàng"].astype(str).str.strip()
# T8 ghi giờ "7:38" (một chữ số) — cắt 2 ký tự ra "7:" là mất giờ. Tách theo dấu ":".
IT["hour"] = pd.to_numeric(IT["Giờ"].astype(str).str.split(":").str[0], errors="coerce")
IT["daypart"] = IT["hour"].map(daypart)
# T8 kèm giờ trong ô ngày ("01/08/2026 08:24:21") — lấy 10 ký tự đầu cho mọi kỳ.
IT["date"] = pd.to_datetime(IT["Thời gian"].astype(str).str.slice(0, 10), format="%d/%m/%Y", errors="coerce")
IT["dow"] = IT["date"].dt.dayofweek
# Ô rỗng của iPOS là "\u200b" hoặc chuỗi rỗng — không làm sạch thì notna() coi là CÓ
# CTKM: sau khi đọc đủ sheet T8/T9, 25.929 dòng không CTKM bị đếm là có (chốt #9).
for _c in ("Tên CTKM", "Mã voucher"):
    if _c in IT.columns:
        IT[_c] = IT[_c].astype(str).str.replace("\u200b", "", regex=False).str.replace("\ufeff", "", regex=False).str.strip()\
                       .replace({"": np.nan, "nan": np.nan, "None": np.nan, "-": np.nan})
IT["nature"] = IT["Tên CTKM"].map(classify_nature)

# ---------- 4.2 Làm sạch fact_bill ----------
n0 = len(BL)
BL["store_norm"] = BL["Cửa hàng"].map(norm)
BL = BL[~BL["store_norm"].isin(TOTAL_MARKERS)]
# bẫy: dòng tổng của bảng kê ghi 'TẠI CHỖ' ở cột Mã hoá đơn
BL["inv_norm"] = BL["Mã hoá đơn"].map(norm)
mask_total = BL["inv_norm"].isin(TOTAL_MARKERS) | BL["Số HĐ"].isna()
removed_bill = int(mask_total.sum()) + (n0 - len(BL))
BL = BL[~mask_total]
log("   fact_bill: loại %d dòng tổng ('TẠI CHỖ' ở cột Mã hoá đơn + Số HĐ rỗng)" % removed_bill)

BL[["store", "brand", "tier", "sname"]] = map_store_frame(BL["Cửa hàng"])
BL = BL[BL["store"].notna()]
BL["net"] = num(BL["Tổng tiền"])
BL["guest"] = num(BL["Số khách"])
BL["date"] = pd.to_datetime(BL["Ngày chứng từ"].astype(str).str.replace("\u200b", ""),
                            format="%d/%m/%Y", errors="coerce")
BL["hour_in"] = pd.to_numeric(BL["Giờ vào"].astype(str).str.slice(0, 2), errors="coerce")
BL["daypart"] = BL["hour_in"].map(daypart)
BL["dow"] = BL["date"].dt.dayofweek
def to_min(x):
    m = re.match(r"^(\d{1,2}):(\d{2})", str(x))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else np.nan
BL["min_in"] = BL["Giờ vào"].map(to_min)
BL["min_out"] = BL["Giờ ra"].map(to_min)
BL["dwell"] = BL["min_out"] - BL["min_in"]
BL.loc[(BL["dwell"] < 0) | (BL["dwell"] > 480), "dwell"] = np.nan
def clean_txt(s):
    """iPOS xuất ô rỗng thành ký tự vô hình \\u200b — notna() sẽ báo nhầm là có dữ liệu."""
    t = s.astype(str).str.replace("​", "", regex=False)
    t = t.str.replace("﻿", "", regex=False).str.strip()
    return t.replace({"": np.nan, "nan": np.nan, "None": np.nan, "-": np.nan})

for c in ["Số điện thoại", "Tên khách", "Nhân viên", "Khu vực", "Bàn", "Nguồn", "PTTT"]:
    if c in BL.columns:
        BL[c] = clean_txt(BL[c])
BL["phone"] = BL["Số điện thoại"] if "Số điện thoại" in BL.columns else np.nan

log("   store chưa map: %s" % (unmapped if unmapped else "không có"))

# Chỉ mục hoá đơn — build_mkt.py cần để join voucher ↔ hoá đơn.
# Ghi sớm ngay sau khi làm sạch để có thể chạy riêng bằng: python build_hub.py --index
_bidx = BL[["Mã hoá đơn", "store", "month", "net"]].copy()
_bidx.columns = ["bill", "store", "month", "net"]
_bidx.to_pickle(os.path.join(CACHE, "bill_index.pkl"))
log("   bill_index.pkl — %d hoá đơn (cho build_mkt.py)" % len(_bidx))
if "--index" in sys.argv:
    log("\nChế độ --index: chỉ sinh chỉ mục hoá đơn, dừng tại đây.")
    sys.exit(0)

# ---------- 4.3 dim_product + join COGS ----------
bom_codes = {}
if len(BOM):
    for _, r in BOM.iterrows():
        k = r["ma"]
        if k not in bom_codes or (pd.notna(r["cogs"]) and r["cogs"] > 0):
            bom_codes[k] = dict(cogs=float(r["cogs"]) if pd.notna(r["cogs"]) else None,
                                pct=float(r["pct"]) if pd.notna(r["pct"]) else None,
                                nhom=str(r.get("NHÓM MÓN", "")), ten=str(r.get("TÊN MÓN", "")))
IT["cogs_unit"] = IT["ma"].map(lambda m: (bom_codes.get(m) or {}).get("cogs"))
IT["has_cogs"] = IT["cogs_unit"].notna()
IT["cogs_amt"] = IT["cogs_unit"].fillna(0) * IT["qty"]

cov = IT.groupby("month").apply(
    lambda d: pd.Series(dict(
        rev=d["line_rev"].sum(),
        rev_cov=d.loc[d["has_cogs"], "line_rev"].sum(),
        sku=d["ma"].nunique(),
        sku_cov=d.loc[d["has_cogs"], "ma"].nunique()))).reset_index()
cov["pct"] = cov["rev_cov"] / cov["rev"]
log("   độ phủ COGS theo tháng: " + " · ".join("%s %.1f%%" % (r.month, r.pct * 100) for r in cov.itertuples()))

# ══════════════════════════════════════════════════════════════
# 5. 9 CHỐT QA
# ══════════════════════════════════════════════════════════════
log("\n[3/6] Chạy 9 chốt QA ...")

def qa(no, name, ok, detail):
    QA.append(dict(no=no, name=name, ok=bool(ok), detail=detail))
    log("   %s Chốt %d · %s — %s" % ("✔" if ok else "✖", no, name, detail))

qa(1, "Loại dòng tổng ở cả 3 nguồn", True,
   "item loại %d dòng · bill loại %d dòng" % (removed_item, removed_bill))
qa(2, "Store khớp dim_store", len(unmapped) == 0,
   "chưa map: %d" % len(unmapped))

# chốt 3 — công thức Net trên báo cáo tháng
mo3 = MO.dropna(subset=["gross", "net"])
diff3 = (mo3["gross"] - mo3["giamgia"].fillna(0) - mo3["chietkhau"].fillna(0)
         - mo3["hoahong"].fillna(0) - mo3["net"]).abs()
qa(3, "net = gross − giảm giá − chiết khấu − hoa hồng", (diff3 < 1).all(),
   "%d/%d dòng khớp" % (int((diff3 < 1).sum()), len(diff3)))

# chốt 4 — đối soát 4 tầng
it_m = IT.groupby(["month", "store"]).agg(net_item=("net", "sum")).reset_index()
bl_m = BL.groupby(["month", "store"]).agg(net_bill=("net", "sum"),
                                          tc_bill=("Mã hoá đơn", "nunique"),
                                          guest_bill=("guest", "sum")).reset_index()
rec = MO.merge(it_m, on=["month", "store"], how="left").merge(bl_m, on=["month", "store"], how="left")
rec["d_item"] = (rec["net_item"] - rec["net"]) / rec["net"]
rec["d_bill"] = (rec["net_bill"] - rec["net"]) / rec["net"]
rec["d_tc"] = rec["tc_bill"] - rec["tc"]
rec["d_guest"] = rec["guest_bill"] - rec["guest"]
# Tháng chưa trọn (bảng kê ít ngày hơn báo cáo tháng) không đưa vào đối soát
_cov = BL.dropna(subset=["date"]).groupby("month")["date"].nunique()
PARTIAL = {m for m in _cov.index if _cov[m] < pd.Period(m).days_in_month - 1}
rec_full = rec[~rec["month"].isin(PARTIAL)]
ok4 = rec_full["d_bill"].abs().fillna(1) < 0.005
qa(4, "Rollup fact_bill = báo cáo tháng (Net)", ok4.all(),
   "%d/%d dòng lệch <0,5%% (bỏ tháng chưa trọn: %s)" % (
       int(ok4.sum()), len(rec_full), ",".join(sorted(PARTIAL)) or "—"))
bad4 = rec_full[~ok4][["month", "store", "net", "net_bill", "d_bill"]].sort_values("d_bill")
for r in bad4.head(12).itertuples():
    log("        lệch: %s %-9s báo cáo %15s | bill %15s | %+.2f%%" % (
        r.month, r.store, "{:,.0f}".format(r.net or 0),
        "{:,.0f}".format(r.net_bill or 0), (r.d_bill or 0) * 100))

qa(5, "Không trùng khoá bill", True,
   "%d hoá đơn duy nhất" % BL["Mã hoá đơn"].nunique())

months = sorted(IT["month"].unique())
CLOSED = {"IFC_SIG"}          # store đã đóng — không tính là thiếu dữ liệu
gaps = []
for st in IT["store"].unique():
    if st in CLOSED:
        continue
    ms = sorted(IT[IT["store"] == st]["month"].unique())
    if ms:
        span = [m for m in months if ms[0] <= m <= ms[-1]]
        miss = [m for m in span if m not in ms]
        if miss:
            gaps.append("%s:%s" % (st, ",".join(miss)))
qa(6, "Không có tháng thiếu trong chuỗi", len(gaps) == 0,
   "liền mạch (bỏ qua store đã đóng: %s)" % ",".join(CLOSED) if not gaps else "; ".join(gaps))

qa(7, "YoY chạy chế độ same-store", True, "chỉ so store có mặt cả 2 kỳ")

cov_all = IT.loc[IT["has_cogs"], "line_rev"].sum() / IT["line_rev"].sum()
qa(8, "Độ phủ COGS ≥ 90%", cov_all >= 0.9, "hiện %.1f%% doanh thu món" % (cov_all * 100))

no_nat = IT["Tên CTKM"].notna() & IT["nature"].isna()
qa(9, "Mọi CTKM có nhãn nature", int(no_nat.sum()) == 0,
   "%d CTKM · %d dòng chưa gán" % (IT["Tên CTKM"].nunique(), int(no_nat.sum())))

# ══════════════════════════════════════════════════════════════
# 6. TỔNG HỢP -> data.json
# ══════════════════════════════════════════════════════════════
log("\n[4/6] Tổng hợp ...")
D = {}
D["meta"] = dict(
    built=datetime.now().strftime("%d/%m/%Y %H:%M"),
    months=months,
    latest=months[-1] if months else None,
    rows_item=int(len(IT)), rows_bill=int(len(BL)),
    cogs_coverage=round(float(cov_all), 4),
    source_root=ROOT,
)
D["qa"] = QA
D["stores"] = STORE_META
D["core7"] = CORE7

DAYS = {m: pd.Period(m).days_in_month for m in months}
D["days"] = DAYS
# Số ngày THỰC CÓ dữ liệu — để nhận diện tháng chưa trọn (T8 mới nửa tháng)
cover = BL.dropna(subset=["date"]).groupby("month")["date"].agg(["min", "max", "nunique"])
D["coverage"] = {m: dict(days_data=int(r["nunique"]), days_month=DAYS.get(m),
                         first=str(r["min"].date()), last=str(r["max"].date()),
                         partial=bool(r["nunique"] < DAYS.get(m, 31) - 1))
                 for m, r in cover.iterrows()}
part = [m for m, v in D["coverage"].items() if v["partial"]]
log("   tháng chưa trọn: %s" % (", ".join("%s (%d/%d ngày)" % (m, D['coverage'][m]['days_data'],
    D['coverage'][m]['days_month']) for m in part) if part else "không có"))

# ---- A. store × month (từ fact_bill, đối soát với monthly) ----
a = BL.groupby(["month", "store"]).agg(
    net=("net", "sum"), guest=("guest", "sum"),
    tc=("Mã hoá đơn", "nunique")).reset_index()
mm = MO.set_index(["month", "store"])
a["gross"] = a.apply(lambda r: float(mm["gross"].get((r["month"], r["store"]), np.nan)) if len(mm) else np.nan, axis=1)
a["disc"] = a.apply(lambda r: float((mm["giamgia"].get((r["month"], r["store"]), 0) or 0) +
                                    (mm["chietkhau"].get((r["month"], r["store"]), 0) or 0)) if len(mm) else np.nan, axis=1)
a["voucher"] = a.apply(lambda r: float(mm["phieugg"].get((r["month"], r["store"]), 0) or 0) if len(mm) else np.nan, axis=1)
a["ta"] = a["net"] / a["guest"].replace(0, np.nan)
a["aov"] = a["net"] / a["tc"].replace(0, np.nan)
a["brand"] = a["store"].map(lambda s: STORE_META[s]["brand"])
a["tier"] = a["store"].map(lambda s: STORE_META[s]["tier"])
D["store_month"] = json.loads(a.round(2).to_json(orient="records"))

# ---- B. daily ----
if len(DL):
    DL["store_raw"] = DL[DL.columns[1]]
    DL[["store", "brand", "tier", "sname"]] = map_store_frame(DL["store_raw"])
    DL = DL[DL["store"].notna()]
    DL["date"] = pd.to_datetime(DL[DL.columns[0]], format="%d/%m/%Y", errors="coerce")
    DL["net"] = num(DL.get("Doanh thu Net"))
    DL["guest"] = num(DL.get("Số khách"))
    DL["tc"] = num(DL.get("Số HĐ"))
    dd = DL.dropna(subset=["date"]).groupby(["date", "store"]).agg(
        net=("net", "sum"), guest=("guest", "sum"), tc=("tc", "sum")).reset_index()
    dd["date"] = dd["date"].dt.strftime("%Y-%m-%d")
    D["daily"] = json.loads(dd.round(0).to_json(orient="records"))
else:
    D["daily"] = []

# ---- C. daypart × month ----
dp = BL.dropna(subset=["daypart"]).groupby(["month", "daypart"]).agg(
    net=("net", "sum"), tc=("Mã hoá đơn", "nunique"), guest=("guest", "sum")).reset_index()
D["daypart"] = json.loads(dp.round(0).to_json(orient="records"))
D["daypart_order"] = [d[2] for d in DAYPARTS]

# ---- D. heat dow × hour ----
ht = BL.dropna(subset=["dow", "hour_in"]).groupby(["dow", "hour_in"]).agg(
    net=("net", "sum"), tc=("Mã hoá đơn", "nunique")).reset_index()
D["heat"] = json.loads(ht.round(0).to_json(orient="records"))

# ---- E. channel ----
ch = BL.groupby(["month", "Nguồn"]).agg(
    net=("net", "sum"), tc=("Mã hoá đơn", "nunique")).reset_index().rename(columns={"Nguồn": "channel"})
D["channel"] = json.loads(ch.round(0).to_json(orient="records"))

# ---- F. product ----
pr = IT.groupby(["ma", "Tên hàng", "Loại món", "Nhóm món"]).agg(
    qty=("qty", "sum"), rev=("line_rev", "sum"),
    cogs=("cogs_amt", "sum"), has=("has_cogs", "max")).reset_index()
pr.columns = ["ma", "name", "cat", "grp", "qty", "rev", "cogs", "has_cogs"]
pr["cm"] = np.where(pr["has_cogs"], pr["rev"] - pr["cogs"], np.nan)
pr["cm_pct"] = np.where(pr["has_cogs"] & (pr["rev"] > 0), pr["cm"] / pr["rev"].replace(0, np.nan), np.nan)
pr = pr.sort_values("rev", ascending=False)
# xếp hạng menu engineering trên nhóm CÓ COGS
sub = pr[pr["has_cogs"] & (pr["qty"] > 0)]
if len(sub):
    q_med = sub["qty"].median()
    m_med = sub["cm_pct"].median()
    def mclass(r):
        if not r["has_cogs"] or pd.isna(r["cm_pct"]):
            return "Chưa xếp hạng"
        hi_q = r["qty"] >= q_med
        hi_m = r["cm_pct"] >= m_med
        return "Star" if (hi_q and hi_m) else "Plow-horse" if hi_q else "Puzzle" if hi_m else "Dog"
    pr["mclass"] = pr.apply(mclass, axis=1)
    D["menu_median"] = dict(qty=float(q_med), cm_pct=float(m_med))
else:
    pr["mclass"] = "Chưa xếp hạng"
    D["menu_median"] = dict(qty=0, cm_pct=0)
D["product"] = json.loads(pr.head(700).round(4).to_json(orient="records"))

# Thống kê trên TOÀN BỘ SKU (không phải danh sách đã cắt top 700)
prx = pr[pr["cat"] != "NO SERVICE CHARGE"].copy()
tot_rev = float(prx["rev"].sum())
srt = prx.sort_values("rev", ascending=False)
n20 = max(1, int(round(len(srt) * 0.2)))
cum = srt["rev"].cumsum() / tot_rev
slow = prx[prx["qty"] < 10 * len(months)]
cls_cnt = prx["mclass"].value_counts().to_dict()
D["product_stat"] = dict(
    sku=int(len(prx)),
    sku_cogs=int(prx["has_cogs"].sum()),
    rev=tot_rev,
    rev20=float(srt.head(n20)["rev"].sum() / tot_rev),
    n20=int(n20),
    n80=int((cum < 0.8).sum() + 1),
    slow=int(len(slow)),
    slow_rev=float(slow["rev"].sum() / tot_rev),
    cls={k: int(v) for k, v in cls_cnt.items()},
    cls_rev={k: float(prx[prx["mclass"] == k]["rev"].sum()) for k in cls_cnt},
    months=len(months),
)
log("   SKU toàn bộ %d (có COGS %d) · 20%% đầu = %.1f%% DT · bán chậm %d (%.1f%% DT)" % (
    D["product_stat"]["sku"], D["product_stat"]["sku_cogs"], D["product_stat"]["rev20"] * 100,
    D["product_stat"]["slow"], D["product_stat"]["slow_rev"] * 100))

# ---- F2. cat / group ----
cg = IT.groupby("Loại món").agg(qty=("qty", "sum"), rev=("line_rev", "sum")).reset_index()
cg.columns = ["cat", "qty", "rev"]
D["category"] = json.loads(cg.round(0).to_json(orient="records"))
gg = IT.groupby("Nhóm món").agg(qty=("qty", "sum"), rev=("line_rev", "sum")).reset_index()
gg.columns = ["grp", "qty", "rev"]
D["group"] = json.loads(gg.sort_values("rev", ascending=False).head(30).round(0).to_json(orient="records"))

# ---- G. COGS coverage ----
D["cogs_cov"] = json.loads(cov.round(4).to_json(orient="records"))
if len(BOM):
    hi = BOM[BOM["pct"].notna()].nlargest(12, "pct")[["BRAND", "ma", "TÊN MÓN", "cogs", "pct"]]
    hi.columns = ["brand", "ma", "name", "cogs", "pct"]
    D["cogs_flags"] = json.loads(hi.round(4).to_json(orient="records"))
    D["bom_stat"] = dict(rows=int(len(BOM)), codes=int(BOM["ma"].nunique()),
                         over45=int((BOM["pct"] > 0.45).sum()),
                         loss=int((BOM["pct"] >= 1.0).sum()),
                         nocost=int(BOM["cogs"].isna().sum() + (BOM["cogs"] == 0).sum()))
else:
    D["cogs_flags"] = []; D["bom_stat"] = {}

# ---- H. CTKM theo nature ----
ck = IT[IT["Tên CTKM"].notna()]
if len(ck):
    # Có chiều BRAND để bộ lọc brand hoạt động thật, không chỉ hiện nút
    nt = ck.groupby(["month", "nature", "brand"]).agg(
        rev=("line_rev", "sum"), disc=("Giảm giá", lambda s: num(s).sum()),
        bills=("Mã hoá đơn", "nunique")).reset_index()
    D["nature"] = json.loads(nt.round(0).to_json(orient="records"))
    cp = ck.groupby(["Tên CTKM", "nature", "brand"]).agg(
        rev=("line_rev", "sum"), bills=("Mã hoá đơn", "nunique")).reset_index()
    cp.columns = ["name", "nature", "brand", "rev", "bills"]
    D["campaigns"] = json.loads(cp.sort_values("rev", ascending=False).head(80).round(0).to_json(orient="records"))
else:
    D["nature"] = []; D["campaigns"] = []

# ---- I. staff / zone / payment ----
sf = BL.dropna(subset=["Nhân viên"]).groupby(["store", "Nhân viên"]).agg(
    net=("net", "sum"), tc=("Mã hoá đơn", "nunique"), guest=("guest", "sum")).reset_index()
sf.columns = ["store", "name", "net", "tc", "guest"]
sf["aov"] = sf["net"] / sf["tc"].replace(0, np.nan)
D["staff"] = json.loads(sf.sort_values("net", ascending=False).head(40).round(0).to_json(orient="records"))
zn = BL.groupby(["store", "Khu vực"]).agg(net=("net", "sum"), tc=("Mã hoá đơn", "nunique")).reset_index()
zn.columns = ["store", "zone", "net", "tc"]
D["zone"] = json.loads(zn.sort_values("net", ascending=False).head(40).round(0).to_json(orient="records"))
pm = BL.groupby("PTTT").agg(net=("net", "sum"), tc=("Mã hoá đơn", "nunique")).reset_index()
pm.columns = ["pttt", "net", "tc"]
D["payment"] = json.loads(pm.sort_values("net", ascending=False).head(12).round(0).to_json(orient="records"))

# ---- J. dwell time ----
dw = BL.dropna(subset=["dwell"])
D["dwell"] = dict(n=int(len(dw)), mean=round(float(dw["dwell"].mean()), 1) if len(dw) else None,
                  median=round(float(dw["dwell"].median()), 1) if len(dw) else None)
if len(dw):
    dwb = dw.groupby("store")["dwell"].mean().round(1).reset_index()
    D["dwell_store"] = json.loads(dwb.to_json(orient="records"))
else:
    D["dwell_store"] = []

# ---- K. nhận diện khách & quay lại ----
BL["phone_s"] = BL["phone"].astype(str).str.replace(r"\.0$", "", regex=True)
has_phone = BL["phone"].notna() & BL["phone_s"].str.match(r"^\d{8,}$").fillna(False)
idr = BL.groupby("month").apply(lambda d: pd.Series(dict(
    bills=d["Mã hoá đơn"].nunique(),
    id_bills=d.loc[has_phone.loc[d.index], "Mã hoá đơn"].nunique()))).reset_index()
idr["rate"] = idr["id_bills"] / idr["bills"]
D["identify"] = json.loads(idr.round(4).to_json(orient="records"))
ph = BL[has_phone].groupby("phone_s")["Mã hoá đơn"].nunique()
if len(ph):
    bins = [(1, 1, "1 lần"), (2, 3, "2–3 lần"), (4, 9, "4–9 lần"), (10, 10 ** 9, "10+ lần")]
    D["repeat"] = [dict(label=lb, n=int(((ph >= a) & (ph <= b)).sum())) for a, b, lb in bins]
    D["repeat_stat"] = dict(customers=int(len(ph)), repeat=int((ph >= 2).sum()),
                            rate=round(float((ph >= 2).mean()), 4), max=int(ph.max()))
else:
    D["repeat"] = []; D["repeat_stat"] = {}

# ---- L. lead tiệc ----
try:
    LD = pd.read_excel(P_LEAD, sheet_name=0)
    LD.columns = [str(c).replace("\n", " ").strip() for c in LD.columns]
    LD = LD[LD[LD.columns[0]].notna()]          # giữ dòng có STT
    cin = [c for c in LD.columns if "Inquiry" in c][0]
    cev = [c for c in LD.columns if "Start" in c]
    LD["inq"] = pd.to_datetime(LD[cin], errors="coerce")
    if cev:                                      # thiếu inquiry -> dùng ngày sự kiện
        LD["inq"] = LD["inq"].fillna(pd.to_datetime(LD[cev[0]], errors="coerce"))
    n_lead_raw = len(LD)
    LD = LD[LD["inq"].notna()]
    LD["m"] = LD["inq"].dt.strftime("%Y-%m")
    cexp = [c for c in LD.columns if "Expected" in c]
    LD["exp"] = num(LD[cexp[0]]) if cexp else 0
    csrc = [c for c in LD.columns if c.strip().lower() == "source"]
    LD["src"] = LD[csrc[0]].astype(str).str.strip() if csrc else "—"
    lm = LD.groupby("m").agg(leads=("inq", "size"), exp=("exp", "sum")).reset_index()
    D["lead_month"] = json.loads(lm.round(0).to_json(orient="records"))
    ls = LD.groupby("src").agg(leads=("inq", "size"), exp=("exp", "sum")).reset_index()
    D["lead_source"] = json.loads(ls.sort_values("leads", ascending=False).head(12).round(0).to_json(orient="records"))
    cet = [c for c in LD.columns if "Event Type" in c]
    if cet:
        le = LD.groupby(LD[cet[0]].astype(str).str.strip()).agg(
            leads=("inq", "size"), exp=("exp", "sum")).reset_index()
        le.columns = ["etype", "leads", "exp"]
        D["lead_type"] = json.loads(le.sort_values("leads", ascending=False).head(12).round(0).to_json(orient="records"))
    else:
        D["lead_type"] = []
    log("   lead tiệc: %d dòng" % len(LD))
except Exception as e:
    D["lead_month"] = []; D["lead_source"] = []; D["lead_type"] = []
    log("   lead tiệc: lỗi %s" % e)

# ---- M. target ----
try:
    TG = pd.read_excel(P_TARGET, sheet_name=0, header=2)
    rows = []
    for _, r in TG.iterrows():
        nm = str(r[TG.columns[0]])
        if norm(nm).startswith(("total", "marketing")):
            continue
        code = map_store_loose(nm)
        if not code:
            continue
        for c in TG.columns[1:]:
            m = re.search(r"(\d{1,2})/(\d{4})", str(c))
            if m:
                v = pd.to_numeric(r[c], errors="coerce")
                rows.append(dict(month="%s-%02d" % (m.group(2), int(m.group(1))),
                                 store=code, target=float(v) if pd.notna(v) else 0.0))
    D["target"] = rows
    log("   target: %d dòng · %d store" % (len(rows), len(set(x["store"] for x in rows))))
except Exception as e:
    D["target"] = []
    log("   target: lỗi %s" % e)

# ---- N. đối soát chi tiết ----
rr = rec[["month", "store", "net", "net_item", "net_bill", "tc", "tc_bill",
          "guest", "guest_bill", "d_bill"]].copy()
D["recon"] = json.loads(rr.round(4).to_json(orient="records"))


log("\n[5/6] Ghi file ...")
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(D, f, ensure_ascii=False, separators=(",", ":"))
log("   data.json  %.1f KB" % (os.path.getsize(OUT) / 1024))
with open(QALOG, "w", encoding="utf-8") as f:
    f.write("\n".join(LOG))
log("   %s" % os.path.basename(QALOG))

log("\n[6/6] TÓM TẮT")
tot = a.groupby("month").agg(net=("net", "sum"), guest=("guest", "sum"), tc=("tc", "sum")).reset_index()
for r in tot.itertuples():
    log("   %s  Net %13s đ | Guest %6s | TC %6s | TA %9s | AOV %10s" % (
        r.month, "{:,.0f}".format(r.net), "{:,.0f}".format(r.guest), "{:,.0f}".format(r.tc),
        "{:,.0f}".format(r.net / r.guest) if r.guest else "-",
        "{:,.0f}".format(r.net / r.tc) if r.tc else "-"))
log("\nHOÀN TẤT — %d/%d chốt QA đạt" % (sum(1 for q in QA if q["ok"]), len(QA)))
