# -*- coding: utf-8 -*-
"""
NOIRE ANALYTICS HUB — ETL KHỐI MARKETING
========================================
Nạp: Digital Ads (Meta) · Voucher iPOS · Zalo OA · Member đăng ký · Partnership · Pre-Analytics
Xuất: data_mkt.json

Chạy SAU build_hub.py (cần bill_index.pkl để join voucher ↔ hoá đơn):
    python build_hub.py
    python build_mkt.py
    python tools/build_month.py YYYY-MM   (thay cho tools/export_workbooks.py đã gỡ)

Yêu cầu thêm: pip install lxml    (file OA Zalo .xls thật ra là HTML)
"""
import os, re, sys, json, glob, unicodedata, warnings
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

warnings.filterwarnings("ignore")
pd.options.mode.chained_assignment = None

HERE = os.path.dirname(os.path.abspath(__file__))

MARKERS = ("04 Marketing Campaigns", "10 Partnership Analytics", "05 Data Raw")

# Gốc dữ liệu L0 do monthly_lib.pick_l0_root() chọn — MỘT bộ luật cho mọi script.
# Trước 16/09/2026 mỗi file có find_root() riêng với thứ tự ưu tiên riêng, và
# `os.path.join(HERE, "..")` ở đây chỉ lên tới thư mục cha của dự án chứ không tới
# cây HIGHGATE — nên script này và tools/build_month.py chốt trên hai gốc khác nhau.
sys.path.insert(0, os.path.join(HERE, "tools"))
from monthly_lib import L0_ROOT, L0_WHY, l0_dir, store_in_text  # noqa: E402


def find_root():
    return L0_ROOT


ROOT  = find_root()
CACHE = os.environ.get("NOIRE_CACHE") or os.path.join(HERE, "_cache")
OUT   = os.path.join(HERE, "data_mkt.json")
os.makedirs(CACHE, exist_ok=True)

# Mọi đường dẫn nguồn lấy từ sổ đăng ký qua monthly_lib — KHÔNG nối chuỗi thư mục.
from monthly_lib import l0_by_month, l0_dir, l0_latest  # noqa: E402
import pre_analysis  # noqa: E402

D_ADS   = l0_dir("S08_ads_meta")
D_ADS25 = None                               # lịch sử 2025 chưa đưa vào L0_input
# Google Ads trong L0_input xếp theo `Tháng N.YYYY/`; lane này chỉ cần bản mới nhất
# (bảng theo tháng do tools/build_month.py dựng).
_g = l0_by_month("S09_ads_google")
D_GADS  = os.path.dirname(_g[max(_g)]) if _g else None
D_BUDG  = l0_dir("S10_budget")
D_VOU   = l0_dir("S11_voucher")
D_OA    = l0_dir("S12_zalo_oa")
F_MEM   = l0_latest("S13_member")
F_KPI   = l0_latest("S14_crm_kpi")
F_PART  = l0_latest("S15_partnership")
F_PRE3  = pre_analysis.latest_legacy()   # file 6 sheet loại (Q3) — file quý mới hơn không được đè
F_LTO   = l0_latest("S17_lto_actual")

LOG = []
def log(m=""):
    print(m, flush=True); LOG.append(str(m))

def norm(s):
    if s is None: return ""
    s = unicodedata.normalize("NFKC", str(s)).replace("\u200b", "").replace("\ufeff", "")
    return re.sub(r"\s+", " ", s).strip().lower()

def num(s): return pd.to_numeric(s, errors="coerce").fillna(0)

def find_header(path, sheet, *keys, maxrow=12):
    """Dò dòng tiêu đề thật. Nhiều file có dòng trống xen giữa tiêu đề và bảng
    — đọc cứng header=1 sẽ ra toàn cột 'Unnamed'."""
    raw = pd.read_excel(path, sheet_name=sheet, header=None, nrows=maxrow)
    for i, r in raw.iterrows():
        v = [norm(x) for x in r.tolist()]
        if all(any(k == c or k in c for c in v) for k in [norm(x) for x in keys]):
            return i
    return 1

def col(df, *keys, exact=None):
    """Tìm cột theo tên gần đúng — schema Meta đổi giữa các tháng."""
    if exact:
        for c in df.columns:
            if norm(c) == norm(exact): return c
    for k in keys:
        for c in df.columns:
            if norm(k) in norm(c): return c
    return None

log("=" * 74)
log("NOIRE ANALYTICS HUB — ETL MARKETING   %s" % datetime.now().strftime("%d/%m/%Y %H:%M"))
log("ROOT: %s" % ROOT)
log("=" * 74)
D = {"meta": {"built": datetime.now().strftime("%d/%m/%Y %H:%M")}, "qa": []}
QA = D["qa"]
def qa(no, name, ok, detail):
    QA.append(dict(no=no, name=name, ok=bool(ok), detail=detail))
    log("   %s %s — %s" % ("✔" if ok else "✖", name, detail))

# ══════════════════════════════════════════════════════════════
# 1. DIGITAL ADS (Meta)
# ══════════════════════════════════════════════════════════════
log("\n[1/6] Digital Ads (Meta) ...")
BRAND_PAT = [("NJFB", r"\bnjfb\b|\bnfb\b|\bjfb\b|japanese|fusion|crest|\bssv\b"),
             ("NDC", r"\bndc\b|dining|39 ?ntmk|berkley"),
             ("NCB", r"\bncb\b|bistro|the mett|empress|\bskc\b|café|cafe")]
# Chiến dịch tuyển dụng KHÔNG phải marketing thương hiệu — phải tách khỏi Ad Cost Ratio
HR_PAT = r"hr |tuyển dụng|tuyen dung|recruit"
OBJ_PAT = [("Tuyển dụng", HR_PAT),
           ("Lead tiệc", r"\blead\b|tiệc|tiec|\byep\b|booking|party|banquet"),
           ("Tin nhắn", r"message|mess\b|tin nhắn|cuộc trò chuyện|inbox"),
           ("Tương tác", r"engagement|tương tác|post|reel|clip|video"),
           ("Tiếp cận", r"reach|awareness|nhận diện|traffic|lượt xem")]

def tag(txt, pats, default=None):
    n = norm(txt)
    for lab, p in pats:
        if re.search(p, n): return lab
    return default

