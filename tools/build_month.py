# -*- coding: utf-8 -*-
"""
NOIRE ANALYTICS HUB — DỰNG GÓI SỐ LIỆU MỘT THÁNG TỪ DỮ LIỆU THÔ
================================================================
    python tools/build_month.py 2026-08          dựng một tháng
    python tools/build_month.py 2026-07 2026-08  dựng nhiều tháng
    python tools/build_month.py --all            dựng mọi tháng tìm thấy trong nguồn
    python tools/build_month.py 2026-08 --dry    chỉ in ra, không ghi file

Đầu ra: data_input/monthly/YYYY-MM.xlsx
Sheet nào script dựng được thì GHI ĐÈ; sheet còn lại trong file cũ được GIỮ NGUYÊN,
nên chạy lại không xoá mất phần nhập tay.

NGUỒN ĐỌC (gốc lấy từ biến môi trường NOIRE_ROOT, không có thì suy lên 3 cấp):
  09 Tracking Sales Tool/NOIRE_Tracking_Sales_2026.xlsx   → store_month · daily · coverage · dim_target
  05 Data Raw/3. Digital Ads/Facebook Ads/1. Raw Ads 2026 → ads_month · ads_brand · ads_objective · ads_campaign_detail
  05 Data Raw/3. Digital Ads/Google Ads/Tháng N.YYYY      → ads_google · gads_channel · gads_kw
  05 Data Raw/4. Social Media/Facebook/Tháng N.YYYY       → social_month
  05 Data Raw/2. Data Khách Hàng CRM/…/01. OA Zalo        → oa
  05 Data Raw/2. Data Khách Hàng CRM/…/02. Member Đăng Ký → member
  05 Data Raw/Promotion-AGG/*.xlsx                        → aggregator · budget_nonmedia
  05 Data Raw/10. Booking & Event/*.xlsx                  → booking
  05 Data Raw/Partnership/*.xlsx                          → partner_month
"""
from __future__ import annotations

import glob
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import (  # noqa: E402
    BRAND_OF_STORE, MONTHLY_DIR, ROOT, agg, date_of, days_in_month, month_of, norm,
    read_html_table, read_utf16_csv, read_workbook, store_code, to_num,
    write_workbook,
)
from split_to_monthly import guide_monthly  # noqa: E402

# ══════════════════════════════════════════════════════════════════════
# Gốc dữ liệu thô
# ══════════════════════════════════════════════════════════════════════
def _find_root():
    for cand in [
        os.environ.get("NOIRE_ROOT"),
        os.path.abspath(os.path.join(ROOT, "..", "..", "..")),
        os.path.join(ROOT, "L0_input"),
        r"D:\PROJECT\3. HIGHGATE 5.2026",
    ]:
        if cand and os.path.isdir(os.path.join(cand, "05 Data Raw")):
            return cand
    return None


RAW_ROOT = _find_root()
RAW = os.path.join(RAW_ROOT, "05 Data Raw") if RAW_ROOT else None
TRACKING = os.path.join(RAW_ROOT, "09 Tracking Sales Tool",
                        "NOIRE_Tracking_Sales_2026.xlsx") if RAW_ROOT else None

WARN: list[str] = []


def log(*a):
    print(*a)


def warn(msg):
    WARN.append(msg)
    print(f"      ! {msg}")


def vn_month_dir(base, month):
    """Thư mục kiểu 'Tháng 8.2026'. Chấp nhận cả biến thể có/không số 0 đứng đầu."""
    y, m = month[:4], int(month[5:7])
    for pat in (f"Tháng {m}.{y}", f"Tháng {m:02d}.{y}", f"T{m}.{y}", f"{month}"):
        p = os.path.join(base, pat)
        if os.path.isdir(p):
            return p
    return None


def sheet_rows(path, sheet=None, header_row=1, reset=False):
    """Đọc một sheet thành list[dict]; header_row là dòng chứa tên cột (1-based)."""
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.worksheets[0]
    if reset:
        ws.reset_dimensions()
    rows, header = [], None
    for i, r in enumerate(ws.iter_rows(values_only=True), start=1):
        if i < header_row:
            continue
        if i == header_row:
            header = [str(c).strip() if c is not None else f"_c{j}" for j, c in enumerate(r)]
            continue
        if r is None or not any(c is not None and str(c).strip() for c in r):
            continue
        rows.append({header[j]: r[j] for j in range(min(len(header), len(r)))})
    wb.close()
    return rows


def col(d: dict, *needles, exact=None):
    """Tìm tên cột theo từ khoá đã chuẩn hoá — file export hay đổi hoa/thường và dấu."""
    if exact and exact in d:
        return exact
    keys = list(d.keys())
    for n in needles:
        nn = norm(n)
        for k in keys:
            if nn in norm(k):
                return k
    return None


# ══════════════════════════════════════════════════════════════════════
# 1. TRACKING SALES TOOL → store_month · daily · coverage · dim_target
# ══════════════════════════════════════════════════════════════════════
def read_tracking(month):
    if not TRACKING or not os.path.exists(TRACKING):
        warn("không thấy 09 Tracking Sales Tool — bỏ qua khối doanh thu")
        return {}

    rows = sheet_rows(TRACKING, "Data_Daily", header_row=4)
    daily, unknown = [], set()
    for r in rows:
        d = date_of(r.get("Ngày"))
        if not d or d[:7] != month:
            continue
        code = store_code(r.get("Cửa hàng (export)"))
        if not code:
            unknown.add(str(r.get("Cửa hàng (export)")))
            continue
        daily.append({
            "date": d, "store": code,
            "net": to_num(r.get("Net Sales"), 0),
            "gross": to_num(r.get("Gross Sales"), 0),
            "guest": to_num(r.get("GC (Guest)"), 0),
            "tc": to_num(r.get("TC"), 0),
        })
    if unknown:
        warn(f"cửa hàng chưa khai trong STORE_ALIAS: {', '.join(sorted(unknown))}")
    if not daily:
        warn(f"Tracking Sales không có dòng nào của {month}")
        return {}

    sm = agg(daily, ["store"], sums=["net", "gross", "guest", "tc"])
    store_month = []
    for r in sorted(sm, key=lambda x: x["store"]):
        net, gross = r["net"], r["gross"]
        # Cửa hàng chưa khai trương vẫn có dòng toàn số 0 trong file tracking.
        # Nộp lên sẽ vẽ ra một tháng kinh doanh không có thật và làm hỏng chốt #5.
        if not net and not r["tc"] and not r["guest"]:
            continue
        store_month.append({
            "month": month, "store": r["store"],
            "net": round(net), "guest": round(r["guest"]), "tc": round(r["tc"]),
            "gross": round(gross),
            # disc = gross − net. Đây là ĐỊNH NGHĨA đang dùng của hệ thống, đã đối
            # soát khớp bản do lane POS sinh ra cho T1–T7.
            "disc": round(gross - net) if gross else None,
        })

    dates = sorted({r["date"] for r in daily})
    coverage = [{
        "month": month, "days_data": len(dates), "days_month": days_in_month(month),
        "first": dates[0], "last": dates[-1],
    }]

    out = {
        "store_month": store_month,
        # Ngày cửa hàng đóng / chưa mở: bỏ, đỡ phình file mà không mất thông tin —
        # số ngày có dữ liệu của tháng nằm ở sheet coverage.
        "daily": [{k: v for k, v in r.items() if k in ("date", "store", "net", "guest", "tc")}
                  for r in sorted(daily, key=lambda x: (x["date"], x["store"]))
                  if r["net"] or r["tc"] or r["guest"]],
        "coverage": coverage,
    }
    tgt = read_tracking_target(month)
    if tgt:
        out["dim_target"] = tgt
    return out


