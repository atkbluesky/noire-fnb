# -*- coding: utf-8 -*-
"""
M7 · CHẤM CHƯƠNG TRÌNH — MỘT CÔNG THỨC CHO MỌI CHƯƠNG TRÌNH
===========================================================
Đặc tả: docs/modules/M7_QUY_CHUAN.md · mã/tên dòng: data_contract.json → $metrics.rows

`evaluate()` nhận số POS đã cộng của MỘT chương trình (dòng campaign_result), kế hoạch ĐÃ KHOÁ dạng chuẩn M7.1
(`m71_lock()` cho sổ M7.1, `q3_lock()` cho kế hoạch Q3 của file S16) và chi phí khai tay, rồi trả ra bảng
Nền · Target · Thực tế · % đạt theo đúng các dòng của `$metrics`. Cả M7.1 (khối "Thực tế") và M7.2 (bảng chấm)
đọc CÙNG kết quả này — màn hình không tự tính lại.

Công thức (mọi tiền GỒM VAT ở khối I, ex-VAT ở khối II–IV):
    c          = %cannib: đo từ TC cửa hàng nếu đủ tin cậy (basis = DO), không thì của kế hoạch (basis = UOC ≈)
    Tăng thêm  = DT CTKM × (1 − c) − c × Giảm giá      ← khách vốn sẽ đến (c) vẫn nhận giảm giá mà không mang thêm doanh thu
    COGS       = COGS% × giá menu của hoá đơn tăng thêm = COGS% × (DT + Giảm giá) × (1 − c) ÷ 1,08
    EBITDA     = Lãi gộp − Quà tặng − Chi phí CT − Opex     (Giảm giá đã nằm trong DT — KHÔNG trừ lần hai)
"""
from __future__ import annotations

from datetime import date

from monthly_lib import CONTRACT, date_of, to_num

M = CONTRACT["$metrics"]
PE = CONTRACT["$preeval"]
CP = CONTRACT["$campaign"]
VAT = PE["vat"]
ROWS = M["rows"]
CODES = [r["code"] for r in ROWS]
DIR = {r["code"]: r["dir"] for r in ROWS}
NOPCT = {r["code"] for r in ROWS if r.get("nopct")}
NEN_ROWS = {r["code"] for r in ROWS if r.get("nen")}
BASE_COGS = PE["base_cogs_pct"]

# loại chi phí khai tay → nhóm dòng (M7_QUY_CHUAN §3): MERCH thuộc Quà tặng · POSM = PRINT
BUCKET = {"GIFT_COGS": "gift", "MERCH": "gift", "ADS": "ads", "KOL": "kol", "PRINT": "posm",
          "AGENCY": "other", "PARTNER_SHARE": "other"}
VOUCHER_MECH = {"CASH_VOUCHER", "NEXT_VISIT"}
GIFT_MECH = {"GIFT_ITEM", "MERCH_GIFT"}


def _n(v, d=None):
    return to_num(v, d)


def _div(a, b):
    return a / b if (a is not None and b) else None


def _d(v):
    s = date_of(v)
    return date.fromisoformat(s) if s else None


# ─────────────────────────── kế hoạch → dạng khoá chuẩn ───────────────────────────
def m71_lock(lk):
    """Dòng pre_plan_lock (sổ M7.1) → dạng chuẩn. Khoá cũ chưa có cột chi tiết mà preeval không bù được thì
    suy bằng hằng đẳng thức từ số đã khoá (cờ legacy)."""
    bills, net = _n(lk.get("bills"), 0) or 0, _n(lk.get("net_incr"), 0) or 0
    opct = _n(lk.get("opex_pct"), 0) or 0
    L = dict(source="M71", program_id=lk["program_id"], locked_at=lk.get("locked_at"), lock_reason=lk.get("lock_reason"),
             submitted=lk.get("submitted") or lk.get("locked_at"), bills=bills, guests=_n(lk.get("guests")),
             rev_incl=_n(lk.get("rev_incl")), net_incr=net, cannib=_n(lk.get("cannib_pct")),
             cogs_pct=_n(lk.get("other_cogs_pct")), opex_pct=opct, ebitda=_n(lk.get("ebitda")),
             ebitda_low=_n(lk.get("ebitda_low")), backfill=bool(_n(lk.get("backfill"), 0)))
    if lk.get("cogs") is not None:
        L.update(cogs=_n(lk["cogs"]), gift=_n(lk.get("gift"), 0), gift_fixed=_n(lk.get("gift_fixed"), 0),
                 ads=_n(lk.get("cost_ads"), 0), kol=_n(lk.get("cost_kol"), 0), posm=_n(lk.get("cost_posm"), 0),
                 other=_n(lk.get("cost_other"), 0), disc=_n(lk.get("disc"), 0))
    else:                                                   # legacy: không tách được → coi toàn bộ chi phí chương trình là "khác"
        prog = _n(lk.get("program_cost"), 0) or 0
        gp = (L["ebitda"] or 0) + prog + max(0.0, net) * opct
        gift = (_n(lk.get("gift_per_bill"), 0) or 0) * bills
        L.update(cogs=net - gp - gift, gift=gift, gift_fixed=0.0, ads=0.0, kol=0.0, posm=0.0, other=prog, disc=0.0,
                 backfill=True)
    L["gift_var_pb"] = _div((L["gift"] or 0) - (L["gift_fixed"] or 0), bills) or 0.0
    return L