def load_ads_dir(folder, tagname):
    rows = []
    for f in sorted(glob.glob(os.path.join(folder, "*.xlsx"))):
        if "_content" in f: continue
        base = os.path.basename(f)
        m = re.search(r"(\d{4})-(\d{2})", base)
        mo = "%s-%s" % (m.group(1), m.group(2)) if m else None
        try:
            sh = "Raw Data Report"
            d = pd.read_excel(f, sheet_name=sh, header=2)
        except Exception:
            try: d = pd.read_excel(f, sheet_name=0, header=2)
            except Exception as e:
                log("   bỏ qua %s (%s)" % (base, str(e)[:40])); continue
        d = d.loc[:, ~d.columns.astype(str).str.startswith("Unnamed")]
        cc = col(d, "tên chiến dịch")
        if cc is None: continue
        d = d[d[cc].notna()]
        # BẪY: file export có cả dòng cấp 'campaign' lẫn 'adset', và một số tháng
        # còn tách theo độ tuổi/giới tính. Cộng tất cả sẽ nhân đôi (hoặc hơn) chi tiêu.
        clv = col(d, "cấp độ phân phối")
        if clv is not None:
            n0 = len(d)
            d = d[d[clv].astype(str).str.strip().str.lower() == "campaign"]
            if n0 != len(d):
                log("   %s: lọc %d → %d dòng (chỉ giữ cấp campaign)" % (base[:12], n0, len(d)))
        cs = col(d, "số tiền đã chi tiêu", "amount spent")
        cr = col(d, exact="Kết quả") or col(d, "kết quả")
        crt = col(d, "loại kết quả")
        ci = col(d, "lượt hiển thị", "impression")
        cre = col(d, "người tiếp cận", "reach")
        for _, r in d.iterrows():
            camp = str(r[cc])
            is_hr = bool(re.search(HR_PAT, norm(camp)))
            rows.append(dict(month=mo, src=tagname, campaign=camp, hr=is_hr,
                             brand="Tuyển dụng" if is_hr else tag(camp, BRAND_PAT, "Không xác định"),
                             objective=tag(camp + " " + str(r.get(crt, "")), OBJ_PAT, "Khác"),
                             result_type=str(r.get(crt, "")) if crt else "",
                             result=float(pd.to_numeric(r.get(cr), errors="coerce") or 0) if cr else 0,
                             spend=float(pd.to_numeric(r.get(cs), errors="coerce") or 0) if cs else 0,
                             impr=float(pd.to_numeric(r.get(ci), errors="coerce") or 0) if ci else 0,
                             reach=float(pd.to_numeric(r.get(cre), errors="coerce") or 0) if cre else 0))
    return pd.DataFrame(rows)

ADS = load_ads_dir(D_ADS, "2026") if D_ADS else pd.DataFrame()
if len(ADS):
    log("   %d dòng chiến dịch · %d tháng · tổng chi %s đ" % (
        len(ADS), ADS["month"].nunique(), "{:,.0f}".format(ADS["spend"].sum())))
    am = ADS.groupby("month").agg(spend=("spend", "sum"), reach=("reach", "sum"),
                                  impr=("impr", "sum"), n=("campaign", "nunique")).reset_index()
    D["ads_month"] = json.loads(am.round(0).to_json(orient="records"))
    ab = ADS.groupby(["month", "brand"]).agg(spend=("spend", "sum"), reach=("reach", "sum")).reset_index()
    D["ads_brand"] = json.loads(ab.round(0).to_json(orient="records"))
    ao = ADS.groupby(["month", "objective"]).agg(spend=("spend", "sum"), result=("result", "sum")).reset_index()
    D["ads_objective"] = json.loads(ao.round(0).to_json(orient="records"))
    ac = ADS.groupby(["campaign", "brand", "objective"]).agg(
        spend=("spend", "sum"), result=("result", "sum"), reach=("reach", "sum")).reset_index()
    ac["cpr"] = ac["spend"] / ac["result"].replace(0, np.nan)
    D["ads_campaign"] = json.loads(ac.sort_values("spend", ascending=False).head(40).round(0).to_json(orient="records"))
    unk = ADS[ADS["brand"] == "Không xác định"]["spend"].sum() / max(ADS["spend"].sum(), 1)
    hr = ADS[ADS["hr"]]["spend"].sum()
    qa(10, "Nhận diện brand từ tên chiến dịch", unk < 0.05,
       "%.1f%% chi tiêu chưa gán được brand" % (unk * 100))
    D["ads_stat"] = dict(rows=int(len(ADS)), months=int(ADS["month"].nunique()),
                         spend=float(ADS["spend"].sum()), unknown=float(unk),
                         hr_spend=float(hr), brand_spend=float(ADS["spend"].sum() - hr),
                         platforms=["Meta"], missing=["Google Ads", "Zalo Ads", "TikTok"])
    log("   trong đó tuyển dụng HR %s đ — KHÔNG tính vào Ad Cost Ratio" % "{:,.0f}".format(hr))
else:
    log("   KHÔNG tìm thấy dữ liệu ads")
    D["ads_month"] = []; D["ads_brand"] = []; D["ads_objective"] = []
    D["ads_campaign"] = []; D["ads_stat"] = {}

