# -*- coding: utf-8 -*-
"""
M7.2 · PROMOTION TRACKING — BỘ MÁY TÍNH
======================================
    python tools/campaign.py

Đọc  L0_input/03_MARKETING/07_Campaign_Tracking/Campaign_Tracking_*.xlsx
     (chưa có file thật → đọc _MAU_Campaign_Tracking.xlsx và gắn cờ DEMO)
   + data_input/monthly/*.xlsx  (daily · fact_promo_day · ads_campaign_detail)
Ghi  data_input/03_campaign.xlsx
     dim_campaign · campaign_target · campaign_cost · campaign_control   (bản đã chuẩn hoá)
     campaign_result · campaign_daily · campaign_unmapped · campaign_issue (kết quả)

Phương pháp (docs/modules/M7_2_Promotion_Tracking.md §4) — danh mục ở data_contract.json → $campaign:
  BURST      kỳ nền = 28 ngày ngay trước date_from, TB theo THỨ TRONG TUẦN, cùng cửa hàng
  RECURRING  chỉ so các ngày `recur_dow` với cùng thứ đó trong 28 ngày trước date_from
  ALWAYS_ON  không đo lift (không có kỳ tắt)
  khử mùa vụ: f = thực tế ÷ kỳ vọng của cửa hàng ĐỐI CHỨNG trong cùng kỳ; kỳ vọng × f
  incr = thực tế − kỳ vọng · phân rã ΔTC · ΔAOV (= Δquy mô nhóm + ΔTA) · tương tác
  flow_through = incr × cm% − chi phí · ROI = flow_through ÷ chi phí
  breakeven_lift = chi phí ÷ (kỳ vọng × cm%)
"""
from __future__ import annotations

import fnmatch
import glob
import io
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import (  # noqa: E402
    CONTRACT, DATA_INPUT, MONTHLY_DIR, STORE_META, classify_nature, date_of,
    l0_dir, l0_files, norm, read_workbook, to_num, write_workbook,
)
import pre_analysis  # noqa: E402

C = CONTRACT["$campaign"]
OUT = os.path.join(DATA_INPUT, "03_campaign.xlsx")
SID = "S23_campaign"
CODES = {k: {x["code"] for x in C[k]} for k in
         ("objectives", "levers", "mechanics", "windows", "cadences", "cost_types", "cost_owners", "statuses")}
LEVER_GROUP = {x["code"]: x.get("group") for x in C["levers"]}
LEVER_DRIVER = {x["code"]: x.get("driver") for x in C["levers"]}
NATURES = {x["code"] for x in CONTRACT["$promo_nature"]["labels"]}
DRIVER_LABEL = {"tc": "số hoá đơn (TC)", "party": "quy mô nhóm", "ta": "chi tiêu / khách (TA)"}


def log(*a):
    print(*a, flush=True)


# ─────────────────────────── đọc file khai báo ───────────────────────────
def _d(v):
    s = date_of(v)
    return date.fromisoformat(s) if s else None


def _sheet(path, name):
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        if name not in wb.sheetnames:
            return []
        ws = wb[name]
        ws.reset_dimensions()
        it = ws.iter_rows(values_only=True)
        hdr = None
        rows = []
        for r in it:
            if hdr is None:
                cells = [str(c).strip() if c is not None else "" for c in r]
                if "campaign_id" in cells:
                    hdr = cells
                continue
            if not r or r[0] is None or str(r[0]).strip() == "":
                continue
            rows.append({h: (r[j] if j < len(r) else None) for j, h in enumerate(hdr) if h})
        return rows
    finally:
        wb.close()


def load_input():
    real = [f for f in l0_files(SID)]
    if real:
        path, demo = max(real, key=os.path.getmtime), False
    else:
        d = l0_dir(SID)
        cand = glob.glob(os.path.join(d, "_MAU_Campaign_Tracking*.xlsx")) if d else []
        if not cand:
            return None, None, {}
        path, demo = cand[0], True
    t = {n: _sheet(path, n) for n in ("dim_campaign", "campaign_target", "campaign_cost", "campaign_control",
                                      "campaign_item")}
    return path, demo, t


# ─────────────────────────── dữ liệu thực tế ───────────────────────────
LTO_LINES = []      # fact_lto_line — dòng món LTO gắn tổng hoá đơn (nạp trong load_facts)


def lto_bills(item_rows, stores, pset):
    """Chương trình chạy theo MÓN (LTO): hoá đơn của chương trình = mọi hoá đơn có ít nhất một món đã
    nối ở sheet campaign_item, trong cửa hàng + kỳ chạy. Doanh thu CTKM = Tổng tiền CẢ hoá đơn (gồm món
    khác khách gọi kèm) — cộng theo hoá đơn DUY NHẤT; doanh thu riêng món LTO giữ ở lto_rev."""
    codes = {norm(str(x.get("item_code") or "")).removesuffix("mk") for x in item_rows if x.get("item_code")}
    names = {norm(x.get("item_name")) for x in item_rows if x.get("item_name") and not x.get("item_code")}
    lines = [r for r in LTO_LINES if r["store"] in stores and r["date"] in pset
             and (r["base"] in codes or r["nkey"] in names)]
    bills = {}
    for r in lines:
        k = (r["store"], r["bill"])
        if k not in bills:
            bills[k] = dict(date=r["date"], store=r["store"], bills=1, guests=to_num(r.get("bill_guests"), 0) or 0,
                            gross=to_num(r.get("bill_gross"), 0) or 0, disc=to_num(r.get("bill_disc"), 0) or 0,
                            voucher=to_num(r.get("bill_voucher"), 0) or 0, net=to_num(r.get("bill_net"), 0) or 0,
                            camp=r.get("bill_camp"))
    return list(bills.values()), lines


def load_facts():
    daily = defaultdict(lambda: [0.0, 0.0, 0.0])     # (store, date) → net, tc, guest
    promo, ads = [], []
    for f in sorted(glob.glob(os.path.join(MONTHLY_DIR, "*.xlsx"))):
        wb = read_workbook(f, {"daily", "fact_promo_day", "ads_campaign_detail", "fact_lto_line"})
        for r in wb.get("fact_lto_line", []):
            d = _d(r.get("date"))
            if d:
                LTO_LINES.append(dict(r, date=d, base=norm(r.get("item_base") or r.get("item_code")),
                                      nkey=norm(r.get("item_name"))))
        for r in wb.get("daily", []):
            d = _d(r.get("date"))
            if d:
                x = daily[(r["store"], d)]
                x[0] += to_num(r.get("net"), 0) or 0
                x[1] += to_num(r.get("tc"), 0) or 0
                x[2] += to_num(r.get("guest"), 0) or 0
        for r in wb.get("fact_promo_day", []):
            d = _d(r.get("date"))
            if d:
                promo.append(dict(r, date=d, key=norm(r.get("name_pos"))))
        for r in wb.get("ads_campaign_detail", []):
            ads.append(r)
    days = sorted({d for _, d in daily})
    return daily, promo, ads, (days[0] if days else None), (days[-1] if days else None)


# ─────────────────────────── đo một chương trình ───────────────────────────
def _stores(scope, brand):
    s = str(scope or "").strip()
    if not s or s.upper() == "ALL":
        return sorted(c for c, m in STORE_META.items() if brand in ("ALL", None, "") or m["brand"] == brand)
    return [x.strip().upper() for x in s.split("|") if x.strip()]


def _sum(daily, stores, dates):
    net = tc = guest = 0.0
    for d in dates:
        for s in stores:
            x = daily.get((s, d))
            if x:
                net += x[0]; tc += x[1]; guest += x[2]
    return net, tc, guest


EXCLUDE = set()
for _a, _b, _ in C.get("base_exclude", []):
    _x, _y = date.fromisoformat(_a), date.fromisoformat(_b)
    while _x <= _y:
        EXCLUDE.add(_x)
        _x += timedelta(1)


def base_window(d0, dow=None):
    """28 ngày HỢP LỆ ngay trước d0: bỏ ngày lễ trong $campaign.base_exclude, lùi thêm cho đủ.
    RECURRING: chỉ lấy đúng thứ `dow`, đủ 4 lần."""
    need = 4 if dow is not None else C["base_days"]
    out, d = [], d0 - timedelta(1)
    while len(out) < need and (d0 - d).days <= C["base_days"] * 3:
        if d not in EXCLUDE and (dow is None or d.weekday() == dow):
            out.append(d)
        d -= timedelta(1)
    return sorted(out)


def _mean(v):
    return tuple(sum(r[i] for r in v) / len(v) for i in range(3))