def read_tracking_target(month):
    """Bóc dòng `Target` của sheet `By Month`. Chỉ lấy các block ánh xạ được về
    một cửa hàng — block `Others · 9 Stellars + Gateway` gộp ba cửa hàng nên bỏ,
    target của chúng đã khai sẵn ở 01_master.xlsx."""
    try:
        rows = sheet_rows(TRACKING, "By Month", header_row=4)
    except KeyError:
        return []
    ti = f"T{int(month[5:7])}"
    out, cur = [], None
    for r in rows:
        vals = list(r.values())
        grp, store, metric = (vals + [None, None, None])[:3]
        if store and str(store).strip():
            nm = str(store).strip()
            # Bỏ dòng brand ("NCB · Noire Café & Bistro") và dòng gộp nhiều cửa hàng.
            cur = None if (" · " in nm and not nm.startswith("IFC")) or "+" in nm \
                else store_code(nm)
        if cur and metric and norm(metric) == "target":
            v = to_num(r.get(ti))
            if v is not None:
                out.append({"month": month, "store": cur, "target": round(v)})
    return out


# ══════════════════════════════════════════════════════════════════════
# 2. META ADS → ads_month · ads_brand · ads_objective · ads_campaign_detail
# ══════════════════════════════════════════════════════════════════════
BRAND_PAT = [("NJFB", r"\bnjfb\b|\bnfb\b|\bjfb\b|japanese|fusion|crest|\bssv\b"),
             ("NDC", r"\bndc\b|dining|39 ?ntmk|berkley"),
             ("NCB", r"\bncb\b|bistro|the mett|empress|\bskc\b|café|cafe")]
# Chiến dịch tuyển dụng KHÔNG phải marketing thương hiệu — phải tách khỏi Ad Cost Ratio.
HR_PAT = r"hr |tuyển dụng|tuyen dung|recruit"
OBJ_PAT = [("Tuyển dụng", HR_PAT),
           ("Lead tiệc", r"\blead\b|tiệc|tiec|\byep\b|booking|party|banquet"),
           ("Tin nhắn", r"message|mess\b|tin nhắn|cuộc trò chuyện|inbox"),
           ("Tương tác", r"engagement|tương tác|post|reel|clip|video"),
           ("Tiếp cận", r"reach|awareness|nhận diện|traffic|lượt xem")]


def tag(txt, pats, default=None):
    n = norm(txt)
    for lab, p in pats:
        if re.search(p, n):
            return lab
    return default


def read_meta_ads(month):
    folder = os.path.join(RAW, "3. Digital Ads", "Facebook Ads", f"1. Raw Ads {month[:4]}")
    files = [f for f in glob.glob(os.path.join(folder, f"{month}*.xlsx")) if "_content" not in f]
    if not files:
        warn(f"không thấy báo cáo Meta Ads của {month} trong {os.path.basename(folder)}")
        return {}

    camps = []
    for f in sorted(files):
        try:
            rows = sheet_rows(f, "Raw Data Report", header_row=3)
        except KeyError:
            rows = sheet_rows(f, header_row=3)
        if not rows:
            continue
        c0 = rows[0]
        k_camp = col(c0, "tên chiến dịch")
        k_lvl = col(c0, "cấp độ phân phối")
        k_res = col(c0, exact="Kết quả") or col(c0, "kết quả")
        k_rty = col(c0, "loại kết quả")
        k_spd = col(c0, "số tiền đã chi tiêu", "amount spent")
        k_imp = col(c0, "lượt hiển thị", "impression")
        k_rch = col(c0, "người tiếp cận", "reach")
        if not k_camp:
            warn(f"{os.path.basename(f)}: không thấy cột 'Tên chiến dịch'")
            continue

        n_all = 0
        for r in rows:
            if not r.get(k_camp):
                continue
            n_all += 1
            # BẪY: export có cả dòng cấp 'campaign' lẫn 'adset', vài tháng còn tách
            # theo tuổi × giới tính. Cộng tất cả ra gấp 3,5 lần số thật.
            if k_lvl and norm(r.get(k_lvl)) != "campaign":
                continue
            camp = str(r[k_camp]).strip()
            is_hr = bool(re.search(HR_PAT, norm(camp)))
            camps.append({
                "campaign": camp,
                "brand": "Tuyển dụng" if is_hr else tag(camp, BRAND_PAT, "Không xác định"),
                "objective": tag(f"{camp} {r.get(k_rty, '')}", OBJ_PAT, "Khác"),
                "result": to_num(r.get(k_res), 0) if k_res else 0,
                "spend": to_num(r.get(k_spd), 0) if k_spd else 0,
                "impr": to_num(r.get(k_imp), 0) if k_imp else 0,
                "reach": to_num(r.get(k_rch), 0) if k_rch else 0,
            })
        log(f"      Meta: {os.path.basename(f)} — {n_all} dòng → {len(camps)} cấp campaign")

    if not camps:
        return {}

    det = agg(camps, ["campaign", "brand", "objective"], sums=["spend", "result", "reach", "impr"])
    det = sorted(det, key=lambda r: -r["spend"])
    return {
        "ads_month": [{
            "month": month,
            "spend": round(sum(c["spend"] for c in camps)),
            "reach": round(sum(c["reach"] for c in camps)),
            "impr": round(sum(c["impr"] for c in camps)),
            "n": len({c["campaign"] for c in camps}),
        }],
        "ads_brand": [{"month": month, "brand": r["brand"],
                       "spend": round(r["spend"]), "reach": round(r["reach"])}
                      for r in sorted(agg(camps, ["brand"], sums=["spend", "reach"]),
                                      key=lambda x: -x["spend"])],
        "ads_objective": [{"month": month, "objective": r["objective"],
                           "spend": round(r["spend"]), "result": round(r["result"])}
                          for r in sorted(agg(camps, ["objective"], sums=["spend", "result"]),
                                          key=lambda x: -x["spend"])],
        "ads_campaign_detail": [{
            "month": month, "brand": r["brand"], "objective": r["objective"],
            "campaign": r["campaign"], "spend": round(r["spend"]),
            "reach": round(r["reach"]), "impr": round(r["impr"]), "result": round(r["result"]),
        } for r in det],
    }