# ══════════════════════════════════════════════════════════════
# 1b. GOOGLE ADS — Performance Max theo cửa hàng (chạy từ T8/2026)
# ══════════════════════════════════════════════════════════════
log("\n[1b] Google Ads ...")
# Bảng nhận cửa hàng từ tên chiến dịch: cột `alias_re` của sheet dim_store.
try:
    fc = os.path.join(D_GADS, "Báo cáo chiến dịch.xlsx")
    per = pd.read_excel(fc, header=None, nrows=2).iloc[1, 0]
    g = pd.read_excel(fc, header=2)
    cc = col(g, exact="Chiến dịch")
    g = g[g[cc].notna()]
    g = g[~g[cc].astype(str).str.strip().isin(["--"])]
    g = g[~g.iloc[:, 0].astype(str).str.contains("Tổng số", na=False)]
    ccost = col(g, exact="Chi phí") or col(g, "chi phí")
    grows = []
    for _, r in g.iterrows():
        nm = str(r[cc])
        st = store_in_text(nm)
        grows.append(dict(campaign=nm[:56], store=st,
                          brand=(st.split("_")[0] if st else tag(nm, BRAND_PAT, "Không xác định")),
                          status=str(r.get(col(g, "trạng thái chiến dịch"), "")).strip(),
                          budget_day=float(pd.to_numeric(r.get(col(g, exact="Ngân sách")), errors="coerce") or 0),
                          spend=float(pd.to_numeric(r.get(ccost), errors="coerce") or 0),
                          conv=float(pd.to_numeric(r.get(col(g, exact="Lượt chuyển đổi")), errors="coerce") or 0),
                          clicks=float(pd.to_numeric(r.get(col(g, exact="Lượt nhấp")), errors="coerce") or 0),
                          impr=float(pd.to_numeric(r.get(col(g, "số lượt hiển thị")), errors="coerce") or 0)))
    GA = pd.DataFrame(grows)
    GA["cpa"] = GA["spend"] / GA["conv"].replace(0, np.nan)
    D["gads"] = json.loads(GA.round(0).to_json(orient="records"))
    D["gads_stat"] = dict(period=str(per), n=int(len(GA)), spend=float(GA["spend"].sum()),
                          conv=float(GA["conv"].sum()), clicks=float(GA["clicks"].sum()),
                          impr=float(GA["impr"].sum()),
                          paused_spend=float(GA[GA["status"].str.contains("tạm dừng", case=False, na=False)]["spend"].sum()),
                          unmapped=[r["campaign"] for _, r in GA.iterrows() if not r["store"]])
    log("   %d chiến dịch · kỳ %s · chi %s đ · %d lượt chuyển đổi" % (
        len(GA), per, "{:,.0f}".format(GA["spend"].sum()), int(GA["conv"].sum())))
    if D["gads_stat"]["unmapped"]:
        log("   ⚠ chiến dịch chưa map được cửa hàng: %s" % " · ".join(D["gads_stat"]["unmapped"]))
    # kênh hiển thị (Maps / YouTube / Search ...)
    fi = os.path.join(D_GADS, "Báo cáo thông tin chi tiết về cụm từ tìm kiếm.xlsx")
    if os.path.exists(fi):
        gi = pd.read_excel(fi, header=2)
        gi = gi[gi[gi.columns[0]].notna()]
        # BẪY: báo cáo này có xen dòng 'Tổng số: Chiến dịch' — không loại sẽ nhân đôi chi phí
        gi = gi[~gi[gi.columns[1]].astype(str).str.contains("Tổng số", na=False)]
        ch = gi.groupby(gi.columns[0]).agg(
            impr=(col(gi, "số lượt hiển thị"), "sum"), clicks=(col(gi, "lượt nhấp"), "sum"),
            conv=(col(gi, "lượt chuyển đổi"), "sum"), spend=(col(gi, exact="Chi phí"), "sum")).reset_index()
        ch.columns = ["channel", "impr", "clicks", "conv", "spend"]
        D["gads_channel"] = json.loads(ch.sort_values("spend", ascending=False).round(0).to_json(orient="records"))
    else:
        D["gads_channel"] = []
    # cụm từ tìm kiếm
    fs = os.path.join(D_GADS, "Báo cáo cụm từ tìm kiếm.xlsx")
    if os.path.exists(fs):
        gs = pd.read_excel(fs, header=2)
        gs = gs[gs[gs.columns[0]].notna()]
        # BẪY (cùng loại với báo cáo kênh): file có xen các dòng cộng dồn
        # 'Tổng số: Tài khoản' · 'Tổng số: Cụm từ tìm kiếm' … — không loại thì
        # đứng đầu bảng xếp hạng là bốn dòng tổng, và số cụm từ bị đếm dư.
        gs = gs[~gs[gs.columns[0]].astype(str).str.strip().str.startswith("Tổng số")]
        kw = gs.groupby(gs.columns[0]).agg(
            clicks=(col(gs, "lượt nhấp"), "sum"), impr=(col(gs, "số lượt hiển thị"), "sum"),
            spend=(col(gs, exact="Chi phí"), "sum"), conv=(col(gs, "lượt chuyển đổi"), "sum")).reset_index()
        kw.columns = ["kw", "clicks", "impr", "spend", "conv"]
        D["gads_kw"] = json.loads(kw.sort_values("clicks", ascending=False).head(30).round(0).to_json(orient="records"))
        D["gads_kw_stat"] = dict(terms=int(len(kw)), brand_terms=int(kw["kw"].str.contains("noire", case=False, na=False).sum()))
        log("   %d cụm từ tìm kiếm · %d cụm chứa 'noire'" % (len(kw), D["gads_kw_stat"]["brand_terms"]))
    else:
        D["gads_kw"] = []; D["gads_kw_stat"] = {}
except Exception as e:
    D["gads"] = []; D["gads_stat"] = {}; D["gads_channel"] = []; D["gads_kw"] = []
    log("   Google Ads: %s" % str(e)[:80])