def store_base(daily, s, dates):
    """Kỳ nền MỘT cửa hàng: TB theo thứ, CHỈ trên ngày cửa hàng có mở bán. Ngày đóng cửa
    (không có dòng) không kéo kỳ nền xuống 0 — Crest nghỉ 03–06/04 từng làm lift Highball ảo.
    Thứ nào có < 2 ngày mở bán thì dùng TB mọi ngày của cửa hàng."""
    by, allv = defaultdict(list), []
    for d in dates:
        x = daily.get((s, d))
        if x:
            by[d.weekday()].append(x)
            allv.append(x)
    if not allv:
        return None, 0
    fb = _mean(allv)
    return {w: (_mean(by[w]) if len(by[w]) >= 2 else fb) for w in range(7)}, len(allv)


def expect_actual(daily, stores, base_dates, days):
    """Kỳ vọng và thực tế trên CÙNG tập (cửa hàng, ngày) có mở bán trong kỳ."""
    exp, act, open_days = [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], {}
    for s in stores:
        b, n = store_base(daily, s, base_dates)
        open_days[s] = n
        if not b:
            continue
        for d in days:
            x = daily.get((s, d))
            if not x:
                continue
            for i in range(3):
                exp[i] += b[d.weekday()][i]
                act[i] += x[i]
    return tuple(exp), tuple(act), open_days


def _div(a, b):
    return a / b if b else None