# ══════════════════════════════════════════════════════════════════════
# 3. GOOGLE ADS → ads_google · gads_channel · gads_kw
# ══════════════════════════════════════════════════════════════════════
# BẪY: mọi báo cáo Google đều xen dòng cộng dồn "Tổng số: …". Không loại thì
# đứng đầu mọi bảng xếp hạng là mấy dòng tổng, và chi phí bị nhân đôi.
IS_TOTAL = re.compile(r"^\s*tổng số\s*:", re.I)

GADS_STORE = [
    (r"skc", "NCB_SKC"), (r"berkley", "NDC_BKL"), (r"crest", "NJFB_CRE"),
    (r"39\s*ntmk", "NDC_NTMK"), (r"\bssv\b", "NJFB_SSV"),
    (r"the\s*mett|\bmett\b", "NCB_MET"), (r"empress", "NCB_ET"),
]


def read_google_ads(month):
    base = os.path.join(RAW, "3. Digital Ads", "Google Ads")
    folder = vn_month_dir(base, month)
    if not folder:
        warn(f"không thấy thư mục Google Ads của {month}")
        return {}
    out = {}

    # ---- chiến dịch ----
    p = os.path.join(folder, "Báo cáo chiến dịch.xlsx")
    if os.path.exists(p):
        rows = sheet_rows(p, header_row=3)
        c0 = rows[0] if rows else {}
        k_st = col(c0, "trạng thái chiến dịch")
        k_nm = col(c0, exact="Chiến dịch") or col(c0, "chiến dịch")
        k_bd = col(c0, "ngân sách")
        k_sp = col(c0, exact="Chi phí") or col(c0, "chi phí")
        k_cv = col(c0, "lượt chuyển đổi")
        k_ck = col(c0, "lượt nhấp")
        k_im = col(c0, "số lượt hiển thị")
        g = []
        for r in rows:
            nm = r.get(k_nm)
            if not nm or IS_TOTAL.match(str(r.get(k_st) or "")) or IS_TOTAL.match(str(nm)):
                continue
            nn = norm(nm)
            st = next((c for pat, c in GADS_STORE if re.search(pat, nn)), None)
            g.append({
                "month": month, "campaign": str(nm).strip(), "store": st,
                "brand": tag(nm, BRAND_PAT, "Không xác định"),
                "status": str(r.get(k_st) or "").strip(),
                "budget_day": to_num(r.get(k_bd)), "spend": to_num(r.get(k_sp), 0),
                "conv": to_num(r.get(k_cv), 0), "clicks": to_num(r.get(k_ck), 0),
                "impr": to_num(r.get(k_im), 0),
            })
        if g:
            out["ads_google"] = sorted(g, key=lambda x: -x["spend"])
            log(f"      Google: {len(g)} chiến dịch · chi {sum(x['spend'] for x in g):,.0f} đ"
                .replace(",", "."))

    # ---- kênh phân phối ----
    p = os.path.join(folder, "Báo cáo thông tin chi tiết về cụm từ tìm kiếm.xlsx")
    if os.path.exists(p):
        rows = sheet_rows(p, header_row=3)
        c0 = rows[0] if rows else {}
        k_ch = col(c0, exact="Kênh") or col(c0, "kênh")
        k_im = col(c0, "số lượt hiển thị")
        k_ck = col(c0, "lượt nhấp")
        k_cv = col(c0, "lượt chuyển đổi")
        k_sp = col(c0, exact="Chi phí") or col(c0, "chi phí")
        ch = [{"channel": str(r[k_ch]).strip(), "impr": to_num(r.get(k_im), 0),
               "clicks": to_num(r.get(k_ck), 0), "conv": to_num(r.get(k_cv), 0),
               "spend": to_num(r.get(k_sp), 0)}
              for r in rows if r.get(k_ch) and not IS_TOTAL.match(str(r[k_ch]))]
        if ch:
            out["gads_channel"] = [
                {"month": month, **r} for r in
                sorted(agg(ch, ["channel"], sums=["impr", "clicks", "conv", "spend"]),
                       key=lambda x: -x["spend"])]

    # ---- cụm từ tìm kiếm ----
    p = os.path.join(folder, "Báo cáo cụm từ tìm kiếm.xlsx")
    if os.path.exists(p):
        rows = sheet_rows(p, header_row=3)
        c0 = rows[0] if rows else {}
        k_kw = col(c0, "cụm từ tìm kiếm")
        k_ck = col(c0, "lượt nhấp")
        k_im = col(c0, "số lượt hiển thị")
        k_sp = col(c0, exact="Chi phí") or col(c0, "chi phí")
        k_cv = col(c0, "lượt chuyển đổi")
        kw = [{"kw": str(r[k_kw]).strip(), "clicks": to_num(r.get(k_ck), 0),
               "impr": to_num(r.get(k_im), 0), "spend": to_num(r.get(k_sp), 0),
               "conv": to_num(r.get(k_cv), 0)}
              for r in rows if r.get(k_kw) and not IS_TOTAL.match(str(r[k_kw]))]
        kw = agg(kw, ["kw"], sums=["clicks", "impr", "spend", "conv"])
        # Giữ cụm từ CÓ HOẠT ĐỘNG. Phần đuôi chỉ có impression bằng 0 chiếm ~90% số
        # dòng mà không nói lên điều gì — bỏ để file tháng không phình lên vài nghìn dòng.
        act = [r for r in kw if r["clicks"] or r["conv"] or r["spend"]]
        if act:
            out["gads_kw"] = [{"month": month, **r}
                              for r in sorted(act, key=lambda x: -x["clicks"])]
            log(f"      Google: {len(act)}/{len(kw)} cụm từ có hoạt động")
    return out