# ══════════════════════════════════════════════════════════════
# 1c. NGÂN SÁCH PHÂN BỔ Q3/2026
# ══════════════════════════════════════════════════════════════
log("\n[1c] Ngân sách phân bổ ...")
MTH = {"jul": "2026-07", "aug": "2026-08", "sep": "2026-09"}
try:
    fb = l0_latest("S10_budget")
    xl = pd.ExcelFile(fb)
    B = {}
    # -- Summary
    sm = pd.read_excel(fb, sheet_name="Summary", header=None, nrows=8)
    kv = {}
    for _, r in sm.iterrows():
        k = norm(r.iloc[0]); v = pd.to_numeric(r.iloc[1], errors="coerce")
        if k and pd.notna(v): kv[k] = float(v)
    B["total"] = next((v for k, v in kv.items() if "ngân sách gốc" in k), None)
    B["plan"] = next((v for k, v in kv.items() if "tổng plan" in k), None)
    B["gap"] = next((v for k, v in kv.items() if "vượt" in k or "dư" in k), None)
    # -- Brand
    shb = "Budget Brand" if "Budget Brand" in xl.sheet_names else "Brand MKT"
    bb = pd.read_excel(fb, sheet_name=shb, header=find_header(fb, shb, "brand", "jul plan"))
    bb = bb[bb[bb.columns[0]].notna()]
    B["brand"] = []
    for _, r in bb.iterrows():
        nm = str(r.iloc[0]).strip()
        # Sheet có nhiều khối bên dưới — chỉ lấy đúng 3 brand ở khối đầu
        if norm(nm) not in ("ncb", "ndc", "njfb"): continue
        if any(x["brand"] == nm for x in B["brand"]): continue
        row = dict(brand=nm, budget=float(pd.to_numeric(r.get(col(bb, "budget")), errors="coerce") or 0))
        for k, mo in MTH.items():
            c = col(bb, k + " plan")
            if c is not None: row[mo] = float(pd.to_numeric(r.get(c), errors="coerce") or 0)
        row["plan"] = sum(row.get(m, 0) for m in MTH.values())
        B["brand"].append(row)
    # -- Extra (Tiệc + CRM)
    she = "Budget Booking Tiệc + CRM" if "Budget Booking Tiệc + CRM" in xl.sheet_names else "Extra Budget"
    be = pd.read_excel(fb, sheet_name=she, header=find_header(fb, she, "nhóm ngân sách", "jul"))
    be = be[be[be.columns[0]].notna()]
    B["extra"] = []
    for _, r in be.iterrows():
        nm = str(r.iloc[0]).strip()
        if norm(nm).startswith("total"): break          # hết khối đầu thì dừng
        if not nm or nm == "nan" or not norm(nm).startswith("budget"): continue
        row = dict(name=nm)
        for k, mo in MTH.items():
            c = col(be, k)
            if c is not None: row[mo] = float(pd.to_numeric(r.get(c), errors="coerce") or 0)
        row["plan"] = sum(row.get(m, 0) for m in MTH.values())
        B["extra"].append(row)
    # -- Ads theo kênh (sheet Budget Store Ads)
    B["channel"] = []; B["store_ads"] = []
    if "Budget Store Ads" in xl.sheet_names:
        sa = pd.read_excel(fb, sheet_name="Budget Store Ads", header=None)
        hdr = None
        for i, r in sa.iterrows():
            v = [norm(x) for x in r.tolist()]
            if "kênh" in v and "nguồn ngân sách" in v: hdr = i; continue
            if hdr is not None and i > hdr:
                k = str(r.iloc[0]).strip()
                if norm(k) in ("tổng", "total") or not k or k == "nan":
                    if norm(k) in ("tổng",): break
                    continue
                if "ads" in norm(k):
                    row = dict(channel=k, source=str(r.iloc[1])[:44])
                    for j, mo in enumerate(["2026-07", "2026-08", "2026-09"]):
                        row[mo] = float(pd.to_numeric(r.iloc[2 + j], errors="coerce") or 0)
                    row["plan"] = row["2026-07"] + row["2026-08"] + row["2026-09"]
                    B["channel"].append(row)
        # phân bổ theo cửa hàng
        for i, r in sa.iterrows():
            v = [norm(x) for x in r.tolist()]
            if "cửa hàng" in v and "meta ads" in v:
                for j in range(i + 1, min(i + 12, len(sa))):
                    rr = sa.iloc[j]
                    nm = str(rr.iloc[1]).strip()
                    if not nm or nm == "nan" or norm(nm).startswith("tổng"): break
                    B["store_ads"].append(dict(store=nm, brand=str(rr.iloc[2]).strip(),
                        target=float(pd.to_numeric(rr.iloc[3], errors="coerce") or 0),
                        meta=float(pd.to_numeric(rr.iloc[4], errors="coerce") or 0),
                        google=float(pd.to_numeric(rr.iloc[5], errors="coerce") or 0),
                        zalo=float(pd.to_numeric(rr.iloc[6], errors="coerce") or 0),
                        total=float(pd.to_numeric(rr.iloc[7], errors="coerce") or 0),
                        pct=float(pd.to_numeric(rr.iloc[8], errors="coerce") or 0)))
                break
    B["file"] = os.path.basename(fb)
    B["files_found"] = sorted(os.path.basename(x) for x in glob.glob(os.path.join(D_BUDG, "*.xlsx")))
    D["budget"] = B
    log("   nguồn: %s" % B["file"])
    log("   ngân sách gốc Q3 %s đ · plan %s đ (%.1f%%)" % (
        "{:,.0f}".format(B["total"] or 0), "{:,.0f}".format(B["plan"] or 0),
        (B["plan"] / B["total"] * 100) if B["total"] else 0))
    log("   %d brand · %d nhóm extra · %d dòng kênh ads · %d cửa hàng" % (
        len(B["brand"]), len(B["extra"]), len(B["channel"]), len(B["store_ads"])))
    if len(B["files_found"]) > 1:
        log("   ⚠ thư mục có %d file ngân sách — đang dùng bản đầy đủ nhất" % len(B["files_found"]))
except Exception as e:
    D["budget"] = {}; log("   ngân sách: lỗi %s" % str(e)[:90])

# ══════════════════════════════════════════════════════════════
# 2. VOUCHER iPOS
# ══════════════════════════════════════════════════════════════
log("\n[2/6] Voucher iPOS ...")
def load_vouchers():
    frames = []
    for f in sorted(glob.glob(os.path.join(D_VOU, "*.xlsx"))):
        try: d = pd.read_excel(f, sheet_name=0)
        except Exception: continue
        d["_file"] = os.path.basename(f)
        frames.append(d)
    if not frames: return pd.DataFrame()
    v = pd.concat(frames, ignore_index=True)
    # Nhiều file là bản export lại của cùng campaign -> khử trùng theo mã voucher
    v["code"] = v[col(v, "mã khuyến mãi")].astype(str).str.strip()
    v = v.sort_values("_file").drop_duplicates(subset=["code"], keep="last")
    return v