def measure(c, tgt, costs, controls, daily, promo, ads, first, last, items=None):
    cid = c["campaign_id"]
    issues = []
    res = dict(campaign_id=cid, measurable=0, reason=None)
    stores = _stores(c.get("store_scope"), c.get("brand"))
    bad = [s for s in stores if s not in STORE_META]
    if bad:
        issues.append((cid, "store_scope", "LỖI", f"mã cửa hàng không có trong dim_store: {', '.join(bad)}"))
        stores = [s for s in stores if s in STORE_META]
    d0, d1 = _d(c.get("date_from")), _d(c.get("date_to"))
    cad = (c.get("cadence") or "BURST").upper()
    if not d0:
        plan_only = str(c.get("status") or "").upper() == "PLANNED"
        if not plan_only:
            issues.append((cid, "date_from", "LỖI", "thiếu ngày bắt đầu"))
        res["reason"] = "kế hoạch — chưa chạy, chưa có ngày" if plan_only else "thiếu ngày bắt đầu"
        res["label"] = "KE_HOACH" if plan_only else "CHUA_DO"
        return res, [], issues
    end = min(d1 or last, last) if last else d1
    if d1 and d1 < d0:
        issues.append((cid, "date_to", "LỖI", "ngày kết thúc trước ngày bắt đầu"))
    period = [d0 + timedelta(i) for i in range((end - d0).days + 1)] if end and end >= d0 else []
    rdow = to_num(c.get("recur_dow"))
    if cad == "RECURRING":
        if rdow is None:
            issues.append((cid, "recur_dow", "LỖI", "RECURRING phải khai recur_dow (0=Thứ 2 … 6=Chủ nhật)"))
        else:
            period = [d for d in period if d.weekday() == int(rdow)]
    res.update(period_from=str(d0), period_to=str(end) if end else None, days_run=len(period),
               stores="|".join(stores))

    # ── promo chạm (POS) — có hay không đo lift vẫn tính ──
    pats = [norm(p) for p in str(c.get("name_pos") or "").split("|") if p.strip()]
    pset = set(period)
    if items:
        # chương trình LTO: hoá đơn lấy theo MÓN, không theo tên CTKM
        hit, lines = lto_bills(items, stores, pset)
        res.update(revenue_basis="ITEM", lto_qty=round(sum(to_num(r.get("qty"), 0) or 0 for r in lines)),
                   lto_rev=round(sum(to_num(r.get("line_rev"), 0) or 0 for r in lines)),
                   lto_items=len({r["base"] for r in lines}))
        if not lines:
            issues.append((cid, "campaign_item", "CẢNH BÁO",
                           "không thấy món đã nối trên POS trong kỳ + cửa hàng — kiểm tra mã món (nhóm món phải chứa 'LTO')"))
    else:
        res["revenue_basis"] = "CTKM"
        hit = [r for r in promo if r["store"] in stores and r["date"] in pset
               and any(fnmatch.fnmatch(r["key"], p) if "*" in p else r["key"] == p for p in pats)]
    if not items and pats and not any(any(fnmatch.fnmatch(r["key"], p) if "*" in p else r["key"] == p for p in pats)
                                      for r in promo):
        issues.append((cid, "name_pos", "CẢNH BÁO", "không thấy tên CTKM này trên POS — kiểm tra lại chính tả"))
    # Báo cáo lọc theo tháng + brand → phải cắt được số của chương trình theo tháng × cửa hàng.
    # Cộng promo_net cả kỳ chạy rồi lọc "chương trình giao với tháng" là SAI (chương trình chạy
    # T1→T9 bị cộng 9 tháng vào tháng 8; chương trình ALL bị cộng cửa hàng brand khác).
    # dup_*: hoá đơn LTO ĐỒNG THỜI gắn một tên CTKM (không nội bộ) — đã nằm trong số của chương trình
    # CTKM đó, nên khi cộng TỔNG nhiều chương trình phải trừ ra để không đếm một hoá đơn hai lần.
    # Báo cáo đếm MỌI hoá đơn POS gắn chương trình trong kỳ chạy — kể cả chương trình RECURRING
    # (hoá đơn gắn tên rơi vào ngày khác thứ chạy vẫn là hoá đơn của chương trình). Đo lift vẫn dùng `hit`.
    rep_hit = hit
    if cad == "RECURRING" and end and end >= d0:
        full = {d0 + timedelta(i) for i in range((end - d0).days + 1)}
        rep_hit = lto_bills(items, stores, full)[0] if items else             [r for r in promo if r["store"] in stores and r["date"] in full
             and any(fnmatch.fnmatch(r["key"], p) if "*" in p else r["key"] == p for p in pats)]
    split = defaultdict(lambda: [0.0] * 9)
    for r in rep_hit:
        x = split[(f"{r['date']:%Y-%m}", r["store"])]
        for i, k in enumerate(("bills", "guests", "net", "gross", "disc", "voucher")):
            x[i] += to_num(r.get(k), 0) or 0
        if items and r.get("camp") and classify_nature(r["camp"]) != "INTERNAL":
            x[6] += 1
            x[7] += to_num(r.get("guests"), 0) or 0
            x[8] += to_num(r.get("net"), 0) or 0
    res["_split"] = [dict(campaign_id=cid, month=m, store=s, bills=round(v[0]), guests=round(v[1]), net=round(v[2]),
                          gross=round(v[3]), disc=round(v[4]), voucher=round(v[5]),
                          dup_bills=round(v[6]), dup_guests=round(v[7]), dup_net=round(v[8]))
                     for (m, s), v in sorted(split.items())]
    res["promo_bills"] = round(sum(to_num(r.get("bills"), 0) or 0 for r in hit))
    res["promo_guests"] = round(sum(to_num(r.get("guests"), 0) or 0 for r in hit))
    # ĐỊNH NGHĨA DOANH THU CỦA CHƯƠNG TRÌNH — chỉ các hoá đơn gắn tên CTKM (file hoá đơn iPOS):
    #   Tổng tiền = Thanh toán trước giảm giá − Giảm giá − Chiết khấu + Phí DV + Thuế
    #   Phiếu GG KHÔNG bị trừ khỏi Tổng tiền — là phần khách THANH TOÁN bằng phiếu, nằm trong Tổng tiền.
    #   promo_net   = Σ Tổng tiền                       → doanh thu chương trình (gồm VAT)
    #   promo_gross = Σ Thanh toán trước giảm giá       → giá trị menu trước ưu đãi (chưa VAT)
    #   promo_sales = promo_gross × (net ÷ (gross − giảm)) → trước ưu đãi, GỒM VAT — cùng nền "Sales gross" Pre-Analysis
    res["promo_net"] = round(sum(to_num(r.get("net"), 0) or 0 for r in hit))
    res["promo_gross"] = round(sum(to_num(r.get("gross"), 0) or 0 for r in hit))
    share = 1.0
    owner = (c.get("cost_owner") or "NOIRE").upper()
    if owner == "PARTNER":
        share = 0.0
    elif owner == "SPLIT":
        share = to_num(c.get("noire_share"))
        if share is None:
            issues.append((cid, "noire_share", "LỖI", "cost_owner = SPLIT phải khai noire_share (0–1)"))
            share = 1.0
        elif share > 1:
            share /= 100
    res["promo_disc"] = round(sum(to_num(r.get("disc"), 0) or 0 for r in hit))
    res["promo_voucher"] = round(sum(to_num(r.get("voucher"), 0) or 0 for r in hit))
    res["noire_share"] = share
    res["cost_discount"] = round(sum(to_num(r.get("disc"), 0) or 0 for r in hit) * share)
    res["cost_voucher"] = round(sum(to_num(r.get("voucher"), 0) or 0 for r in hit) * share)

    manual, planned_used = 0.0, []
    for k in costs:
        if k["cost_type"] in ("DISCOUNT", "VOUCHER"):
            continue
        a, p = to_num(k.get("actual")), to_num(k.get("planned"))
        if a is not None:
            manual += a
        elif p is not None:
            manual += p
            planned_used.append(k["cost_type"])
    res["cost_manual"] = round(manual)
    res["cost_planned_used"] = ", ".join(planned_used) or None
    ads_auto = 0.0
    am = [norm(x) for x in re.split(r"\|", str(c.get("ads_match") or "")) if x.strip()]
    if am and period:
        pm = defaultdict(int)
        for d in period:
            pm[f"{d:%Y-%m}"] += 1
        for r in ads:
            m = str(r.get("month"))
            if m in pm and any(fnmatch.fnmatch(norm(r.get("campaign")), p) if "*" in p else norm(r.get("campaign")) == p for p in am):
                y, mo = int(m[:4]), int(m[5:7])
                dim = ((date(y + (mo == 12), 1 if mo == 12 else mo + 1, 1)) - date(y, mo, 1)).days
                ads_auto += (to_num(r.get("spend"), 0) or 0) * min(1, pm[m] / dim)
    res["cost_ads_auto"] = round(ads_auto)
    total = res["cost_discount"] + res["cost_voucher"] + manual + ads_auto
    res["cost_total"] = round(total)

    # ── có đo được lift không ──
    dow = int(rdow) if (cad == "RECURRING" and rdow is not None) else None
    base_dates = base_window(d0, dow)
    reason = None
    if cad == "ALWAYS_ON":
        reason = "chạy liên tục — chỉ đo được lift khi có kỳ tắt chương trình"
    elif not stores:
        reason = "chưa khai store_scope hợp lệ"
    elif not period:
        reason = "chưa tới ngày chạy hoặc chưa có số của kỳ chạy"
    elif not first or not base_dates or base_dates[0] < first:
        bd = base_dates[0] if base_dates else d0
        reason = ("kỳ nền (%s) nằm trước ngày có dữ liệu (%s) — chương trình chạy từ trước khi hệ thống "
                  "có số; cần một tuần TẮT chương trình hoặc so với cửa hàng đối chứng"
                  % (bd.strftime("%d/%m/%Y"), first.strftime("%d/%m/%Y") if first else "—"))
    res["target_verified"] = None
    if tgt:
        sub = _d(tgt.get("submitted"))
        res["target_verified"] = 1 if (sub and sub <= d0) else 0
        if sub and sub > d0:
            issues.append((cid, "submitted", "CẢNH BÁO", "target nộp SAU ngày bắt đầu — không dùng để kết luận ĐẠT"))
    cm = to_num((tgt or {}).get("cm_pct"))
    cm = (cm / 100 if cm and cm > 1 else cm) or C["default_cm_pct"]
    res["cm_pct"] = cm

    series = []
    if not reason:
        exp, act, open_days = expect_actual(daily, stores, base_dates, period)
        need_days = C["min_open_days_base"] if dow is None else 3
        thin = [st for st, n in open_days.items() if n < need_days]
        if thin:
            reason = ("cửa hàng mới / chưa đủ kỳ nền (%s) — cần ≥ %d ngày mở bán trong kỳ nền trước khi chạy"
                      % (", ".join("%s %d ngày" % (st, open_days[st]) for st in thin), need_days))
    if reason:
        res["reason"] = reason
        res["label"] = "CHUA_DO"
        return res, series, issues

    # Cửa hàng mở chưa lâu: doanh thu TỰ tăng theo đà mở mới, lift bị thổi lên. Không chặn
    # (vẫn đo), nhưng phải nói ra — Crest mở T4, Highball T5 báo +42% phần lớn là đà mở mới.
    ramp = []
    for st in stores:
        fd = min((d for (x, d) in daily if x == st), default=None)
        if fd and (d0 - fd).days < C.get("ramp_days", 90):
            ramp.append("%s (có số từ %s)" % (st, fd.strftime("%d/%m")))
    if ramp:
        issues.append((cid, "store_scope", "CẢNH BÁO",
                       "cửa hàng mới mở < %d ngày: %s — doanh thu đang tự tăng theo đà mở mới, lift có thể bị THỔI PHỒNG"
                       % (C.get("ramp_days", 90), ", ".join(ramp))))
        res["ramp_warning"] = 1

    # đối chứng: (1) khai tay (2) cửa hàng chính CÙNG brand ngoài phạm vi (3) cửa hàng chính
    # brand KHÁC — xu hướng toàn chuỗi. Cửa hàng đối chứng phải đủ kỳ nền.
    def ok_ctrl(k):
        return k not in stores and store_base(daily, k, base_dates)[1] >= C["min_open_days_base"]

    brand = STORE_META[stores[0]]["brand"]
    core = [k for k, m in STORE_META.items() if m["tier"] in ("core", "flagship")]
    ctrl, ctrl_kind = [x.upper() for x in controls if x], "khai tay"
    if not ctrl:
        ctrl, ctrl_kind = [k for k in core if STORE_META[k]["brand"] == brand and ok_ctrl(k)], "cùng brand"
    if not ctrl:
        ctrl, ctrl_kind = [k for k in core if STORE_META[k]["brand"] != brand and ok_ctrl(k)], "khác brand"
        if ctrl:
            issues.append((cid, "control", "CẢNH BÁO",
                           "không còn cửa hàng cùng brand để đối chứng — dùng xu hướng các brand khác"))
    f = 1.0
    if ctrl:
        ce, ca, _ = expect_actual(daily, ctrl, base_dates, period)
        if ce[0]:
            f = ca[0] / ce[0]
            lo, hi = C["control_factor_range"]
            if not lo <= f <= hi:
                issues.append((cid, "control", "CẢNH BÁO", "hệ số mùa vụ %.2f bất thường — không dùng, giữ 1,00" % f))
                f = 1.0
    else:
        issues.append((cid, "control", "CẢNH BÁO", "không có cửa hàng đối chứng — lift chưa khử mùa vụ"))
    exp = tuple(x * f for x in exp)
    res.update(control_stores=("%s (%s)" % ("|".join(ctrl), ctrl_kind)) if ctrl else None,
               control_factor=round(f, 4), base_from=str(base_dates[0]), base_to=str(base_dates[-1]),
               act_net=round(act[0]), act_tc=round(act[1]), act_guest=round(act[2]),
               exp_net=round(exp[0]), exp_tc=round(exp[1]), exp_guest=round(exp[2]), measurable=1)
    incr = act[0] - exp[0]
    res["incr_net"] = round(incr)
    res["lift_pct"] = _div(incr, exp[0])

    # phân rã: net = TC × AOV ; AOV = pax × TA
    tce, tca = exp[1], act[1]
    aove, aova = _div(exp[0], tce), _div(act[0], tca)
    paxe, paxa = _div(exp[2], tce), _div(act[2], tca)
    tae, taa = _div(exp[0], exp[2]), _div(act[0], act[2])
    if None not in (aove, aova, paxe, paxa, tae, taa):
        d_tc = (tca - tce) * aove
        d_aov = tce * (aova - aove)
        d_party = (paxa - paxe) * tae * tce
        d_ta = paxe * (taa - tae) * tce
        res.update(d_tc=round(d_tc), d_aov=round(d_aov), d_party=round(d_party), d_ta=round(d_ta),
                   d_mix=round(incr - d_tc - d_aov))
        drv = max((("tc", d_tc), ("party", d_party), ("ta", d_ta)), key=lambda x: x[1])
        res["driver"] = drv[0] if drv[1] > 0 else None
        want = LEVER_DRIVER.get((c.get("lever_primary") or "").upper())
        if res["driver"] and want and res["driver"] != want and incr > 0:
            res["lever_note"] = ("tăng nhờ %s, KHÁC giả thuyết đòn bẩy %s (%s)"
                                 % (DRIVER_LABEL[res["driver"]], c.get("lever_primary"), DRIVER_LABEL[want]))
    ft = incr * cm - total
    res["flow_through"] = round(ft)
    res["roi"] = _div(ft, total)
    res["breakeven_lift"] = _div(total, exp[0] * cm)
    if tgt:
        for k, a in (("net", act[0]), ("tc", act[1]), ("aov", aova), ("ta", taa), ("incr", incr)):
            t = to_num(tgt.get("tgt_incr_net" if k == "incr" else "tgt_" + k))
            res["att_" + k] = _div(a, t) if (t and a is not None) else None

    # nhãn
    # BURST: đợt ĐÃ KẾT THÚC là chốt được, dù ngắn (8/3 chạy 3 ngày vẫn phải có kết luận);
    # đợt ĐANG CHẠY là số tạm. RECURRING cần ≥ 2 lần lặp mới so được.
    running = cad == "BURST" and (not d1 or (last and d1 > last))
    matured = (not running) if cad == "BURST" else len(period) >= 2
    if not matured:
        res["label"] = "CHUA_CHIN"
    elif res.get("att_incr") is None or res.get("target_verified") == 0:
        res["label"] = "CHUA_TARGET"
    elif res["att_incr"] >= 1:
        res["label"] = "DAT" if ft > 0 else "DAT_LO"
    elif res["att_incr"] >= 0.8:
        res["label"] = "GAN_DAT"
    else:
        res["label"] = "KHONG_DAT"

    # chuỗi ngày: từ đầu kỳ nền → hết kỳ chạy. exp_net = kỳ nền từng cửa hàng (× f trong kỳ chạy)
    promo_by = defaultdict(float)
    for r in hit:
        promo_by[r["date"]] += to_num(r.get("bills"), 0) or 0
    bw = base_window(d0)
    bases = {st: store_base(daily, st, bw)[0] for st in stores}
    pset, s0 = set(period), bw[0]
    for i in range((end - s0).days + 1):
        d = s0 + timedelta(i)
        a = e = 0.0
        for st in stores:
            x = daily.get((st, d))
            if x and bases.get(st):
                a += x[0]
                e += bases[st][d.weekday()][0] * (f if d >= d0 else 1)
        series.append(dict(campaign_id=cid, date=str(d), in_period=1 if d in pset else 0,
                           act_net=round(a), exp_net=round(e), promo_bills=round(promo_by.get(d, 0))))
    return res, series, issues