def q3_lock(p, plan_date, opex_pct):
    """Kế hoạch Pre-Analysis Q3 (S16) → CÙNG dạng khoá chuẩn M7.1 (quyết định 30/09/2026: bỏ nhánh chấm riêng).
    Quy đổi:
      · %cannib = Nền ÷ Target (phần doanh thu chương trình vốn sẽ xảy ra); Voucher: 1 − % incremental thật
      · giảm giá (DISCOUNT/COMBO/VOUCHER) = promo_cost; quà (GIFT) = promo_cost; chi phí cố định → Quà/vật phẩm (MERCH)
      · Tăng thêm ex-VAT = (Target − Nền) ÷ 1,08 − giảm giá   (giảm giá coi như đã ở nền ex-VAT, đúng cách file Q3 trừ)
      · COGS = COGS% × (Target − Nền) ÷ 1,08 · EBITDA tính lại bằng CÙNG công thức M7.1 (kể cả Opex)
    Q3 không có target khách (Guest) — để trống."""
    kind = p.get("kind")
    if kind == "ACTIVATION":
        return None
    promo, fixed = _n(p.get("promo_cost"), 0) or 0, _n(p.get("fixed_cost"), 0) or 0
    cp = _n(p.get("cogs_pct"))
    if kind == "VOUCHER":
        inc_ex, share = _n(p.get("incr_net_exvat")), _n(p.get("incr_share"))
        if inc_ex is None:
            return None
        disc, gift_var, bills, rev = promo, 0.0, None, _n(p.get("rev_linked_gross"))
        cannib = 1 - share if share is not None else None
        menu_incr_ex = inc_ex
    else:
        tgt, base, inc = _n(p.get("target_gross")), _n(p.get("base_gross")), _n(p.get("incr_gross"))
        if not tgt or base is None or inc is None:
            return None
        disc = promo if kind in ("DISCOUNT", "COMBO") else 0.0
        gift_var = promo if kind == "GIFT" else 0.0
        bills = _n(p.get("est_tc"))
        cannib = base / tgt
        rev = tgt - disc * VAT
        inc_ex = inc / VAT
        menu_incr_ex = inc_ex
    net = inc_ex - disc
    cogs_pct = cp if cp is not None else None
    cogs = menu_incr_ex * cogs_pct if cogs_pct is not None else None
    gift = gift_var + fixed
    L = dict(source="Q3", kind=kind, program_id=p["pre_id"], locked_at=plan_date, lock_reason="Q3_S16", submitted=plan_date,
             bills=bills, guests=None, rev_incl=rev, net_incr=net, cannib=cannib, cogs_pct=cogs_pct, opex_pct=opex_pct,
             cogs=cogs, gift=gift, gift_fixed=fixed, ads=None, kol=None, posm=None, other=None, disc=disc,
             gift_var_pb=_div(gift_var, bills) or 0.0, backfill=False, ebitda_low=None)
    L["ebitda"] = (net - (cogs or 0) - gift - max(0.0, net) * opex_pct) if cogs is not None else None
    return L


# ─────────────────────────── chi phí khai tay ───────────────────────────
def _buckets(costs):
    b = {k: dict(act=None, plan=None) for k in ("gift", "ads", "kol", "posm", "other")}
    for k in costs or []:
        t = BUCKET.get(str(k.get("cost_type") or "").upper())
        if not t:
            continue
        a, p = _n(k.get("actual")), _n(k.get("planned"))
        if a is not None:
            b[t]["act"] = (b[t]["act"] or 0) + a
        if p is not None:
            b[t]["plan"] = (b[t]["plan"] or 0) + p
    return b