# ══════════════════════════════════════════════════════════════════════
# 4. FANPAGE FACEBOOK → social_month
# ══════════════════════════════════════════════════════════════════════
# Thư mục brand trong export ↔ (brand hệ thống, tên kênh hiển thị)
FB_PAGES = {
    "NCB": ("NCB", "NOIRE Café & Bistro"),
    "NDC": ("NDC", "NOIRE Dining & Cafe"),
    "NJFB": ("NJFB", "NOIRE Japanese Fusion & Bar"),
    # NOIRE Express · Creative Park là fanpage riêng, không thuộc ba brand chính.
    "NEC": ("OTHER", "NOIRE Express · Creative Park"),
}
# Tên file CSV ↔ trường trong social_month. Facebook đặt tên theo tiếng Việt.
FB_METRIC = {
    "người xem": "reach",            # số TÀI KHOẢN tiếp cận
    "lượt xem": "views",             # số LƯỢT xem — khác reach, không cộng chung
    "lượt tương tác": "engage",
    "lượt theo dõi": "follows",
    "lượt truy cập": "profile_views",
    "lượt click vào liên kết": "clicks",
}


def read_facebook_pages(month):
    base = os.path.join(RAW, "4. Social Media", "Facebook")
    folder = vn_month_dir(base, month)
    if not folder:
        warn(f"không thấy thư mục Fanpage của {month}")
        return {}

    rows = []
    for d in sorted(os.listdir(folder)):
        sub = os.path.join(folder, d)
        if not os.path.isdir(sub):
            continue
        brand, page = FB_PAGES.get(d.upper(), ("OTHER", d))
        rec = {"month": month, "platform": "FACEBOOK", "brand": brand, "page": page}
        days = 0
        for f in glob.glob(os.path.join(sub, "*.csv")):
            key = FB_METRIC.get(norm(os.path.splitext(os.path.basename(f))[0]))
            if not key:
                continue
            try:
                _, header, data = read_utf16_csv(f)
            except Exception as e:                                  # noqa: BLE001
                warn(f"{d}/{os.path.basename(f)}: {str(e)[:60]}")
                continue
            vals = [to_num(r[1]) for r in data if len(r) > 1 and to_num(r[1]) is not None]
            if not vals:
                continue
            rec[key] = round(sum(vals))
            days = max(days, len(vals))
        if len(rec) > 4:
            rec["days"] = days
            rows.append(rec)
    if not rows:
        warn(f"thư mục Fanpage {month} không có CSV đọc được")
        return {}
    log(f"      Fanpage: {len(rows)} kênh · "
        f"{sum(r.get('reach', 0) for r in rows):,} tài khoản tiếp cận".replace(",", "."))
    return {"social_month": rows}


# ══════════════════════════════════════════════════════════════════════
# 5. ZALO OA → oa
# ══════════════════════════════════════════════════════════════════════
OA_METRIC = {
    "xem trang thông tin oa": "views",
    "gửi tin nhắn đến oa": "msgs",
    "tương tác thanh menu": "menu",
    "quan tâm": "follows",
    "xem nội dung": "content",
}


def read_oa(month):
    base = os.path.join(RAW, "2. Data Khách Hàng CRM", "02. Data CRM",
                        "04. KPI Actual", "01. OA Zalo")
    want = f"oa zalo t{int(month[5:7])}.{month[:4]}"
    hit = next((f for f in glob.glob(os.path.join(base, "*.xls*"))
                if norm(os.path.basename(f)).startswith(want)), None)
    if not hit:
        warn(f"không thấy file OA Zalo của {month}")
        return {}
    # BẪY: file mang đuôi .xls nhưng ruột là HTML — mở bằng openpyxl sẽ ném lỗi.
    header, data = read_html_table(hit)
    idx = {}
    for j, h in enumerate(header):
        k = OA_METRIC.get(norm(h))
        if k:
            idx[k] = j
    if not idx:
        warn(f"{os.path.basename(hit)}: không nhận ra cột nào")
        return {}
    rec = {"month": month, "days": len(data)}
    for k, j in idx.items():
        rec[k] = round(sum(to_num(r[j], 0) or 0 for r in data if len(r) > j))
    log(f"      Zalo OA: {rec['days']} ngày · quan tâm {rec.get('follows', 0)}")
    return {"oa": [rec]}


# ══════════════════════════════════════════════════════════════════════
# 6. MEMBER ĐĂNG KÝ → member
# ══════════════════════════════════════════════════════════════════════
def read_member(month):
    base = os.path.join(RAW, "2. Data Khách Hàng CRM", "02. Data CRM",
                        "04. KPI Actual", "02. Member Đăng Ký")
    files = [f for f in glob.glob(os.path.join(base, "member_actual*.xlsx"))
             if not os.path.basename(f).startswith("~$")]
    if not files:
        warn("không thấy file member_actual*.xlsx")
        return {}
    path = max(files, key=os.path.getmtime)
    rows = sheet_rows(path, "Actual", header_row=1)
    c0 = rows[0] if rows else {}
    k_d = col(c0, exact="Ngày") or col(c0, "ngày")
    k_m = col(c0, "member đăng ký")
    k_o = col(c0, "oa follow")
    sel = [r for r in rows if (date_of(r.get(k_d)) or "")[:7] == month]
    if not sel:
        warn(f"{os.path.basename(path)}: không có dòng nào của {month}")
        return {}
    def tot(k):
        """Ô trống ≠ 0: cả tháng không ai điền thì trả None, không trả 0.
        Bản trước điền 0 và màn hình CRM hiểu thành 'đã đo, bằng không'."""
        vals = [to_num(r.get(k)) for r in sel]
        vals = [v for v in vals if v is not None]
        return round(sum(vals)) if vals else None

    rec = {"month": month, "member": tot(k_m), "oa": tot(k_o), "days": len(sel)}
    log(f"      Member: {rec['member']} member mới · "
        f"{'—' if rec['oa'] is None else rec['oa']} OA follow · {rec['days']} ngày")
    return {"member": [rec]}