# ─────────────────────────── nhịp chạy: suy từ dữ liệu, không bắt người khai ───────────────────────────
def cadence_of(dates):
    """Nhịp chạy suy từ các NGÀY có hoá đơn gắn CTKM trên POS:
    ≥ 80% số ngày rơi vào một thứ (và ≥ 4 ngày) → RECURRING theo thứ đó (vd Happy Tuesday)
    kéo dài ≥ 120 ngày → ALWAYS_ON · còn lại → BURST. Chỉ dùng để chọn CÁCH ĐO lift cửa hàng."""
    from collections import Counter
    ds = sorted(set(dates))
    if not ds:
        return "BURST", None
    top, n = Counter(d.weekday() for d in ds).most_common(1)[0]
    if len(ds) >= 4 and n / len(ds) >= 0.8:
        return "RECURRING", top
    if (ds[-1] - ds[0]).days >= 120:
        return "ALWAYS_ON", None
    return "BURST", None


def derive_cadence(camps, promo):
    """Cột cadence đã bỏ khỏi file khai báo (người khai chọn Mục tiêu · Phương án thay vì Nhịp).
    Còn khai tay (file cũ) thì tôn trọng; trống thì suy từ POS."""
    by = defaultdict(set)
    for r in promo:
        by[r["key"]].add(r["date"])
    for c in camps:
        if str(c.get("cadence") or "").strip():
            continue
        ds = set()
        for pat in [norm(x) for x in str(c.get("name_pos") or "").split("|") if x.strip()]:
            for k, v in by.items():
                if (fnmatch.fnmatch(k, pat) if "*" in pat else k == pat):
                    ds |= v
        d0, d1 = _d(c.get("date_from")), _d(c.get("date_to"))
        ds = {d for d in ds if (not d0 or d >= d0) and (not d1 or d <= d1)}
        c["cadence"], dow = cadence_of(ds)
        if c["cadence"] == "RECURRING" and c.get("recur_dow") in (None, ""):
            c["recur_dow"] = dow


# ─────────────────────────── kiểm khai báo ───────────────────────────
def validate(camps, targets, costs, controls):
    iss, seen = [], set()
    for c in camps:
        cid = c["campaign_id"]
        if cid in seen:
            iss.append((cid, "campaign_id", "LỖI", "trùng mã chương trình"))
        seen.add(cid)
        for field, key in (("nature", None), ("objective", "objectives"), ("lever_primary", "levers"),
                           ("lever_secondary", "levers"), ("mechanic", "mechanics"), ("window", "windows"),
                           ("cadence", "cadences"), ("cost_owner", "cost_owners"), ("status", "statuses")):
            v = str(c.get(field) or "").strip().upper()
            if not v:
                if field in ("objective", "lever_primary", "mechanic"):
                    iss.append((cid, field, "THIẾU", f"chưa khai {field}"))
                continue
            ok = v in NATURES if field == "nature" else v in CODES[key]
            if not ok:
                iss.append((cid, field, "LỖI", f"giá trị '{v}' không có trong danh mục"))
        # phương án phải thuộc đúng mục tiêu (TC_* ∈ TC · AOV_* ∈ AOV · BR_* ∈ BRANDING)
        obj, lv = str(c.get("objective") or "").upper(), str(c.get("lever_primary") or "").upper()
        if obj and lv in LEVER_GROUP and LEVER_GROUP[lv] != obj:
            iss.append((cid, "lever_primary", "LỖI", f"phương án {lv} thuộc mục tiêu {LEVER_GROUP[lv]}, không phải {obj}"))
        if not str(c.get("content") or "").strip():
            iss.append((cid, "content", "THIẾU", "chưa mô tả nội dung chương trình"))
        if not str(c.get("hypothesis") or "").strip():
            iss.append((cid, "hypothesis", "THIẾU", "chưa viết giả thuyết trước khi chạy"))
    ids = {c["campaign_id"] for c in camps}
    for t, name in ((targets, "campaign_target"), (costs, "campaign_cost"), (controls, "campaign_control")):
        for r in t:
            if r["campaign_id"] not in ids:
                iss.append((r["campaign_id"], name, "LỖI", f"{name} trỏ tới mã không có trong dim_campaign"))
    for r in costs:
        if str(r.get("cost_type") or "").upper() not in CODES["cost_types"]:
            iss.append((r["campaign_id"], "cost_type", "LỖI", f"loại chi phí '{r.get('cost_type')}' không có trong danh mục"))
    return iss


# ─────────────────────────── kế hoạch Pre-Analysis (S16) ───────────────────────────
def load_plan():
    """Kế hoạch đọc thẳng S16 — nguồn DUY NHẤT của target/chi phí kế hoạch cho chương trình
    có `pre_id`. Ngày nộp target = ngày sửa file kế hoạch (file lập trước kỳ chạy).

    Thư mục S16 có hai định dạng: 6 sheet loại (Q3/2026 — mã C1/D2… nối Campaign Tracking) và file
    deck theo quý (Q4/2026 trở đi — tools/preeval.py chuyển sang mẫu chuẩn M7.1). Chỉ file 6 sheet
    loại mới cấp target cho M7.2 — chọn theo ĐỊNH DẠNG, không theo ngày sửa, để file quý mới hơn
    không đè mất kế hoạch Q3."""
    f = pre_analysis.latest_legacy()
    if not f:
        return [], None
    try:
        plan = pre_analysis.read(f)
    except Exception as e:  # file kế hoạch hỏng không được chặn cả M7.2
        log(f"  – không đọc được Pre-Analysis: {str(e)[:80]}")
        return [], None
    return plan, datetime.fromtimestamp(os.path.getmtime(f)).strftime("%Y-%m-%d")


def apply_plan(camps, targets, costs, plan, plan_date):
    """Chương trình có `pre_id` → target + chi phí kế hoạch lấy từ S16.
    Sheet campaign_target của S23 chỉ còn dùng cho chương trình KHÔNG có kế hoạch
    (hoặc để ghi ngày nộp `submitted` chính xác hơn ngày sửa file)."""
    by = {p["pre_id"]: p for p in plan}
    iss, used = [], defaultdict(list)
    for c in camps:
        pid = str(c.get("pre_id") or "").strip().upper()
        if not pid:
            continue
        c["pre_id"] = pid
        used[pid].append(c["campaign_id"])
        p = by.get(pid)
        if not p:
            iss.append((c["campaign_id"], "pre_id", "LỖI", f"pre_id {pid} không có trong file Pre-Analysis"))
            continue
        cid = c["campaign_id"]
        old = targets.get(cid) or {}
        if any(to_num(old.get(k)) for k in ("tgt_net", "tgt_tc", "tgt_incr_net")):
            iss.append((cid, "campaign_target", "CẢNH BÁO",
                        f"target khai ở cả Campaign Tracking và Pre-Analysis {pid} — dùng số Pre-Analysis"))
        targets[cid] = dict(
            campaign_id=cid, base_method="PRE_ANALYSIS",
            tgt_net=p.get("target_gross"), tgt_tc=p.get("est_tc"), tgt_aov=p.get("target_aov"), tgt_ta=None,
            tgt_incr_net=p.get("incr_gross"), cm_pct=p.get("cm_pct"),
            submitted=old.get("submitted") or plan_date,
            note=f"Pre-Analysis {pid} · {p.get('source_file')}")
        # chi phí kế hoạch ngoài giảm giá POS: quà tặng (GIFT) · cố định (quà kèm set / merch)
        lines = {k["cost_type"]: k for k in costs.get(cid, [])}
        want = []
        if p["kind"] == "GIFT" and p.get("promo_cost"):
            want.append(("GIFT_COGS", p["promo_cost"], "đơn giá quà × TC kế hoạch"))
        if p.get("fixed_cost"):
            want.append(("GIFT_COGS" if p["kind"] == "COMBO" else "MERCH", p["fixed_cost"], "chi phí cố định kế hoạch"))
        for t, v, why in want:
            if t in lines:
                if to_num(lines[t].get("planned")) is None:
                    lines[t]["planned"] = v
            else:
                ln = dict(campaign_id=cid, cost_type=t, planned=v, actual=None, note=f"Pre-Analysis {pid}: {why}")
                costs[cid].append(ln)
                lines[t] = ln
    return iss