V = load_vouchers() if D_VOU else pd.DataFrame()
if len(V):
    cprog = col(V, "chương trình"); cstat = col(V, "trạng thái")
    cused = col(V, "ngày sử dụng"); cissue = col(V, "ngày phát hành")
    cstore = col(V, "nhà hàng sử dụng"); cbill = col(V, "tổng hóa đơn", "tổng hoá đơn")
    cdisc = col(V, "tiền giảm giá"); ctxn = col(V, "mã giao dịch")
    V["prog"] = V[cprog].astype(str).str.strip()
    V["cid"] = V["prog"].str.extract(r"^(\d+)")[0]
    V["used"] = V[cstat].astype(str).str.contains("Đã sử dụng", na=False)
    V["used_dt"] = pd.to_datetime(V[cused], errors="coerce")
    V["issue_dt"] = pd.to_datetime(V[cissue], errors="coerce")
    V["bill_val"] = num(V[cbill]); V["disc"] = num(V[cdisc])
    V["txn"] = V[ctxn].astype(str).str.strip()
    V["m"] = V["used_dt"].dt.strftime("%Y-%m")
    # Map nhà hàng sử dụng -> brand, để bộ lọc brand hoạt động ở M8/M9
    VST = [("NJFB", r"japanese|fusion|crest|\bssv\b"), ("NDC", r"dining|minh khai|berkley"),
           ("NCB", r"bistro|lounge|café|cafe|mett|empress|\bskc\b")]
    V["vbrand"] = V[cstore].map(lambda x: next((b for b, p in VST if re.search(p, norm(x))), None) if pd.notna(x) else None)
    log("   %d mã duy nhất · %d chương trình · %d đã dùng (%.2f%%)" % (
        len(V), V["prog"].nunique(), int(V["used"].sum()), V["used"].mean() * 100))
    vp = V.groupby("prog").agg(issued=("code", "size"), used=("used", "sum"),
                               rev=("bill_val", "sum"), disc=("disc", "sum")).reset_index()
    vp["rate"] = vp["used"] / vp["issued"]
    vp.columns = ["prog", "issued", "used", "rev", "disc", "rate"]
    # brand chiếm ưu thế của mỗi chương trình (chỉ tính lượt đã dùng)
    dom = V[V["used"] & V["vbrand"].notna()].groupby(["prog", "vbrand"]).size().reset_index(name="n")
    dom = dom.sort_values("n", ascending=False).drop_duplicates("prog").set_index("prog")["vbrand"]
    vp["brand"] = vp["prog"].map(dom).fillna("Nhiều brand")
    D["voucher_prog"] = json.loads(vp.sort_values("issued", ascending=False).head(30).round(4).to_json(orient="records"))
    vm = V[V["used"]].groupby(["m", "vbrand"], dropna=False).agg(
        used=("code", "size"), rev=("bill_val", "sum"), disc=("disc", "sum")).reset_index()
    vm["vbrand"] = vm["vbrand"].fillna("Không rõ")
    vm.columns = ["m", "brand", "used", "rev", "disc"]
    D["voucher_month"] = json.loads(vm.round(0).to_json(orient="records"))
    D["voucher_stat"] = dict(codes=int(len(V)), progs=int(V["prog"].nunique()),
                             used=int(V["used"].sum()), rate=float(V["used"].mean()),
                             rev=float(V.loc[V["used"], "bill_val"].sum()),
                             disc=float(V.loc[V["used"], "disc"].sum()),
                             files=int(len(glob.glob(os.path.join(D_VOU, "*.xlsx")))))
    # ---- JOIN voucher ↔ hoá đơn ----
    bi = os.path.join(CACHE, "bill_index.pkl")
    if os.path.exists(bi):
        B = pd.read_pickle(bi)
        bset = set(B["bill"].astype(str).str.strip())
        u = V[V["used"] & V["txn"].notna() & (V["txn"] != "") & (V["txn"] != "nan")].copy()
        u["hit"] = u["txn"].isin(bset)
        # Chỉ đo trong PHẠM VI có dữ liệu hoá đơn. Voucher dùng năm 2025 không thể
        # khớp vì bảng kê hoá đơn chỉ bắt đầu từ T1/2026 — đó là giới hạn phạm vi,
        # không phải lỗi chất lượng dữ liệu.
        lo, hi = B["month"].min(), B["month"].max()
        inwin = u[(u["m"] >= lo) & (u["m"] <= hi)]
        r_in = float(inwin["hit"].mean()) if len(inwin) else 0.0
        by_m = inwin.groupby("m").agg(n=("code", "size"), hit=("hit", "sum")).reset_index()
        by_m["rate"] = by_m["hit"] / by_m["n"]
        D["voucher_join"] = dict(used_with_txn=int(len(u)), matched=int(u["hit"].sum()),
                                 rate_all=float(u["hit"].mean()) if len(u) else 0.0,
                                 in_window=int(len(inwin)), in_matched=int(inwin["hit"].sum()),
                                 rate=r_in, window=[lo, hi],
                                 out_window=int(len(u) - len(inwin)),
                                 by_month=json.loads(by_m.round(4).to_json(orient="records")),
                                 total_bills=int(len(B)))
        qa(11, "Voucher khớp hoá đơn (trong phạm vi %s–%s)" % (lo, hi), r_in > 0.9,
           "%d/%d lượt khớp = %.1f%% · %d lượt ngoài phạm vi (dùng năm 2025)" % (
               int(inwin["hit"].sum()), len(inwin), r_in * 100, len(u) - len(inwin)))
    else:
        D["voucher_join"] = {}
        log("   (chưa có bill_index.pkl — chạy build_hub.py trước để đo tỷ lệ khớp)")
else:
    log("   KHÔNG tìm thấy voucher")
    D["voucher_prog"] = []; D["voucher_month"] = []; D["voucher_stat"] = {}; D["voucher_join"] = {}

# ══════════════════════════════════════════════════════════════
# 3. ZALO OA  (.xls thật ra là HTML)
# ══════════════════════════════════════════════════════════════
log("\n[3/6] Zalo OA ...")
def load_oa():
    rows = []
    for f in sorted(glob.glob(os.path.join(D_OA, "OA Zalo T*.xls"))):
        m = re.search(r"T(\d{1,2})\.(\d{4})", os.path.basename(f))
        if not m: continue
        mo = "%s-%02d" % (m.group(2), int(m.group(1)))
        try: t = pd.read_html(f, encoding="utf-8")[0]
        except Exception as e:
            log("   lỗi %s: %s" % (os.path.basename(f), str(e)[:50])); continue
        t.columns = [str(c).strip() for c in t.columns]
        g = lambda *k: col(t, *k)
        rows.append(dict(month=mo,
                         views=float(num(t[g("xem trang")]).sum()) if g("xem trang") else 0,
                         msgs=float(num(t[g("gửi tin nhắn")]).sum()) if g("gửi tin nhắn") else 0,
                         menu=float(num(t[g("tương tác thanh menu")]).sum()) if g("tương tác thanh menu") else 0,
                         follows=float(num(t[g("quan tâm")]).sum()) if g("quan tâm") else 0,
                         content=float(num(t[g("xem nội dung")]).sum()) if g("xem nội dung") else 0,
                         days=int(len(t))))
    return pd.DataFrame(rows)