# ══════════════════════════════════════════════════════════════════════
# 7. BÁO CÁO PROMOTION-AGG → aggregator · budget_nonmedia
# ══════════════════════════════════════════════════════════════════════
def _find_section(rows, marker, header_needle):
    """Báo cáo là biểu mẫu trình bày, không phải bảng phẳng: định vị theo CHỮ
    của mục ('C2.', 'C4.') rồi lấy dòng tiêu đề ngay dưới. Bám theo số dòng cứng
    sẽ vỡ ngay lần đầu ai đó chèn thêm một dòng."""
    start = None
    for i, r in enumerate(rows):
        txt = " ".join(str(c) for c in r if c is not None)
        if start is None and norm(txt).startswith(norm(marker)):
            start = i
        elif start is not None and norm(header_needle) in norm(txt):
            return i
    return None


def _grid(path, sheet):
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    g = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()
    return g


AGG_PLATFORM = {
    "grabfood": "GrabFood", "shopeefood": "ShopeeFood", "befood": "beFood",
    "dingning city": "Dining City", "dining city": "Dining City",
    "grab dine out": "Grab Dine Out",
}


def read_promotion(month):
    base = os.path.join(RAW, "Promotion-AGG")
    tag_m = f"t{int(month[5:7])}-{month[:4]}"
    hit = next((f for f in glob.glob(os.path.join(base, "*.xlsx"))
                if tag_m in norm(os.path.basename(f)).replace(".", "-")
                and not os.path.basename(f).startswith("~$")), None)
    if not hit:
        warn(f"không thấy báo cáo Promotion-AGG của {month}")
        return {}
    out = {}

    # ---- C2 · theo nền tảng ----
    try:
        g = _grid(hit, "Aggregator")
    except KeyError:
        g = None
    if g:
        h = _find_section(g, "C2.", "Nền tảng")
        rows = []
        if h is not None:
            head = [norm(c) for c in g[h]]
            def at(r, *needles):
                for n in needles:
                    for j, c in enumerate(head):
                        if c and norm(n) in c:
                            return r[j] if j < len(r) else None
                return None
            cur_platform = None
            for r in g[h + 1:]:
                name = str(r[0]).strip() if r and r[0] else ""
                if not name:
                    continue
                if norm(name) in ("tổng", "tong", "khác", "khac"):
                    if norm(name).startswith("t"):
                        break
                    continue
                plat = AGG_PLATFORM.get(norm(name))
                st = store_code(name)
                if plat:
                    cur_platform = plat
                    # Dòng nền tảng có thể là TỔNG của các dòng cửa hàng ngay dưới.
                    # Giữ lại tạm, cuối vòng mới quyết định lấy dòng nào.
                    rows.append({"_lvl": "platform", "platform": plat, "store": None,
                                 "sales": to_num(at(r, "sales")),
                                 "orders": to_num(at(r, "order")),
                                 "items": to_num(at(r, "số món")),
                                 "guests": to_num(at(r, "khách")),
                                 "discount": to_num(at(r, "discount")),
                                 "commission": to_num(at(r, "commission")),
                                 "ads_spend": to_num(at(r, "ads spend")),
                                 "note": None})
                elif st and cur_platform:
                    rows.append({"_lvl": "store", "platform": cur_platform, "store": st,
                                 "sales": to_num(at(r, "sales")),
                                 "orders": to_num(at(r, "order")),
                                 "items": to_num(at(r, "số món")),
                                 "guests": to_num(at(r, "khách")),
                                 "discount": to_num(at(r, "discount")),
                                 "commission": to_num(at(r, "commission")),
                                 "ads_spend": to_num(at(r, "ads spend")),
                                 "note": None})
        # Nền tảng nào đã có dòng cửa hàng thì BỎ dòng tổng của nền tảng đó,
        # nếu không doanh thu bị đếm hai lần.
        has_store = {r["platform"] for r in rows if r["_lvl"] == "store"}
        keep = [r for r in rows if not (r["_lvl"] == "platform" and r["platform"] in has_store)]
        agg_rows = []
        for r in keep:
            if not r.get("sales"):
                continue
            code = r["store"]
            agg_rows.append({
                "month": month, "platform": r["platform"],
                "brand": (code or "")[:4].rstrip("_") or None,
                "store": code,
                "sales": round(r["sales"]), "orders": round(r["orders"] or 0),
                "items": r["items"], "guests": r["guests"],
                "discount": r["discount"], "commission": r["commission"],
                "ads_spend": r["ads_spend"], "note": r["note"],
            })
        if agg_rows:
            out["aggregator"] = agg_rows
            log(f"      Aggregator: {len(agg_rows)} dòng · "
                f"{sum(r['sales'] for r in agg_rows):,.0f} đ".replace(",", "."))

    # ---- C4 · chi phí ngoài media ----
    try:
        g = _grid(hit, "Budget")
    except KeyError:
        g = None
    if g:
        h = _find_section(g, "C4.", "Hạng mục")
        items = []
        if h is not None:
            for r in g[h + 1:]:
                name = str(r[0]).strip() if r and r[0] else ""
                if not name:
                    continue
                if norm(name).startswith(("tổng", "tong", "c5")):
                    break
                b, a = to_num(r[1] if len(r) > 1 else None), to_num(r[2] if len(r) > 2 else None)
                if b is None and a is None:
                    continue
                items.append({"month": month, "item": name,
                              "budget": round(b) if b is not None else None,
                              "actual": round(a) if a is not None else None})
        if items:
            out["budget_nonmedia"] = items
            log(f"      Chi phí ngoài media: {len(items)} hạng mục")
    return out