def promo_sales(res):
    """Doanh thu hoá đơn CTKM TRƯỚC ưu đãi, gồm VAT = gross × (net ÷ (gross − giảm)).
    Hoá đơn tặng 100% (gross = giảm) → dùng hệ số 1,08."""
    net, gross, disc = (res.get("promo_net") or 0), (res.get("promo_gross") or 0), (res.get("promo_disc") or 0)
    base = gross - disc
    f = net / base if base > 0 else pre_analysis.VAT
    return round(gross * f) if gross else round(net)


def store_gate(res, c, daily):
    """Chương trình KHÔNG có kế hoạch được chấm bằng lift CẢ cửa hàng. Chỉ hợp lệ khi hoá đơn CTKM
    chiếm đủ lớn trong doanh thu các cửa hàng đó; 4 hoá đơn voucher (886 nghìn) trong 11,8 tỷ doanh
    thu 4 cửa hàng thì 'tăng thêm 819 tr' là dao động ngày, không phải tác động chương trình."""
    stores = [x for x in str(res.get("stores") or "").split("|") if x]
    d0, d1 = _d(res.get("period_from")), _d(res.get("period_to"))
    if not (stores and d0 and d1):
        return
    days = [d0 + timedelta(i) for i in range((d1 - d0).days + 1)]
    if str(c.get("cadence") or "").upper() == "RECURRING" and to_num(c.get("recur_dow")) is not None:
        days = [d for d in days if d.weekday() == int(to_num(c.get("recur_dow")))]
    store_net, store_tc, store_guest = _sum(daily, stores, days)
    res["store_net"] = round(store_net)
    res["store_tc"] = round(store_tc)
    res["promo_share"] = _div(res.get("promo_net"), store_net)
    res["promo_sales"] = promo_sales(res)
    res["store_incr_net"], res["store_lift_pct"] = res.get("incr_net"), res.get("lift_pct")
    res["store_flow_through"] = res.get("flow_through")
    if res.get("eval_scope") == "PROGRAM":
        return
    heads = ("incr_net", "lift_pct", "flow_through", "roi", "breakeven_lift",
             "att_net", "att_tc", "att_aov", "att_ta", "att_incr", "d_tc", "d_aov", "d_party", "d_ta", "d_mix")
    if not res.get("measurable"):          # chưa đo được / branding: không hiện số tăng thêm ở tiêu đề
        for k in heads:
            res[k] = None
        return
    share = res["promo_share"] or 0
    bills = res.get("promo_bills") or 0
    if bills < C.get("min_store_bills", 20) and share >= C.get("min_store_share", 0.05):
        for k in heads:
            res[k] = None
        res.update(measurable=0, label="CHUA_DO",
                   reason="chỉ %d hoá đơn gắn CTKM — quá ít để đọc lift cả cửa hàng (cần ≥ %d). Cần kế hoạch (pre_id) hoặc target riêng để chấm"
                   % (bills, C.get("min_store_bills", 20)))
        return
    incr, pnet = res.get("store_incr_net"), res.get("promo_net") or 0
    if share >= C.get("min_store_share", 0.05) and incr is not None and abs(incr) > pnet:
        # chương trình không thể tạo thêm (hay làm mất) nhiều hơn TOÀN BỘ doanh thu của chính nó
        for k in heads:
            res[k] = None
        res.update(measurable=0, label="CHUA_DO",
                   reason=("biến động doanh thu cả cửa hàng (%s đ) lớn hơn toàn bộ doanh thu hoá đơn CTKM (%s đ) — "
                           "chênh lệch đến từ yếu tố khác (mùa vụ, chương trình chạy chồng, sự kiện), không quy cho chương trình. "
                           "Cần kế hoạch (pre_id) hoặc target riêng để chấm"
                           % (f"{incr:+,.0f}".replace(",", "."), f"{pnet:,.0f}".replace(",", "."))))
        return
    if share < C.get("min_store_share", 0.05):
        for k in ("incr_net", "lift_pct", "flow_through", "roi", "breakeven_lift",
                  "att_net", "att_tc", "att_aov", "att_ta", "att_incr", "d_tc", "d_aov", "d_party", "d_ta", "d_mix"):
            res[k] = None
        res.update(measurable=0, label="CHUA_DO",
                   reason=("hoá đơn CTKM chỉ chiếm %.1f%% doanh thu các cửa hàng trong kỳ (%d hoá đơn · %s đ trên %s đ) — "
                           "lift cả cửa hàng không phản ánh chương trình. Cần kế hoạch (pre_id) hoặc target riêng để chấm"
                           % (share * 100, res.get("promo_bills") or 0, f"{res.get('promo_net') or 0:,.0f}".replace(",", "."),
                              f"{store_net:,.0f}".replace(",", "."))))