OA = load_oa() if D_OA else pd.DataFrame()
if len(OA):
    log("   %d tháng · tổng quan tâm mới %s · tin nhắn %s" % (
        len(OA), "{:,.0f}".format(OA["follows"].sum()), "{:,.0f}".format(OA["msgs"].sum())))
    D["oa"] = json.loads(OA.round(0).to_json(orient="records"))
else:
    log("   KHÔNG đọc được OA Zalo"); D["oa"] = []

# ══════════════════════════════════════════════════════════════
# 4. MEMBER ĐĂNG KÝ + KPI
# ══════════════════════════════════════════════════════════════
log("\n[4/6] Member & KPI CRM ...")
try:
    M = pd.read_excel(F_MEM, sheet_name="Actual")
    M.columns = [str(c).strip() for c in M.columns]
    M["date"] = pd.to_datetime(M[col(M, "ngày")], errors="coerce")
    M = M[M["date"].notna()]
    M["month"] = M["date"].dt.strftime("%Y-%m")
    M["mem"] = num(M[col(M, "member đăng ký")])
    M["oaf"] = num(M[col(M, "oa follow")])
    mm = M.groupby("month").agg(member=("mem", "sum"), oa=("oaf", "sum"), days=("date", "nunique")).reset_index()
    # File là biểu mẫu theo dõi tới hết năm — tháng chưa tới toàn số 0, loại ra
    filled = mm[(mm["member"] > 0) | (mm["oa"] > 0)]
    D["member_month"] = json.loads(filled.round(0).to_json(orient="records"))
    D["member_stat"] = dict(months_template=int(len(mm)), months_filled=int(len(filled)),
                            total=float(filled["member"].sum()),
                            blank=[m for m in mm["month"] if m not in set(filled["month"])])
    log("   biểu mẫu %d tháng · CHỈ %d tháng có số · member mới %s" % (
        len(mm), len(filled), "{:,.0f}".format(filled["member"].sum())))
except Exception as e:
    D["member_month"] = []; log("   member: lỗi %s" % str(e)[:70])

try:
    K = pd.read_excel(F_KPI, sheet_name="KPI Target", header=None)
    tgt = []
    MN = dict(jul=7, aug=8, sep=9, oct=10, nov=11, dec=12)
    hdr = None
    for _, r in K.iterrows():
        vals = [norm(x) for x in r.tolist()]
        if "chỉ tiêu" in vals:
            hdr = {i: MN[v] for i, v in enumerate(vals) if v in MN}
            continue
        if hdr and any("member đăng ký" in v or "oa follow" in v for v in vals):
            lab = "member" if any("member" in v for v in vals) else "oa"
            for i, mth in hdr.items():
                v = pd.to_numeric(r.iloc[i], errors="coerce")
                if pd.notna(v): tgt.append(dict(month="2026-%02d" % mth, kpi=lab, target=float(v)))
    D["crm_target"] = tgt
    log("   KPI CRM: %d dòng" % len(tgt))
except Exception as e:
    D["crm_target"] = []; log("   KPI CRM: lỗi %s" % str(e)[:70])

# ══════════════════════════════════════════════════════════════
# 5. PARTNERSHIP
# ══════════════════════════════════════════════════════════════
log("\n[5/6] Đối tác — Partner + Aggregator ...")
# MỘT file chuẩn (tools/partner_template.py định nghĩa cột — đọc lại đúng định nghĩa đó, không
# gõ lại tiêu đề ở đây) + log eVoucher của đối tác. Kết quả hoá đơn POS không nằm ở đây: loader
# ghép với fact_partner theo tháng.
import partner_template as PTPL  # noqa: E402
from monthly_lib import BRAND_OF_STORE, classify_partner, store_code  # noqa: E402