# ─────────────────────────── đo cannib ───────────────────────────
def _reliability(r, cfg=CP):
    """Phép đo %cannib từ TC cửa hàng chỉ đáng tin khi CT đủ lớn so với cửa hàng và lift không vô lý."""
    why = []
    exp_tc, act_tc = _n(r.get("exp_tc")), _n(r.get("act_tc"))
    bills, net = _n(r.get("promo_bills"), 0) or 0, _n(r.get("promo_net"), 0) or 0
    if exp_tc is None or act_tc is None:
        why.append("chưa có kỳ nền / đối chứng của cửa hàng")
    else:
        share = _n(r.get("promo_share"))
        if share is None or share < cfg.get("min_store_share", 0.05):
            why.append("hoá đơn CTKM dưới %.0f%% doanh thu cửa hàng" % (cfg.get("min_store_share", 0.05) * 100))
        if bills < cfg.get("min_store_bills", 20):
            why.append("dưới %d hoá đơn" % cfg.get("min_store_bills", 20))
        sinc = _n(r.get("store_incr_net"))
        if sinc is not None and net and abs(sinc) > net:
            why.append("lift cửa hàng lớn hơn cả doanh thu CTKM")
        if r.get("overlap"):
            why.append("chạy chồng kỳ với chương trình khác")
    return (not why), why