def program_eval(res, c, p, costs, last):
    """Chấm chương trình có kế hoạch Pre-Analysis THEO ĐÚNG MÔ HÌNH CỦA KẾ HOẠCH — phạm vi
    chương trình, không phải cả cửa hàng.

    Pre-Analysis đặt Base/Target cho PHẦN DOANH THU CỦA CHƯƠNG TRÌNH (vd Tataki Wagyu: nền
    9 tr, target 10,4 tr, 3 lượt). So target đó với doanh thu CẢ cửa hàng (1,35 tỷ) ra tỉ lệ
    vô nghĩa. Vế thực tế cùng phạm vi = các hoá đơn gắn CTKM trên POS:

      Sales thực tế   = promo_sales = Thanh toán trước giảm giá × hệ số thuế/phí của chính các hoá đơn đó
                        (trước ưu đãi, gồm VAT — cùng nền "Sales gross" của kế hoạch). KHÔNG cộng Phiếu GG:
                        phiếu là cách thanh toán, đã nằm trong Tổng tiền.
      Tăng thêm       = Sales thực tế × (Target − Nền) ÷ Target  (Voucher: Sales × % incremental kế hoạch)
      Promo cost      = DISCOUNT · COMBO: giảm giá + chiết khấu trên POS · VOUCHER: + phần thanh toán bằng phiếu
                        GIFT: giá vốn quà khai thực tế, không có → đơn giá quà kế hoạch × số hoá đơn thực
                        LTO: 0 (chi phí nằm ở giá vốn món + cố định)
      Đóng góp ròng   = Tăng thêm ÷ 1,08 × (1 − COGS%) − (Promo cost + chi phí cố định)

    Lift cả cửa hàng vẫn giữ (store_*) để KIỂM CHỨNG: chương trình chỉ chiếm vài % doanh thu
    cửa hàng thì lift cửa hàng chìm trong dao động ngày — không đọc được, màn hình nói rõ."""
    kind = p["kind"]
    res["eval_scope"] = "PROGRAM"
    if "store_net" not in res:          # store_gate đã lưu lift cửa hàng trước khi xoá số tiêu đề
        res["store_incr_net"], res["store_lift_pct"] = res.get("incr_net"), res.get("lift_pct")
        res["store_flow_through"] = res.get("flow_through")
    bills = res.get("promo_bills") or 0
    sales = promo_sales(res)
    res.update(plan_sales=p.get("target_gross"), base_sales=p.get("base_gross"), plan_tc=p.get("est_tc"),
               act_sales=round(sales) if bills else None)
    res["promo_share"] = _div(res.get("promo_net"), res.get("store_net") or res.get("act_net"))
    res["promo_sales"] = promo_sales(res)
    for k in ("incr_net", "lift_pct", "flow_through", "roi", "breakeven_lift",
              "att_net", "att_tc", "att_aov", "att_ta", "att_incr"):
        res[k] = None
    if kind == "ACTIVATION":
        res.update(label="CHUA_DO", measurable=0,
                   reason="chương trình branding — đo bằng reach · tương tác · UGC, không đo bằng doanh thu")
        return
    if not res.get("period_from"):
        return
    if not bills:
        res.update(label="CHUA_DO", measurable=0,
                   reason="chưa thấy hoá đơn gắn tên CTKM trong kỳ chạy — kiểm tra name_pos · store_scope · ngày")
        return

    share = res.get("noire_share", 1.0)
    manual = {}
    for k in costs:
        v = to_num(k.get("actual"))
        manual[k["cost_type"]] = manual.get(k["cost_type"], 0) + (v if v is not None else (to_num(k.get("planned")) or 0))
    gift_actual = next((to_num(k.get("actual")) for k in costs
                        if k["cost_type"] == "GIFT_COGS" and to_num(k.get("actual")) is not None), None)
    notes = []
    if kind in ("DISCOUNT", "COMBO", "VOUCHER"):
        promo_cost = ((res.get("promo_disc") or 0)
                      + ((res.get("promo_voucher") or 0) if kind == "VOUCHER" else 0)) * share
    elif kind == "GIFT":
        if gift_actual is not None:
            promo_cost = gift_actual
        else:
            promo_cost = (p.get("driver") or 0) * bills
            notes.append("giá vốn quà = đơn giá kế hoạch × %d hoá đơn thực" % bills)
        manual.pop("GIFT_COGS", None)
        # Cộng chiết khấu trực tiếp trên POS nếu hoá đơn có cả giảm giá kèm quà
        pos_disc = (res.get("promo_disc") or 0) * share
        if pos_disc > 0:
            promo_cost += pos_disc
            notes.append("chiết khấu POS = %s đ" % f"{round(pos_disc):,}".replace(",", "."))
    else:
        promo_cost = (res.get("promo_disc") or 0) * share
    fixed = sum(manual.values()) + (res.get("cost_ads_auto") or 0)
    total = promo_cost + fixed
    cogs = p.get("cogs_pct")
    if kind == "VOUCHER":
        share_incr = p.get("incr_share")
        incr = sales * share_incr if share_incr is not None else None
        notes.append("tăng thêm = doanh thu gắn voucher × %.0f%% incremental (giả định kế hoạch — cần nhóm đối chứng)"
                     % ((share_incr or 0) * 100))
    else:
        base, tgt_ = p.get("base_gross"), p.get("target_gross")
        # Nền kế hoạch là doanh thu CẢ PHÂN KHÚC (vd mọi bàn nhóm 6 trong kỳ), còn hoá đơn gắn CTKM chỉ là
        # phần khách tham gia → "thực tế − nền" ra số âm vô nghĩa (Obon: 10 tr − 58,7 tr). Dùng đúng tỷ lệ
        # của kế hoạch: phần tăng thêm = (Target − Nền) ÷ Target doanh thu chương trình. Không bao giờ vượt
        # doanh thu của chính chương trình; xác nhận lại bằng lift cửa hàng khi CTKM đủ lớn.
        if base is not None and tgt_:
            incr = sales * (tgt_ - base) / tgt_
            notes.append("tăng thêm = doanh thu CTKM × %.0f%% (tỷ lệ tăng thêm của kế hoạch: (Target − Nền) ÷ Target)"
                         % ((tgt_ - base) / tgt_ * 100))
        else:
            incr = None
    if cogs is None:
        cogs = 1 - C["default_cm_pct"]
    nc = (incr / pre_analysis.VAT * (1 - cogs) - total) if incr is not None else None
    base = p.get("base_gross")
    res.update(measurable=1, incr_net=round(incr) if incr is not None else None,
               lift_pct=_div(incr, base) if (incr is not None and base) else None,
               cost_promo_actual=round(promo_cost), cost_fixed_actual=round(fixed), cost_total=round(total),
               cm_pct=(1 - cogs) / pre_analysis.VAT,
               flow_through=round(nc) if nc is not None else None,
               roi=_div(nc, total) if (nc is not None and total) else None,
               breakeven_sales=round((base or 0) + total / (1 - cogs) * pre_analysis.VAT) if cogs < 1 else None,
               eval_note=" · ".join(notes) or None)
    tgt = p.get("target_gross")
    res["att_net"] = _div(sales, tgt) if tgt else None
    res["att_tc"] = _div(bills, p.get("est_tc")) if p.get("est_tc") else None
    if p.get("est_tc") and tgt:
        res["att_aov"] = _div(sales / bills, tgt / p["est_tc"])
    if incr is not None and tgt and base is not None and tgt > base:
        res["att_incr"] = _div(incr, tgt - base)
    elif kind == "VOUCHER" and p.get("incr_net_exvat") and incr is not None:
        res["att_incr"] = _div(incr / pre_analysis.VAT, p["incr_net_exvat"])

    d1 = _d(c.get("date_to"))
    running = (c.get("cadence") or "BURST").upper() == "BURST" and (not d1 or (last and d1 > last))
    if running:
        res["label"] = "CHUA_CHIN"
    elif res.get("att_incr") is None or res.get("target_verified") == 0:
        res["label"] = "CHUA_TARGET"
    elif res["att_incr"] >= 1:
        res["label"] = "DAT" if (nc or 0) > 0 else "DAT_LO"
    elif res["att_incr"] >= 0.8:
        res["label"] = "GAN_DAT"
    else:
        res["label"] = "KHONG_DAT"
    res["reason"] = None


def plan_rows(plan, camps, results):
    res = {r["campaign_id"]: r for r in results}
    link = {}
    for c in camps:
        if c.get("pre_id") and (c["pre_id"] not in link or (res.get(c["campaign_id"]) or {}).get("plan_primary") == 1):
            link[c["pre_id"]] = c["campaign_id"]
    keys = CONTRACT["sheets"]["pre_plan"]["cols"]
    out = []
    for p in plan:
        cid = link.get(p["pre_id"])
        r = res.get(cid) or {}
        row = {k: p.get(k) for k in keys}
        grp = [x for x in results if x.get("plan_group") == p["pre_id"]] or ([r] if r else [])
        row["act_promo_net"] = sum(to_num(x.get("promo_net"), 0) or 0 for x in grp) if grp else None
        row["act_promo_bills"] = sum(to_num(x.get("promo_bills"), 0) or 0 for x in grp) if grp else None
        row.update(campaign_id=cid, label=r.get("label"), period_from=r.get("period_from"),
                   period_to=r.get("period_to"), act_net=r.get("act_sales"), act_tc=r.get("promo_bills"),
                   incr_net=r.get("incr_net"), cost_total=r.get("cost_total"),
                   flow_through=r.get("flow_through"), roi_actual=r.get("roi"))
        out.append(row)
    return out


def _clean(rows):
    out = []
    for r in rows:
        o = {}
        for k, v in r.items():
            if isinstance(v, (datetime, date)):
                v = v.strftime("%Y-%m-%d")
            elif isinstance(v, str):
                v = v.strip()
                if k in ("nature", "objective", "lever_primary", "lever_secondary", "mechanic", "window", "cadence",
                         "cost_owner", "status", "cost_type", "brand", "base_method", "pre_id", "source"):
                    v = v.upper()
            o[k] = v
        out.append(o)
    return out


# ─────────────────────────── kế hoạch M7.1 (sổ chuẩn) ↔ thực tế ───────────────────────────
PREEVAL = os.path.join(DATA_INPUT, "04_preeval.xlsx")
LOCK = os.path.join(DATA_INPUT, "05_plan_lock.xlsx")


def load_m71():
    """campaign_id → kế hoạch M7.1. Nối theo cột campaign_id của sổ M7.1 (đọc bản mới nhất ở pre_eval),
    số kế hoạch lấy ở bản ĐÃ KHOÁ (05_plan_lock) — không lấy dự báo đang tính lại."""
    pe = read_workbook(PREEVAL, {"pre_eval"}).get("pre_eval", []) if os.path.exists(PREEVAL) else []
    lock = {r["program_id"]: r for r in (read_workbook(LOCK, {"pre_plan_lock"}).get("pre_plan_lock", [])
                                         if os.path.exists(LOCK) else [])}
    out = {}
    for r in pe:
        cid = str(r.get("campaign_id") or "").strip()
        if r.get("scenario") == "CO_SO" and cid:
            out[cid] = dict(program_id=r["program_id"], quarter=r.get("quarter"), lock=lock.get(r["program_id"]))
    return out