def _cell(v):
    """Ô Excel → giá trị sạch. Ô trống / 'nan' / chữ 'POS tự lấy' (ô xám) → None."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    t = str(v).strip()
    return None if t in ("", "nan", "NaT", "None", "—", "-", "POS tự lấy") else t


def _num(v):
    v = _cell(v)
    if v is None:
        return None
    x = pd.to_numeric(str(v).replace(",", "").replace("%", ""), errors="coerce")
    if pd.isna(x):
        return None
    return float(x) / 100 if str(v).strip().endswith("%") else float(x)


def _month(v):
    v = _cell(v)
    if not v:
        return None
    m = re.match(r"^(\d{4})-(\d{1,2})", v) or re.match(r"^(\d{1,2})[/.-](\d{4})$", v)
    if not m:
        return None
    y, mo = (m.group(1), m.group(2)) if len(m.group(1)) == 4 else (m.group(2), m.group(1))
    return "%s-%02d" % (y, int(mo))


def read_sheet(path, sheet, cols, keep):
    """Đọc một sheet của file chuẩn theo TIÊU ĐỀ đã khai ở partner_template → list[dict] theo khoá."""
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    if sheet not in wb.sheetnames:
        wb.close()
        raise KeyError("thiếu sheet %s" % sheet)
    rows = list(wb[sheet].iter_rows(values_only=True))
    wb.close()
    by_head = {norm(h): k for k, h, *_ in cols}
    idx = {by_head[norm(c)]: j for j, c in enumerate(rows[0] or []) if c and norm(c) in by_head}
    out = []
    for r in rows[1:]:
        d = {k: (r[j] if j < len(r) else None) for k, j in idx.items()}
        if keep(d):
            out.append(d)
    return out


TEXT = {"code", "name", "kind", "brand", "stores", "status", "fee_period", "fee_unit", "sponsor", "source",
        "owner", "note", "prog", "mech", "offer", "condition", "cid", "pos_name", "store", "platform",
        "method", "scenario"}


def clean(d, dates=("start", "end")):
    o = {}
    for k, v in d.items():
        if k in dates:
            o[k] = (_cell(v) or "")[:10] or None
        elif k == "month":
            o[k] = _month(v)
        elif k in TEXT:
            o[k] = _cell(v)
            if k in ("cid",) and o[k]:
                o[k] = re.sub(r"\.0\b", "", o[k])
        else:
            o[k] = _num(v)
    return o


try:
    if not F_PART:
        raise FileNotFoundError("chưa có file %s trong 05_DOI_TAC/01_Danh_Muc" % PTPL.OUT_NAME)
    has = lambda d: bool(_cell(d.get("code")))
    parts = []
    for ch, sheet, cols in (("PARTNER", "1_PARTNER", PTPL.PARTNER_COLS),
                            ("AGGREGATOR", "2_AGGREGATOR", PTPL.AGG_COLS)):
        for d in read_sheet(F_PART, sheet, cols, has):
            p = clean(d)
            p["channel"] = ch
            # Nguồn số: POS tự động · Tự thống kê. Kênh PARTNER luôn đo trên POS (tên CTKM).
            src = norm(p.get("source") or "")
            p["source"] = "TU_THONG_KE" if "thống kê" in src or "thong ke" in src else "POS"
            parts.append(p)
    codes = [p["code"] for p in parts]
    dup = sorted({c for c in codes if codes.count(c) > 1})
    if dup:
        log("   ⚠ Mã ĐT trùng giữa 1_PARTNER và 2_AGGREGATOR: %s — dòng sau bị bỏ" % ", ".join(dup))
        seen = set()
        parts = [p for p in parts if not (p["code"] in seen or seen.add(p["code"]))]
    D["partners"] = parts
    known = {p["code"] for p in parts}

    progs = [clean(d) for d in read_sheet(F_PART, "3_CHUONG_TRINH", PTPL.PROG_COLS,
                                          lambda d: bool(_cell(d.get("prog")) or _cell(d.get("name"))))]
    for i, p in enumerate(progs, 1):
        p["prog"] = p.get("prog") or "%s-%d" % (p.get("code") or "?", i)
    D["partner_program"] = progs

    F_AGG = l0_latest("S19_aggregator")          # 05_DOI_TAC/03_Aggregator — số aggregator theo tháng
    agg = [clean(d) for d in read_sheet(F_AGG, "AGG_THANG", PTPL.AGG_MONTH_COLS, has)] if F_AGG else []
    if not F_AGG:
        log("   ⚠ chưa có file %s trong 05_DOI_TAC/03_Aggregator — Dining City không có số" % PTPL.AGG_NAME)
    # Chỉ giữ dòng CÓ SỐ — dòng xếp sẵn mà chưa điền là "chưa có số", không phải 0.
    VAL = ("bookings", "cancels", "guests", "bills", "net", "disc_noire", "disc_platform", "commission", "fee_other")
    agg = [r for r in agg if r.get("month") and any(r.get(k) is not None for k in VAL)]
    for r in agg:
        r["store"] = store_code(r["store"]) if r.get("store") else None
        r.pop("platform", None)
    D["partner_agg"] = agg

    D["partner_plan"] = [clean(d) for d in read_sheet(F_PART, "4_KE_HOACH", PTPL.PLAN_COLS,
                                                      lambda d: has(d) and _month(d.get("month")))]
    for r in D["partner_plan"]:
        r.pop("name", None)
    lost = sorted({r["code"] for r in progs + agg + D["partner_plan"] if r.get("code") and r["code"] not in known})
    if lost:
        log("   ⚠ Mã ĐT chưa khai ở 1_PARTNER / 2_AGGREGATOR: %s" % ", ".join(lost))
    log("   %s · %d đối tác (%d partner · %d aggregator) · %d chương trình · %d dòng kế hoạch"
        % (os.path.basename(F_PART), len(parts), sum(p["channel"] == "PARTNER" for p in parts),
           sum(p["channel"] == "AGGREGATOR" for p in parts), len(progs), len(D["partner_plan"])))
    log("   %s · %d dòng số aggregator đã điền" % (os.path.basename(F_AGG or "—"), len(agg)))
except Exception as e:
    D["partners"] = []; D["partner_program"] = []; D["partner_agg"] = []; D["partner_plan"] = []
    log("   đối tác: lỗi %s" % str(e)[:120])

# ── Log eVoucher đối tác (S21) — mỗi file là log TOÀN chiến dịch tới ngày xuất ──
# Tháng phát lấy theo `Ngày phát hành mã`, tháng dùng theo `Ngày sử dụng` — KHÔNG theo tên file
# (file T9 chứa cả mã phát 21/07 và lượt dùng T7–T9). Không đưa số điện thoại khách ra ngoài.
try:
    D_EV = l0_dir("S21_evoucher")
    files = sorted(glob.glob(os.path.join(D_EV, "*.xlsx"))) if D_EV else []
    files = [f for f in files if not os.path.basename(f).startswith("~$")]
    frames = []
    for f in files:
        d = pd.read_excel(f, sheet_name=0)
        d["_mtime"] = os.path.getmtime(f)
        d["_file"] = os.path.basename(f)
        frames.append(d)
    rows = []
    if frames:
        E = pd.concat(frames, ignore_index=True)
        E["code"] = E[col(E, "mã khuyến mãi")].astype(str).str.strip()
        E = E.sort_values("_mtime").drop_duplicates("code", keep="last")      # bản xuất mới nhất thắng
        E["prog"] = E[col(E, "chương trình")].astype(str).str.strip()
        E["cid"] = E["prog"].str.extract(r"^(\d+)")[0]
        stat = E[col(E, "trạng thái")].astype(str)
        E["used"] = stat.str.contains("Đã sử dụng", na=False)
        E["locked"] = stat.str.contains("khóa|khoá", case=False, na=False)
        E["issue_m"] = pd.to_datetime(E[col(E, "ngày phát hành")], errors="coerce").dt.strftime("%Y-%m")
        E["use_m"] = pd.to_datetime(E[col(E, "ngày sử dụng")], errors="coerce").dt.strftime("%Y-%m")
        E["expire"] = pd.to_datetime(E[col(E, "ngày mã hết hạn", "hết hạn")], errors="coerce").dt.strftime("%Y-%m-%d")
        E["gross"] = num(E[col(E, "tổng hóa đơn", "tổng hoá đơn")])
        E["disc"] = num(E[col(E, "tiền giảm giá")])
        E["store"] = E[col(E, "nhà hàng sử dụng")].map(lambda x: store_code(x) if isinstance(x, str) and x.strip() else None)
        # Campaign ID → Mã ĐT · brand: khai ở 3_CHUONG_TRINH. Chưa khai thì nhận theo tên chương trình.
        cid_prog = {}
        for p in D.get("partner_program", []):
            for c in re.split(r"[,;| ]+", p.get("cid") or ""):
                if c:
                    cid_prog[c] = p
        for cid, g in E.groupby("cid", dropna=False):
            p = cid_prog.get(str(cid), {})
            name = g["prog"].iloc[0]
            partner = p.get("code") or classify_partner(re.sub(r"^\d+\s*-\s*", "", name))
            used_brands = g.loc[g["used"], "store"].map(lambda s: BRAND_OF_STORE.get(s)).dropna()
            brand = (p.get("brand") if p.get("brand") and len(str(p.get("brand"))) <= 5 else None) \
                or (used_brands.mode().iloc[0] if len(used_brands) else None)
            base = dict(cid=None if pd.isna(cid) else str(cid), campaign=name, partner=partner,
                        brand=brand, expire=g["expire"].dropna().max() if g["expire"].notna().any() else None)
            for m, gi in g.groupby("issue_m"):
                rows.append(dict(base, kind="PHAT", month=m, store=None, issued=int(len(gi)), used=0,
                                 locked=int(gi["locked"].sum()), gross=0.0, disc=0.0))
            for (m, st), gu in g[g["used"]].groupby(["use_m", "store"], dropna=False):
                rows.append(dict(base, kind="DUNG", month=m, store=None if pd.isna(st) else st, issued=0,
                                 used=int(len(gu)), locked=0, gross=float(gu["gross"].sum()),
                                 disc=float(gu["disc"].sum())))
            if not p:
                log("   ⚠ Campaign %s chưa khai ở 3_CHUONG_TRINH — gắn tạm theo tên: %s" % (cid, partner))
        log("   eVoucher: %d file · %d mã · %d chiến dịch · %d lượt dùng"
            % (len(files), len(E), E["cid"].nunique(), int(E["used"].sum())))
    D["partner_voucher"] = rows
except Exception as e:
    D["partner_voucher"] = []
    log("   eVoucher đối tác: lỗi %s" % str(e)[:120])

# ══════════════════════════════════════════════════════════════
# 6. PRE-ANALYTICS (kế hoạch khuyến mãi Q3)
# ══════════════════════════════════════════════════════════════
log("\n[6/6] Pre-Analytics ...")
try:
    # Bộ đọc DUY NHẤT của file Pre-Analysis (dùng chung với M7.1 / M7.2) — không tự đọc sheet Master
    rows = [dict(name=str(x["name"])[:60], brand=x.get("brand") or "", kind=x["kind"],
                 roi=float(x["roi"]) if x.get("roi") is not None else None,
                 nc=float(x.get("net_contrib") or 0))
            for x in (pre_analysis.read(F_PRE3) if F_PRE3 else [])]
    D["pre_q3"] = rows
    neg = [x for x in rows if x["roi"] is not None and x["roi"] < 0]
    D["pre_stat"] = dict(n=len(rows), neg=len(neg),
                         neg_nc=float(sum(x["nc"] for x in neg)),
                         pos_nc=float(sum(x["nc"] for x in rows if x["roi"] is not None and x["roi"] >= 0)))
    log("   Q3: %d chương trình đề xuất · %d chương trình ROI âm" % (len(rows), len(neg)))
except Exception as e:
    D["pre_q3"] = []; D["pre_stat"] = {}; log("   pre-analytics: lỗi %s" % str(e)[:70])

# ══════════════════════════════════════════════════════════════
# 7. QUÉT PHÂN MẢNH HỆ THỐNG — bản đồ tool/dashboard/cache rời rạc
# ══════════════════════════════════════════════════════════════
log("\n[7/7] Quét phân mảnh hệ thống ...")
SKIP = ("__pycache__", "ARCHIVE", "node_modules", ".git")
def walk(root):
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP and not d.startswith(".")]
        yield dp, fns

try:
    tools, dash, jsons, caches = {}, [], {}, []
    for dp, fns in walk(ROOT):
        rel = os.path.relpath(dp, ROOT)
        if rel.startswith("."): continue
        pys = [f for f in fns if f.endswith(".py")]
        if pys:
            n = sum(1 for f in pys)
            loc = 0
            for f in pys:
                try: loc += sum(1 for _ in open(os.path.join(dp, f), encoding="utf-8", errors="ignore"))
                except Exception: pass
            tools[rel] = dict(files=n, loc=loc, names=sorted(pys)[:8])
        for f in fns:
            if f.endswith(".html") and not f.startswith("_"):
                dash.append(dict(path=rel, name=f,
                                 kb=round(os.path.getsize(os.path.join(dp, f)) / 1024)))
            if f.endswith(".json"):
                jsons.setdefault(f, []).append(rel)
        if os.path.basename(dp).lower().startswith(("_cache", "cache")):
            sz = sum(os.path.getsize(os.path.join(dp, f)) for f in fns
                     if os.path.isfile(os.path.join(dp, f)))
            caches.append(dict(path=rel, files=len(fns), mb=round(sz / 1e6, 1)))
    # gộp tool theo "hệ" (thư mục gốc chứa script)
    groups = {}
    for rel, v in tools.items():
        top = rel.split(os.sep)[0]
        g = groups.setdefault(top, dict(root=top, files=0, loc=0, dirs=[]))
        g["files"] += v["files"]; g["loc"] += v["loc"]; g["dirs"].append(rel)
    D["system"] = dict(
        tools=sorted(groups.values(), key=lambda x: -x["loc"]),
        dashboards=sorted(dash, key=lambda x: -x["kb"])[:24],
        dup_json={k: v for k, v in jsons.items() if len(v) > 1},
        caches=sorted(caches, key=lambda x: -x["mb"]),
        cache_mb=round(sum(c["mb"] for c in caches), 1),
        total_py=sum(g["files"] for g in groups.values()),
        total_loc=sum(g["loc"] for g in groups.values()))
    log("   %d hệ thống · %d file .py · %s dòng code · %d dashboard HTML · cache rời rạc %.1f MB" % (
        len(groups), D["system"]["total_py"], "{:,}".format(D["system"]["total_loc"]),
        len(dash), D["system"]["cache_mb"]))
    for k, v in D["system"]["dup_json"].items():
        log("   ⚠ trùng tên '%s' ở %d nơi: %s" % (k, len(v), " · ".join(v)[:90]))
except Exception as e:
    D["system"] = {}; log("   quét hệ thống: lỗi %s" % str(e)[:80])

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(D, f, ensure_ascii=False, separators=(",", ":"))
log("\ndata_mkt.json  %.1f KB" % (os.path.getsize(OUT) / 1024))
qlog = os.path.join(HERE, "qa_log_mkt_%s.txt" % datetime.now().strftime("%Y%m%d_%H%M"))
open(qlog, "w", encoding="utf-8").write("\n".join(LOG))
log("HOÀN TẤT")