# ─────────────────────────── chấm một chương trình ───────────────────────────
def evaluate(r, c, lock, tgt, costs, last, opex_by_brand):
    """→ (u, patch) hoặc None nếu chưa có hoá đơn / không có cách tính %cannib.
    u    : bảng chuẩn (rows[code] = {t, n, a, p, d, est, miss}) + cannib + check + flags — ghi vào cột `u`
    patch: các cột cũ của campaign_result được ghi đè bằng số chuẩn (một số duy nhất cho mọi màn)."""
    bills = _n(r.get("promo_bills"), 0) or 0
    rev = _n(r.get("promo_net"), 0) or 0
    if not bills or not rev:
        return None
    brand = str(c.get("brand") or "ALL").upper()
    guests = _n(r.get("promo_guests"))
    share = _n(r.get("noire_share"), 1.0)
    cogs_pct = (lock or {}).get("cogs_pct")
    if cogs_pct is None:
        cogs_pct = BASE_COGS.get(brand, BASE_COGS["ALL"])
    opex_pct = (lock or {}).get("opex_pct")
    if opex_pct is None:
        opex_pct = opex_by_brand.get(brand, opex_by_brand.get("_default", M["opex_default"]))

    # ── %cannib ──
    ok, why = _reliability(r)
    c_plan = (lock or {}).get("cannib")
    c_act = None
    if ok:
        tc_incr = min(bills, max(0.0, (_n(r.get("act_tc"), 0) or 0) - (_n(r.get("exp_tc"), 0) or 0)))
        c_act = 1 - tc_incr / bills
    c_used, basis = (c_act, "DO") if c_act is not None else ((c_plan, "UOC") if c_plan is not None else (None, None))
    if c_used is None:
        return None

    # ── giảm giá / phiếu (POS) → ex-VAT: hệ số thuế/phí của chính các hoá đơn ──
    gross, disc_pos = _n(r.get("promo_gross"), 0) or 0, _n(r.get("promo_disc"), 0) or 0
    f = rev / (gross - disc_pos) if gross > disc_pos else VAT
    gift_menu = 0.0
    mech = str(c.get("mechanic") or "").upper()
    gift_type = mech in GIFT_MECH or (lock or {}).get("kind") == "GIFT"
    if gift_type:
        # POS ghi món tặng là dòng giảm 100% — đó là GIÁ MENU món tặng, không phải giảm giá. Chi phí thật là giá vốn
        # quà (dòng Quà tặng); tính cả hai là tính hai lần.
        gift_menu, disc_pos = disc_pos, 0.0
    elif mech in VOUCHER_MECH or (lock or {}).get("kind") == "VOUCHER":
        disc_pos += _n(r.get("promo_voucher"), 0) or 0            # CT voucher: giá trị phiếu đã dùng là ưu đãi
    disc_all_ex = disc_pos * f / VAT                              # giảm giá tất cả hoá đơn, ex-VAT
    disc_ex = disc_all_ex * share                                 # phần NOIRE gánh
    rev_ex = rev / VAT + disc_all_ex * (1 - share)                # doanh thu NOIRE thực nhận (đối tác bù phần của họ)

    # ── Tăng thêm · COGS ──
    net_incr = rev_ex * (1 - c_used) - c_used * disc_ex
    incr = net_incr * VAT
    menu_new_ex = (rev / VAT + disc_all_ex) * (1 - c_used)
    cogs = menu_new_ex * cogs_pct
    gp = net_incr - cogs

    # ── quà · chi phí khai tay ──
    bk = _buckets(costs)
    est = set()
    if bk["gift"]["act"] is not None:
        gift = bk["gift"]["act"]
    elif lock:
        gift = (lock.get("gift_var_pb") or 0) * bills + (lock.get("gift_fixed") or 0)
        if gift:
            est.add("gift")
    else:
        gift = bk["gift"]["plan"] or 0.0
        if gift:
            est.add("gift")
    a_cost, miss = {}, set()
    for k in ("ads", "kol", "posm", "other"):
        act = bk[k]["act"]
        if k == "ads":
            auto = _n(r.get("cost_ads_auto"), 0) or 0
            if auto:
                act = (act or 0) + auto
        t_val = (lock or {}).get(k)
        if act is not None:
            a_cost[k] = act
        else:
            plan_v = t_val if t_val else bk[k]["plan"]
            if plan_v:                                            # có kế hoạch nhưng chưa khai thực tế
                miss.add(k)
            a_cost[k] = None
    cost_used = sum((a_cost[k] if a_cost[k] is not None else ((lock or {}).get(k) or bk[k]["plan"] or 0)) for k in a_cost)
    cost_shown = sum(v for v in a_cost.values() if v is not None) if any(v is not None for v in a_cost.values()) else None
    opex = max(0.0, net_incr) * opex_pct
    ebitda = gp - gift - cost_used - opex
    denom = disc_ex + gift + cost_used
    roi = _div(ebitda, denom)

    # ── Target · Nền ──
    T = {k: None for k in CODES}
    N = {k: None for k in CODES}
    if lock:
        tb, tg, trev = lock.get("bills"), lock.get("guests"), lock.get("rev_incl")
        T.update(rev=trev, tc=tb, guest=tg, aov=_div(trev, tb), ta=_div(trev, tg),
                 incr=(lock["net_incr"] * VAT) if lock.get("net_incr") is not None else None,
                 net=lock.get("net_incr"), cogs=lock.get("cogs"),
                 gift=lock.get("gift"), disc=lock.get("disc"),
                 ads=lock.get("ads"), kol=lock.get("kol"), posm=lock.get("posm"), other=lock.get("other"),
                 opex=(max(0.0, lock["net_incr"]) * (lock.get("opex_pct") or 0)) if lock.get("net_incr") is not None else None,
                 ebitda=lock.get("ebitda"))
        if T["net"] is not None and T["cogs"] is not None:
            T["gp"] = T["net"] - T["cogs"]
        ct = [T[k] for k in ("ads", "kol", "posm", "other") if T[k] is not None]
        T["cost"] = sum(ct) if ct else None
        cp_ = lock.get("cannib")
        if cp_ is not None:
            base_menu = (trev + (lock.get("disc") or 0) * VAT) if trev is not None else None
            N.update(rev=base_menu * cp_ if base_menu is not None else None,
                     tc=tb * cp_ if tb else None, guest=tg * cp_ if tg else None)
        den = (lock.get("disc") or 0) + (lock.get("gift") or 0) + (T["cost"] or 0)
        T["roi"] = _div(lock.get("ebitda"), den)
    elif tgt and _n(tgt.get("tgt_incr_net")) is not None:                 # target khai tay ở Campaign_Tracking
        T.update(rev=_n(tgt.get("tgt_net")), tc=_n(tgt.get("tgt_tc")), aov=_n(tgt.get("tgt_aov")), ta=_n(tgt.get("tgt_ta")),
                 incr=_n(tgt.get("tgt_incr_net")), net=_n(tgt.get("tgt_incr_net")) / VAT)

    A = dict(rev=rev, tc=bills, guest=guests, aov=rev / bills, ta=_div(rev, guests), incr=incr, net=net_incr, cogs=cogs,
             gp=gp, gift=gift, disc=disc_ex, ads=a_cost["ads"], kol=a_cost["kol"], posm=a_cost["posm"],
             other=a_cost["other"], cost=cost_shown, opex=opex, ebitda=ebitda, roi=roi)

    rows = {}
    for code in CODES:
        t, a, n = T.get(code), A.get(code), N.get(code)
        direction = DIR[code]
        p = None
        if code not in NOPCT and direction in ("up", "down") and t not in (None, 0) and a is not None and t > 0:
            p = a / t
        e = (code in ("cogs", "gp") or (code in ("incr", "net") and basis == "UOC")
             or code in est or (code in ("ebitda", "roi") and (basis == "UOC" or est or miss)))
        rows[code] = dict(t=t, n=n, a=a, p=p, d=(a - t) if (a is not None and t is not None) else None,
                          est=bool(e), miss=(code in miss))

    # ── nhãn ──
    d0, d1 = _d(c.get("date_from")), _d(c.get("date_to"))
    cad = str(r.get("cadence") or c.get("cadence") or "BURST").upper()
    running = cad == "BURST" and (not d1 or (last and d1 > last))
    matured = (not running) if cad == "BURST" else (_n(r.get("days_run"), 0) or 0) >= 2
    if lock:
        verified = bool(_d(lock.get("submitted")) and d0 and _d(lock.get("submitted")) <= d0)
    else:
        v = r.get("target_verified")
        verified = None if v is None else bool(_n(v, 0))
    t_incr = T["incr"]
    att = rows["incr"]["p"]
    if not matured:
        label = "CHUA_CHIN"
    elif t_incr is None or verified is False:
        label = "CHUA_TARGET"
    elif t_incr > 0:
        label = ("DAT" if ebitda > 0 else "DAT_LO") if att >= 1 else ("GAN_DAT" if att >= 0.8 else "KHONG_DAT")
    else:                                                          # target không dương (kế hoạch tự biết lỗ): chấm theo mức kế hoạch
        label = ("DAT" if ebitda > 0 else "DAT_LO") if incr >= t_incr else "KHONG_DAT"

    flags = []
    if basis == "UOC":
        flags.append("Tăng thêm ≈ ước tính theo %%cannib của kế hoạch (%s)" % "; ".join(why))
    if miss:
        flags.append("chưa khai chi phí thực: %s — EBITDA tạm dùng số kế hoạch" % ", ".join(sorted(miss)))
    if "gift" in est:
        flags.append("Quà tặng ≈ đơn giá kế hoạch × hoá đơn thực (chưa khai giá vốn quà)")
    if gift_type and gift_menu:
        flags.append("POS ghi món tặng là dòng giảm 100%% (%s đ giá menu) — không tính là giảm giá, chi phí là giá vốn quà" % f"{gift_menu:,.0f}".replace(",", "."))
    if lock and lock.get("backfill"):
        flags.append("kế hoạch khoá trước khi có cột chi tiết — các dòng chi tiết suy từ số đã khoá")
    if lock and lock.get("source") == "Q3":
        flags.append("kế hoạch Q3 (file S16) quy về mẫu M7.1: chi phí cố định xếp vào Quà/vật phẩm; Guest không có target; Opex tính theo tỷ lệ brand")
    if lock and lock.get("lock_reason") == "KHOA_MUON":
        flags.append("kế hoạch khoá SAU ngày bắt đầu — chỉ tham khảo")

    u = dict(
        basis=basis, plan=(lock or {}).get("source"), plan_id=(lock or {}).get("program_id"),
        locked_at=(lock or {}).get("locked_at"), lock_reason=(lock or {}).get("lock_reason"),
        cannib=dict(plan=c_plan, act=c_act, used=c_used),
        check=dict(reliable=ok, why=why, share=_n(r.get("promo_share")), store_tc_exp=_n(r.get("exp_tc")),
                   store_tc_act=_n(r.get("act_tc")), store_incr=_n(r.get("store_incr_net")),
                   store_lift=_n(r.get("store_lift_pct"))),
        rows=rows, flags=flags, miss=sorted(miss), matured=matured, verified=verified,
        breakeven_rev=None)
    k_be = (1 - c_used) * (1 - cogs_pct - opex_pct) / VAT          # EBITDA trên mỗi đồng DT CTKM (bỏ giảm giá, chi phí cố định)
    if k_be > 0:
        u["breakeven_rev"] = round((gift + cost_used) / k_be)

    patch = dict(
        incr_net=round(incr), lift_pct=_div(incr, rev - incr), flow_through=round(ebitda), roi=roi,
        att_net=rows["rev"]["p"], att_tc=rows["tc"]["p"], att_aov=rows["aov"]["p"], att_ta=rows["ta"]["p"], att_incr=att,
        cost_total=round(disc_ex + gift + cost_used), cost_promo_actual=round(disc_ex + gift), cost_fixed_actual=round(cost_used),
        cm_pct=(1 - cogs_pct - opex_pct) / VAT, breakeven_sales=u["breakeven_rev"],
        plan_sales=T["rev"], base_sales=N["rev"], plan_tc=T["tc"], act_sales=round(rev),
        label=label, measurable=1, reason=None, basis=basis, cannib_used=c_used,
        eval_scope="PROGRAM" if lock else "STORE", u=u)
    return u, patch