def apply_m71(camps, targets, m71, plan_by):
    """Chương trình M7.2 nối được kế hoạch M7.1 đã khoá → target doanh thu tăng thêm lấy từ đó (cùng nền
    gồm VAT với POS). Chương trình đã có kế hoạch Q3 (pre_id) giữ cách chấm cũ — M7.1 chỉ đặt cạnh."""
    ids = {c["campaign_id"]: c for c in camps}
    iss = []
    for cid, x in m71.items():
        pid, lk = x["program_id"], x["lock"]
        c = ids.get(cid)
        if not c:
            iss.append((cid, "campaign_id", "LỖI", f"M7.1 {pid} trỏ tới campaign_id chưa có ở Campaign_Tracking"))
            continue
        if not lk:
            iss.append((cid, "plan_lock", "CẢNH BÁO",
                        f"M7.1 {pid} chưa khoá kế hoạch (chưa DA_DUYET và chưa tới ngày chạy) — chưa có target để so"))
            continue
        if lk.get("lock_reason") == "KHOA_MUON":
            iss.append((cid, "plan_lock", "CẢNH BÁO",
                        f"M7.1 {pid} khoá SAU ngày bắt đầu ({lk.get('locked_at')}) — kỳ nền dự báo có thể đã chứa kỳ chạy"))
        if c.get("pre_id") and c["pre_id"] in plan_by:
            continue
        old = targets.get(cid) or {}
        if to_num(old.get("tgt_incr_net")):
            continue                                           # target khai tay ở Campaign_Tracking thắng
        oc, ox = to_num(lk.get("other_cogs_pct"), 0) or 0, to_num(lk.get("opex_pct"), 0) or 0
        targets[cid] = dict(
            campaign_id=cid, base_method="M7_1",
            tgt_net=None, tgt_tc=None, tgt_aov=None, tgt_ta=None,
            tgt_incr_net=(to_num(lk.get("net_incr"), 0) or 0) * pre_analysis.VAT,
            cm_pct=(1 - oc - ox) / pre_analysis.VAT,
            submitted=lk.get("submitted") or lk.get("locked_at"),
            note=f"M7.1 {pid} · khoá {lk.get('locked_at')} ({lk.get('lock_reason')})")
    return iss


def plan_vs_actual(results, m71, camps):
    """Đặt kế hoạch M7.1 (đã khoá) cạnh thực tế — thực tế tính bằng CÙNG công thức EBITDA của M7.1:
        EBITDA = DT thuần tăng thêm × (1 − COGS%) − opex biến đổi − quà/vật phẩm − chi phí chương trình
    DT tăng thêm đo ở M7.2 (thực tế − kỳ vọng, đã khử mùa vụ) đã trừ giảm giá POS → không trừ giảm giá lần nữa.
    Quà/vật phẩm: đơn giá kế hoạch × hoá đơn thực tế (POS chưa tách giá vốn quà theo chương trình).
    Trả về bảng hiệu chỉnh (pre_calib) — mỗi chương trình đã nối một dòng."""
    by_c = {c["campaign_id"]: c for c in camps}
    calib = []
    for r in results:
        c = by_c.get(r["campaign_id"], {})
        x = m71.get(r["campaign_id"])
        d = _d(r.get("period_from")) or _d(c.get("date_from"))
        r["quarter"] = (x or {}).get("quarter") or (f"{d.year}-Q{(d.month - 1) // 3 + 1}" if d else None)
        if not x:
            continue
        lk = x["lock"] or {}
        oc, ox = to_num(lk.get("other_cogs_pct"), 0) or 0, to_num(lk.get("opex_pct"), 0) or 0
        pb = to_num(lk.get("bills"))
        r.update(plan_program_id=x["program_id"], plan_locked_at=lk.get("locked_at"),
                 plan_lock_reason=lk.get("lock_reason"), plan_bills=pb, plan_part=to_num(lk.get("tc_share")),
                 plan_cannib=to_num(lk.get("cannib_pct")), plan_net_incr=to_num(lk.get("net_incr")),
                 plan_ebitda=to_num(lk.get("ebitda")), plan_ebitda_low=to_num(lk.get("ebitda_low")),
                 plan_roi=to_num(lk.get("roi")), plan_decision=lk.get("decision"))
        ok = bool(lk) and int(to_num(r.get("measurable"), 0) or 0) == 1 and r.get("label") not in ("CHUA_CHIN", "CHUA_DO")
        ab = to_num(r.get("promo_bills"), 0) or 0
        if int(to_num(r.get("measurable"), 0) or 0) == 1:
            exp_tc, act_tc = to_num(r.get("exp_tc"), 0) or 0, to_num(r.get("act_tc"), 0) or 0
            net = (to_num(r.get("incr_net"), 0) or 0) / pre_analysis.VAT
            fixed = (to_num(r.get("cost_manual"), 0) or 0) + (to_num(r.get("cost_ads_auto"), 0) or 0)
            gift = (to_num(lk.get("gift_per_bill"), 0) or 0) * ab
            eb = net * (1 - oc) - max(0.0, net) * ox - gift - fixed
            disc = ((to_num(r.get("cost_discount"), 0) or 0) + (to_num(r.get("cost_voucher"), 0) or 0)) / pre_analysis.VAT
            r.update(act_part=_div(ab, exp_tc), act_cannib=(1 - min(1.0, max(0.0, act_tc - exp_tc) / ab)) if ab else None,
                     act_net_incr_ex=round(net), act_ebitda=round(eb), act_roi_m71=_div(eb, disc + gift + fixed))
        why = None if ok else ("chưa khoá kế hoạch" if not lk else r.get("reason") or
                               {"CHUA_CHIN": "đang chạy — chưa chốt", "CHUA_DO": "chưa đo được lift"}.get(r.get("label")))
        calib.append(dict(
            program_id=x["program_id"], campaign_id=r["campaign_id"], quarter=r["quarter"], brand=c.get("brand"),
            lever=lk.get("lever") or c.get("lever_primary"), objective=lk.get("objective") or c.get("objective"),
            locked_at=lk.get("locked_at"), lock_reason=lk.get("lock_reason"), label=r.get("label"),
            plan_bills=pb, act_bills=ab or None, plan_part=r.get("plan_part"), act_part=r.get("act_part"),
            plan_cannib=r.get("plan_cannib"), act_cannib=r.get("act_cannib"),
            plan_net_incr=r.get("plan_net_incr"), act_net_incr=r.get("act_net_incr_ex"),
            plan_ebitda=r.get("plan_ebitda"), act_ebitda=r.get("act_ebitda"),
            err_ebitda=(r["act_ebitda"] - r["plan_ebitda"]) if (r.get("act_ebitda") is not None and r.get("plan_ebitda") is not None) else None,
            usable=1 if (ok and r.get("act_cannib") is not None and lk.get("lock_reason") != "KHOA_MUON") else 0,
            note=why or ("khoá sau ngày bắt đầu — chỉ tham khảo, không dùng hiệu chỉnh" if lk.get("lock_reason") == "KHOA_MUON" else None)))
    return calib