# ══════════════════════════════════════════════════════════════════════
# 8. BOOKING TIỆC → booking
# ══════════════════════════════════════════════════════════════════════
def _pax(v):
    n = to_num(re.sub(r"[^\d.,]", "", str(v or "")))
    return n


def read_booking(month):
    base = os.path.join(RAW, "10. Booking & Event")
    files = [f for f in glob.glob(os.path.join(base, "*.xlsx"))
             if not os.path.basename(f).startswith("~$")]
    if not files:
        warn("không thấy file Booking & Event")
        return {}
    path = max(files, key=os.path.getmtime)
    rows = sheet_rows(path, "Sales Info", header_row=1)
    if not rows:
        return {}
    c0 = rows[0]
    k_ev = col(c0, "date event (start)", "date event")
    k_in = col(c0, "input date")
    k_out = col(c0, exact="Outlet")
    k_ty = col(c0, "event type")
    k_src = col(c0, exact="Source")
    k_st = col(c0, exact="Status")
    k_pax = col(c0, "number of guests")
    k_exp = col(c0, "expected revenue")
    k_cls = col(c0, "closed revenue")

    sel = []
    for r in rows:
        # Tháng của một booking = tháng DIỄN RA sự kiện. Lead chưa có ngày sự kiện
        # (đa số dòng Lost) thì rơi về tháng nhập lead — vẫn phải đếm vào phễu.
        m = (date_of(r.get(k_ev)) or "")[:7] or (date_of(r.get(k_in)) or "")[:7]
        if m != month:
            continue
        sel.append({
            "month": month,
            "outlet": str(r.get(k_out) or "").strip() or None,
            "etype": str(r.get(k_ty) or "").strip() or None,
            "source": str(r.get(k_src) or "").strip() or None,
            "status": str(r.get(k_st) or "").strip() or None,
            "leads": 1,
            "guests": _pax(r.get(k_pax)) or 0,
            "exp": to_num(r.get(k_exp), 0) or 0,
            "closed": to_num(r.get(k_cls), 0) or 0,
        })
    if not sel:
        return {}
    out = agg(sel, ["month", "outlet", "etype", "source", "status"],
              sums=["leads", "guests", "exp", "closed"])
    for r in out:
        for k in ("leads", "guests", "exp", "closed"):
            r[k] = round(r[k])
    log(f"      Booking: {len(sel)} lead → {len(out)} dòng gộp · "
        f"kỳ vọng {sum(r['exp'] for r in out):,.0f} đ".replace(",", "."))
    return {"booking": sorted(out, key=lambda r: -r["exp"])}