def main():
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    path, demo, t = load_input()
    if not path:
        log("  – chưa có file Campaign Tracking và file mẫu — bỏ qua M7.2")
        return 0
    camps = _clean(t["dim_campaign"])
    targets = {r["campaign_id"]: r for r in _clean(t["campaign_target"])}
    costs = defaultdict(list)
    for r in _clean(t["campaign_cost"]):
        costs[r["campaign_id"]].append(r)
    controls = defaultdict(list)
    for r in _clean(t["campaign_control"]):
        controls[r["campaign_id"]].append(r["control_store"])
    log(f"  nguồn: {os.path.basename(path)}{'  (DỮ LIỆU MẪU)' if demo else ''} · {len(camps)} chương trình")

    for c in camps:
        if not c.get("nature"):
            c["nature"] = classify_nature(str(c.get("name_pos") or "").split("|")[0].replace("*", ""))
    plan, plan_date = load_plan()
    plan_issues = apply_plan(camps, targets, costs, plan, plan_date)
    plan_by = {p["pre_id"]: p for p in plan}
    m71 = load_m71()                                   # kế hoạch M7.1 đã khoá, nối qua campaign_id
    plan_issues += apply_m71(camps, targets, m71, plan_by)
    log(f"  kế hoạch M7.1: {len(m71)} chương trình nối campaign_id · {sum(1 for x in m71.values() if x['lock'])} đã khoá")
    log(f"  kế hoạch: {len(plan)} chương trình Pre-Analysis · {sum(1 for c in camps if c.get('pre_id'))} đã nối pre_id")
    daily, promo, ads, first, last = load_facts()
    item_map = defaultdict(list)
    ids = {c["campaign_id"] for c in camps}
    for r in _clean(t.get("campaign_item", [])):
        if not (r.get("item_code") or r.get("item_name")):
            continue
        if r["campaign_id"] not in ids:
            plan_issues.append((r["campaign_id"], "campaign_item", "LỖI", "campaign_item trỏ tới mã không có trong dim_campaign"))
            continue
        item_map[r["campaign_id"]].append(r)
    log(f"  món LTO: {len(LTO_LINES)} dòng trên POS · {len(item_map)} chương trình chạy theo món")
    for c in camps:
        if not c.get("objective") and LEVER_GROUP.get(str(c.get("lever_primary") or "").upper()):
            c["objective"] = LEVER_GROUP[str(c["lever_primary"]).upper()]
    derive_cadence(camps, promo)
    issues = plan_issues + validate(camps, list(targets.values()), [x for v in costs.values() for x in v],
                      [dict(campaign_id=k, control_store=s) for k, v in controls.items() for s in v])
    results, series = [], []
    camp_by_id = {c["campaign_id"]: c for c in camps}
    for c in camps:
        if str(c.get("status") or "").upper() == "CANCELLED":
            continue
        if not c.get("nature"):
            c["nature"] = classify_nature(str(c.get("name_pos") or "").split("|")[0])
        r, s, iss = measure(c, targets.get(c["campaign_id"]), costs.get(c["campaign_id"], []),
                            controls.get(c["campaign_id"], []), daily, promo, ads, first, last,
                            items=item_map.get(c["campaign_id"]))
        r["demo"] = 1 if demo else 0
        r.setdefault("eval_scope", "STORE")
        r.update(objective=c.get("objective"), cadence=c.get("cadence"), recur_dow=c.get("recur_dow"))
        if str(c.get("objective") or "").upper() == "BRANDING" and not c.get("pre_id"):
            # Branding không chấm bằng doanh thu tăng thêm — giữ số POS chạm để tham khảo
            r.update(label="BRANDING", measurable=0,
                     reason="chương trình branding — đo bằng reach · tương tác · review, không đo bằng doanh thu")
        if c.get("pre_id") and c["pre_id"] in plan_by and not r.get("label"):
            r["label"] = "KE_HOACH"
        results.append(r)
        series += s
        issues += iss

    for r in results:
        store_gate(r, camp_by_id[r["campaign_id"]], daily)

    # ── chấm theo kế hoạch: các dòng CÙNG pre_id là các tên POS của MỘT kế hoạch (vd Noire Passport
    #    50K · 100K · 150K) → cộng hoá đơn / doanh thu / giảm giá rồi chấm MỘT lần; mọi dòng nhận chung
    #    kết quả, chỉ dòng đầu `plan_primary=1` được cộng vào tổng (không đếm trùng).
    camp_by = {c["campaign_id"]: c for c in camps}
    groups = defaultdict(list)
    for r in results:
        pid = camp_by[r["campaign_id"]].get("pre_id")
        if pid and pid in plan_by and r.get("label") != "KE_HOACH":
            groups[pid].append(r)
    SUM = ("promo_bills", "promo_guests", "promo_net", "promo_gross", "promo_disc", "promo_voucher", "cost_ads_auto")
    PROG = ("eval_scope", "store_incr_net", "store_lift_pct", "store_flow_through", "plan_sales", "base_sales",
            "plan_tc", "act_sales", "promo_share", "incr_net", "lift_pct", "flow_through", "roi", "breakeven_lift",
            "att_net", "att_tc", "att_aov", "att_ta", "att_incr", "label", "measurable", "reason",
            "cost_promo_actual", "cost_fixed_actual", "cost_total", "cm_pct", "breakeven_sales", "eval_note")
    # promo_share nhóm = Σ hoá đơn CTKM ÷ doanh thu cửa hàng (lấy dòng lớn nhất)
    for pid, rows in groups.items():
        rows.sort(key=lambda x: (str(x.get("period_from") or "9999"), x["campaign_id"]))
        head = rows[0]
        m = dict(head)
        for k in SUM:
            m[k] = sum(to_num(x.get(k), 0) or 0 for x in rows)
        froms = [x["period_from"] for x in rows if x.get("period_from")]
        m["period_from"] = min(froms) if froms else None
        m["act_net"] = max((to_num(x.get("act_net"), 0) or 0) for x in rows) or None
        m["store_net"] = max((to_num(x.get("store_net"), 0) or 0) for x in rows) or None
        cs = [camp_by[x["campaign_id"]] for x in rows]
        mc = dict(camp_by[head["campaign_id"]], cadence="BURST",
                  date_to=None if any(not x.get("date_to") for x in cs) else max(str(x["date_to"]) for x in cs))
        program_eval(m, mc, plan_by[pid], costs.get(head["campaign_id"], []), last)
        names = len(rows)
        for x in rows:
            for k in PROG:
                x[k] = m.get(k)
            x["plan_group"] = pid
            x["plan_primary"] = 1 if x is head else 0
            if names > 1:
                x["eval_note"] = ((m.get("eval_note") + " · ") if m.get("eval_note") else "") + \
                    f"chấm chung {names} tên POS của kế hoạch {pid}"

    # Chương trình CHỒNG KỲ trên cùng cửa hàng — lift đo ở cấp cửa hàng nên KHÔNG tách
    # được phần của từng chương trình. Ghi rõ để màn hình cảnh báo, không im lặng cộng dồn.
    # Chương trình chạy LIÊN TỤC (hạng thẻ, SKG, cash voucher…) đã nằm sẵn trong kỳ nền nên không
    # làm lệch lift — bỏ khỏi phép kiểm chồng kỳ, không thì mọi chương trình đều "chồng" với chúng.
    cad_of = {c["campaign_id"]: (c.get("cadence") or "BURST").upper() for c in camps}
    same_plan = {c["campaign_id"]: c.get("pre_id") for c in camps}
    span = {}
    for r in results:
        if r.get("period_from") and cad_of.get(r["campaign_id"]) != "ALWAYS_ON":
            span[r["campaign_id"]] = (r["period_from"], r.get("period_to") or r["period_from"],
                                      set(str(r.get("stores") or "").split("|")) - {""})
    for r in results:
        me = span.get(r["campaign_id"])
        if not me:
            continue
        ov = [k for k, (f0, t0, st) in span.items()
              if k != r["campaign_id"] and st & me[2] and f0 <= me[1] and me[0] <= t0
              and not (same_plan.get(k) and same_plan.get(k) == same_plan.get(r["campaign_id"]))]
        r["overlap"] = "|".join(sorted(ov)) or None

    # CTKM trên POS chưa gắn vào chương trình nào
    pats = [norm(p) for c in camps for p in str(c.get("name_pos") or "").split("|") if p.strip()]
    un = {}
    for r in promo:
        if r.get("nature") not in ("COMMERCIAL", "LOYALTY", "PARTNER"):
            continue
        if any(fnmatch.fnmatch(r["key"], p) if "*" in p else r["key"] == p for p in pats):
            continue
        k = (r["name_pos"], r.get("brand"))
        u = un.setdefault(k, dict(name_pos=r["name_pos"], nature=r.get("nature"), brand=r.get("brand"),
                                  first=r["date"], last=r["date"], days=set(), bills=0, net=0, disc=0))
        u["first"], u["last"] = min(u["first"], r["date"]), max(u["last"], r["date"])
        u["days"].add(r["date"])
        u["bills"] += to_num(r.get("bills"), 0) or 0
        u["net"] += to_num(r.get("net"), 0) or 0
        u["disc"] += (to_num(r.get("disc"), 0) or 0) + (to_num(r.get("voucher"), 0) or 0)
    unmapped = [dict(u, first=str(u["first"]), last=str(u["last"]), days=len(u["days"]),
                     bills=round(u["bills"]), net=round(u["net"]), disc=round(u["disc"]))
                for u in sorted(un.values(), key=lambda x: -x["net"])]

    calib = plan_vs_actual(results, m71, camps)
    camp_month = [x for r in results for x in (r.pop("_split", None) or [])]
    write_workbook(OUT, {
        "campaign_result": results, "campaign_daily": series, "campaign_month": camp_month,
        "campaign_unmapped": unmapped,
        "campaign_issue": [dict(campaign_id=a, field=b, level=l, msg=m) for a, b, l, m in issues],
        "dim_campaign": camps, "campaign_target": list(targets.values()),
        "campaign_cost": [x for v in costs.values() for x in v],
        "campaign_control": [dict(campaign_id=k, control_store=s) for k, v in controls.items() for s in v],
        "campaign_item": [x for v in item_map.values() for x in v],
        "pre_plan": plan_rows(plan, camps, results),
        "pre_calib": calib,
    }, title="M7.2 · PROMOTION TRACKING — sinh tự động bởi tools/campaign.py")
    cnt = defaultdict(int)
    for r in results:
        cnt[r.get("label")] += 1
    log(f"  → data_input/03_campaign.xlsx · {len(results)} chương trình · "
        + " · ".join(f"{k} {v}" for k, v in sorted(cnt.items(), key=lambda x: str(x[0])))
        + f" · {len(unmapped)} tên CTKM chưa gắn · {len(issues)} lỗi khai báo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