# ══════════════════════════════════════════════════════════════════════
# 9. PARTNERSHIP → partner_month
# ══════════════════════════════════════════════════════════════════════
def read_partnership(month):
    base = os.path.join(RAW, "Partnership")
    tag_m = f"t{int(month[5:7])}.{month[:4]}"
    files = [f for f in glob.glob(os.path.join(base, "*.xlsx"))
             if tag_m in norm(os.path.basename(f)) and not os.path.basename(f).startswith("~$")]
    if not files:
        return {}
    # File eVoucher chỉ là DANH SÁCH MÃ ĐÃ PHÁT — không có lượt dùng, doanh thu.
    # Vì vậy chỉ điền `issued`; used/rev/disc để TRỐNG (chưa đo được), không điền 0.
    issued = defaultdict(int)
    for f in sorted(files):
        from openpyxl import load_workbook
        wb = load_workbook(f, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        ws.reset_dimensions()
        n = sum(1 for r in ws.iter_rows(min_row=2, values_only=True) if r and r[0])
        wb.close()
        code = "P01" if "techcombank" in norm(f) else None
        if not code:
            continue
        issued[code] += n
        log(f"      Partnership: {os.path.basename(f)[:46]} → {n} mã")
    return {"partner_month": [{"month": month, "code": c, "issued": n}
                              for c, n in sorted(issued.items())]} if issued else {}



# ══════════════════════════════════════════════════════════════════════
# 10. POS THÔ (bảng kê hoá đơn + báo cáo bán hàng) → channel · daypart ·
#     identify · nature · recon
# ══════════════════════════════════════════════════════════════════════
# BẪY 1: dòng TỔNG nằm lẫn trong dữ liệu ở cả ba nguồn. Bảng kê ghi 'TẠI CHỖ' /
#        'MANG VỀ' ngay ở cột Mã hoá đơn. Nạp nhầm là nhân đôi toàn bộ.
TOTAL_MARKERS = {"tổng", "tong", "tổng:", "tại chỗ", "mang về", "grab", "corporate", ""}

# BẪY 2: từ T8/2026 iPOS xuất MỖI CỬA HÀNG MỘT SHEET rồi thêm sheet 'Tất cả cửa hàng'
#        ở cuối. Đọc sheet đầu tiên (như lane cũ vẫn làm) chỉ lấy được MỘT cửa hàng;
#        đọc hết mọi sheet thì cộng đôi. Quy tắc: có sheet tổng thì CHỈ đọc sheet tổng.
ALL_STORE_SHEET = "tất cả cửa hàng"

DAYPARTS = [(0, 10, "Sáng ≤10h"), (11, 14, "Trưa 11-14h"), (15, 17, "Chiều 15-17h"),
            (18, 21, "Tối 18-21h"), (22, 23, "Khuya 22h+")]
DAYPART_ORDER = [lb for _, _, lb in DAYPARTS]

NATURE_RULES = [
    ("INTERNAL", [r"chairman", r"director", r"manager", r"nội bộ", r"noi bo",
                  r"nhân viên", r"staff", r"cbnv"]),
    ("PARTNER", [r"\bskg\b", r"resident", r"techcombank", r"\btcb\b", r"oneu", r"hdbank",
                 r"shinhan", r"grab", r"dining ?city", r"đối tác", r"partner", r"onelife"]),
    ("LOYALTY", [r"hạng ", r"black diamond", r"\bsilver\b", r"\bgold\b", r"thẻ vip",
                 r"the vip", r"thành viên", r"member", r"loyalty", r"tích điểm"]),
]


def classify_nature(name):
    """Bốn nhãn bản chất. Không khớp luật nào mà vẫn có tên CTKM = marketing thật."""
    n = norm(name)
    if not n:
        return None
    for nat, pats in NATURE_RULES:
        if any(re.search(p, n) for p in pats):
            return nat
    return "COMMERCIAL"


def daypart_of(hour):
    if hour is None:
        return None
    for a, b, lb in DAYPARTS:
        if a <= hour <= b:
            return lb
    return "Khuya 22h+"


def _hour(v):
    m = re.match(r"^(\d{1,2})", str(v or "").strip())
    return int(m.group(1)) if m else None


def _clean(v):
    # BẪY 3: ô "rỗng" của iPOS là ký tự vô hình U+200B, không phải chuỗi rỗng.
    return str(v).replace("\u200b", "").replace("\ufeff", "").strip() if v is not None else ""


def read_pos_sheets(path, want):
    """Đọc file POS thành list[dict] theo tên cột CHUẨN HOÁ của ta.

    `want` = {tên_chuẩn: [bí danh, …]} vì iPOS đổi tên cột giữa các kỳ export:
    T7 dùng `Thời gian` / `Mã hoá đơn`, T8 dùng `Ngày` / `Hoá đơn`. Dòng tiêu đề
    cũng lúc ở dòng 1, lúc ở dòng 2 (bên trên là dòng tựa đề) — nên dò theo nội
    dung chứ không đếm dòng."""
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    targets = [n for n in wb.sheetnames if norm(n) == ALL_STORE_SHEET] or list(wb.sheetnames)
    rows, missing = [], None
    for nm in targets:
        ws = wb[nm]
        ws.reset_dimensions()
        hdr = None
        for r in ws.iter_rows(values_only=True):
            if r is None:
                continue
            if hdr is None:
                cand = {norm(_clean(c)): j for j, c in enumerate(r) if c is not None}
                found = {}
                for key, aliases in want.items():
                    for a in aliases:
                        if norm(a) in cand:
                            found[key] = cand[norm(a)]
                            break
                if len(found) >= 2:
                    hdr = found
                    missing = [k for k in want if k not in found]
                continue
            rows.append({k: (r[j] if j < len(r) else None) for k, j in hdr.items()})
    wb.close()
    if missing:
        warn("%s: thiếu cột %s" % (os.path.basename(path)[:44], ", ".join(missing)))
    return rows, targets


def _pos_files(month):
    base = os.path.join(RAW, "1. Sales Revenue")
    n, y = int(month[5:7]), month[:4]
    item = next((f for f in glob.glob(os.path.join(base, "2. Báo Cáo bán hàng *", "*.xlsx"))
                 if re.search(r"tháng\s*%d\.%s" % (n, y), norm(os.path.basename(f)))), None)
    bill = next((f for f in glob.glob(os.path.join(base, "1. Bảng Kê HD *", "*.xlsx"))
                 if re.search(r"t%d\.%s" % (n, y), norm(os.path.basename(f)))), None)
    return item, bill


def read_pos(month, built=None):
    if not RAW:
        return {}
    item_f, bill_f = _pos_files(month)
    out = {}

    # ---------- bảng kê hoá đơn ----------
    if bill_f:
        want = {
            "store": ["Cửa hàng"],
            "inv": ["Mã hoá đơn", "Hoá đơn"],
            "no": ["Số HĐ", "Số hoá đơn"],
            "guest": ["Số khách"],
            "channel": ["Nguồn"],
            "date": ["Ngày chứng từ", "Ngày", "Thời gian"],
            "hour": ["Giờ vào", "Giờ"],
            "net": ["Tổng tiền"],
            "phone": ["Số điện thoại"],
        }
        rows, sheets = read_pos_sheets(bill_f, want)
        bills, seen, unknown = [], set(), set()
        for r in rows:
            inv = _clean(r.get("inv"))
            if norm(inv) in TOTAL_MARKERS or not _clean(r.get("no")):
                continue
            code = store_code(r.get("store"))
            if not code:
                if _clean(r.get("store")):
                    unknown.add(_clean(r.get("store")))
                continue
            d = date_of(_clean(r.get("date")))
            if not d or d[:7] != month or inv in seen:
                continue
            seen.add(inv)
            bills.append({
                "store": code, "tc": 1,
                "net": to_num(r.get("net"), 0) or 0,
                "guest": to_num(r.get("guest"), 0) or 0,
                "channel": _clean(r.get("channel")) or "(không rõ)",
                "daypart": daypart_of(_hour(r.get("hour"))),
                "phone": _clean(r.get("phone")),
            })
        if unknown:
            warn("bảng kê %s: cửa hàng chưa khai — %s" % (month, ", ".join(sorted(unknown))))
        if bills:
            out["channel"] = [
                {"month": month, "channel": r["channel"],
                 "net": round(r["net"]), "tc": round(r["tc"])}
                for r in sorted(agg(bills, ["channel"], sums=["net", "tc"]),
                                key=lambda x: -x["net"])]
            dp = agg([b for b in bills if b["daypart"]], ["daypart"],
                     sums=["net", "tc", "guest"])
            out["daypart"] = [
                {"month": month, "daypart": r["daypart"], "net": round(r["net"]),
                 "tc": round(r["tc"]), "guest": round(r["guest"])}
                for r in sorted(dp, key=lambda x: DAYPART_ORDER.index(x["daypart"]))]
            out["identify"] = [{"month": month, "bills": len(bills),
                                "id_bills": sum(1 for b in bills if b["phone"])}]
            out["_bills_n"] = len(bills)
            out["_bill_store"] = agg(bills, ["store"], sums=["net", "tc", "guest"])
            log("      POS bảng kê: %s hoá đơn · %d sheet"
                % (format(len(bills), ",").replace(",", "."), len(sheets)))
    else:
        warn("không thấy bảng kê hoá đơn của %s" % month)

    # ---------- báo cáo bán hàng (cấp món) ----------
    if item_f:
        want = {
            "store": ["Cửa hàng"],
            "date": ["Ngày", "Thời gian"],
            "net": ["Tổng tiền"],
            "line_rev": ["Thành tiền"],
            "camp": ["Tên CTKM"],
            "disc": ["Giảm giá"],
            "inv": ["Mã hoá đơn", "Hoá đơn"],
        }
        rows, sheets = read_pos_sheets(item_f, want)
        items = []
        for r in rows:
            code = store_code(r.get("store"))
            if not code:
                continue
            d = date_of(_clean(r.get("date")))
            if not d or d[:7] != month:
                continue
            items.append({
                "store": code,
                "net": to_num(r.get("net"), 0) or 0,           # tổng tiền dòng món
                # `rev` của khối CTKM tính trên THÀNH TIỀN (trước phí dịch vụ và VAT) —
                # đây là quy ước đã chốt cho cơ cấu chương trình, khác với Net Sales.
                "rev": to_num(r.get("line_rev"), 0) or 0,
                "disc": to_num(r.get("disc"), 0) or 0,
                "camp": _clean(r.get("camp")), "inv": _clean(r.get("inv"))})
        if items:
            ck = [i for i in items if i["camp"]]
            if ck:
                for i in ck:
                    i["nature"] = classify_nature(i["camp"])
                    i["brand"] = BRAND_OF_STORE.get(i["store"], "OTHER")
                bills_by = defaultdict(set)
                for i in ck:
                    bills_by[(i["nature"], i["brand"])].add(i["inv"])
                out["nature"] = [
                    {"month": month, "nature": r["nature"], "brand": r["brand"],
                     "rev": round(r["rev"]), "disc": round(r["disc"]),
                     "bills": len(bills_by[(r["nature"], r["brand"])])}
                    for r in sorted(agg(ck, ["nature", "brand"], sums=["rev", "disc"]),
                                    key=lambda x: (x["nature"], x["brand"]))]
            out["_item_store"] = agg(items, ["store"], sums=["net"])
            # Số dòng món của tháng đi kèm sheet identify để tab D1 đếm được
            # tổng dòng đã xử lý mà không cần khai cứng ở _stats.
            if out.get("identify"):
                out["identify"][0]["items"] = len(items)
            log("      POS bán hàng: %s dòng món · %d sheet"
                % (format(len(items), ",").replace(",", "."), len(sheets)))
    else:
        warn("không thấy báo cáo bán hàng của %s" % month)

    # ---------- đối soát ba tầng ----------
    out.pop("_bills_n", None)
    sm = {r["store"]: r for r in (built or {}).get("store_month", [])}
    bl = {r["store"]: r for r in out.pop("_bill_store", [])}
    it = {r["store"]: r for r in out.pop("_item_store", [])}
    if sm and (bl or it):
        out["recon"] = [{
            "month": month, "store": c,
            "net": sm[c]["net"], "tc": sm[c]["tc"], "guest": sm[c]["guest"],
            "net_item": round(it[c]["net"]) if c in it else None,
            "net_bill": round(bl[c]["net"]) if c in bl else None,
            "tc_bill": round(bl[c]["tc"]) if c in bl else None,
            "guest_bill": round(bl[c]["guest"]) if c in bl else None,
        } for c in sorted(sm)]
    return out

# ══════════════════════════════════════════════════════════════════════
# CHẠY
# ══════════════════════════════════════════════════════════════════════
BUILDERS = [
    ("Doanh thu · Tracking Sales", read_tracking),
    ("POS · kênh · giờ · CTKM", read_pos),
    ("Meta Ads", read_meta_ads),
    ("Google Ads", read_google_ads),
    ("Fanpage Facebook", read_facebook_pages),
    ("Zalo OA", read_oa),
    ("Member đăng ký", read_member),
    ("Promotion & Aggregator", read_promotion),
    ("Booking tiệc", read_booking),
    ("Partnership", read_partnership),
]


def build(month, dry=False):
    log(f"\n▸ {month}")
    built = {}
    for label, fn in BUILDERS:
        try:
            # read_pos cần store_month đã dựng ở bước trên để lập bảng đối soát.
            got = (fn(month, built) if fn is read_pos else fn(month)) or {}
        except Exception as e:                                      # noqa: BLE001
            warn(f"{label}: {type(e).__name__} — {str(e)[:90]}")
            got = {}
        if got:
            built.update(got)
            log(f"      ✔ {label:<26} {' · '.join(f'{k}({len(v)})' for k, v in got.items())}")
        else:
            log(f"      – {label:<26} chưa có dữ liệu")

    path = os.path.join(MONTHLY_DIR, f"{month}.xlsx")
    keep = read_workbook(path) if os.path.exists(path) else {}
    merged = dict(keep)
    merged.update(built)                       # sheet dựng được thì ghi đè
    order = [k for k in merged if k in built] + [k for k in merged if k not in built]
    merged = {k: merged[k] for k in dict.fromkeys(order)}

    if dry:
        log(f"      (dry) sẽ ghi {len(merged)} sheet vào {os.path.relpath(path, ROOT)}")
        return
    write_workbook(path, merged,
                   title=f"{month} — SỐ LIỆU THÁNG (một tháng một file)",
                   guide_lines=guide_monthly(month))
    n = sum(len(v) for v in merged.values())
    log(f"      → {os.path.relpath(path, ROOT)}  {len(merged)} sheet · {n:,} dòng"
        .replace(",", "."))


def months_available():
    """Tháng nào có mặt ở nguồn doanh thu — dùng cho --all."""
    if not TRACKING or not os.path.exists(TRACKING):
        return []
    ms = set()
    for r in sheet_rows(TRACKING, "Data_Daily", header_row=4):
        d = date_of(r.get("Ngày"))
        if d:
            ms.add(d[:7])
    return sorted(ms)


def main(argv):
    dry = "--dry" in argv
    args = [a for a in argv if not a.startswith("--")]
    log("─" * 74)
    log("NOIRE — dựng gói số liệu tháng từ dữ liệu thô")
    log(f"gốc dữ liệu: {RAW_ROOT or '(KHÔNG TÌM THẤY — đặt biến NOIRE_ROOT)'}")
    log("─" * 74)
    if not RAW_ROOT:
        return 1

    months = months_available() if "--all" in argv else [m for m in args if month_of(m)]
    if not months:
        log("Cách dùng: python tools/build_month.py 2026-08 [2026-07 …] [--all] [--dry]")
        return 1

    os.makedirs(MONTHLY_DIR, exist_ok=True)
    for m in months:
        build(m, dry)

    log("\n" + "─" * 74)
    if WARN:
        log(f"{len(WARN)} cảnh báo:")
        for w in WARN:
            log(f"   ! {w}")
    else:
        log("Không có cảnh báo.")
    log("Bước tiếp theo:  npm run build:data")
    log("─" * 74)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
