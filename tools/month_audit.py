# -*- coding: utf-8 -*-
"""
KIỂM TRA ĐỘ ĐỦ DỮ LIỆU MỘT THÁNG
================================
    python tools/month_audit.py            tháng đã khép sổ gần nhất
    python tools/month_audit.py 2026-08

"Có file" chưa phải là "đủ số". Công cụ này hỏi từng nguồn năm câu cụ thể:
  · có file cho tháng đó không?
  · file có đúng mẫu không? (tools/l0_validate.py)
  · phủ đủ SỐ NGÀY của tháng không? (doanh thu ngày, Zalo OA, member)
  · khớp chéo với nguồn khác không? (POS hoá đơn ↔ POS bán hàng ↔ Tracking, lệch ≤ 0,5%)
  · file luỹ kế có được xuất TỚI HẾT tháng không? (voucher, booking)

Đọc số từ data_input/monthly/<tháng>.xlsx đã dựng — nên chạy SAU update.py.
Kết quả: ✔ đủ · ⚠ có nhưng chưa trọn · ✖ thiếu · ℹ thông tin (không tính điểm).
"""
from __future__ import annotations

import os
import re
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import (  # noqa: E402
    MONTHLY_DIR, SOURCES, STORE_META, days_in_month, l0_by_month, l0_files, l0_latest,
    l0_month_file, l0_month_files, last_closed_month, read_workbook, to_num,
)

OK, PART, MISS, INFO = "✔", "⚠", "✖", "ℹ"
TOL = 0.005


def _quarter_tag(month):
    return f"Q{(int(month[5:7]) - 1) // 3 + 1}"


def _last_date_in_name(name):
    ds = re.findall(r"(\d{2})-(\d{2})-(\d{4})", name)
    if not ds:
        return None
    d, m, y = ds[-1]
    try:
        return date(int(y), int(m), int(d))
    except ValueError:
        return None


def audit(month):
    wb = read_workbook(os.path.join(MONTHLY_DIR, f"{month}.xlsx")) \
        if os.path.exists(os.path.join(MONTHLY_DIR, f"{month}.xlsx")) else {}
    T = lambda n: wb.get(n) or []  # noqa: E731
    dim = days_in_month(month)
    end = date(int(month[:4]), int(month[5:7]), dim)
    res = []   # (nhóm, tên, trạng thái, chi tiết, trọng số)

    # nhãn → nguồn: trước tháng `since` của nguồn thì chưa áp dụng, không tính điểm
    SINCE = {"Google Ads": "S09_ads_google", "Social · Facebook (4 fanpage)": "S18_social",
             "Social · TikTok": "S22_tiktok", "eVoucher đối tác": "S21_evoucher",
             "Aggregator (Grab · Dining City)": "S19_aggregator",
             "Ngân sách Marketing": "S10_budget", "Pre-Analysis khuyến mãi": "S16_pre_analytics",
             "KPI CRM quý": "S14_crm_kpi"}

    def add(group, name, st, detail, w=1):
        sid = SINCE.get(name)
        if sid and month < (SOURCES[sid].get("since") or "0000-00"):
            st, detail, w = INFO, f"chưa áp dụng — nguồn có từ {SOURCES[sid]['since']}", 0
        res.append((group, name, st, detail, w))

    try:
        from l0_validate import validate_all
        bad_schema = validate_all()
    except Exception as e:  # noqa: BLE001
        bad_schema = {}
        add("0 · Mẫu file", "Kiểm tra mẫu", PART, f"không chạy được: {str(e)[:60]}")

    def schema_note(sid):
        items = bad_schema.get(sid) or []
        return "; ".join(f"{r}: {', '.join(e)}" for r, e in items)[:220]

    # ── 1 · DOANH THU ──────────────────────────────────────────────
    G = "1 · Doanh thu"
    cov = (T("coverage") or [{}])[0]
    dd = int(to_num(cov.get("days_data"), 0) or 0)
    add(G, "Doanh thu theo ngày (Tracking)", OK if dd >= dim else (PART if dd else MISS),
        f"{dd}/{dim} ngày · {cov.get('first', '—')} → {cov.get('last', '—')}", 3)

    daily = T("daily")
    per_store = {}
    for r in daily:
        per_store.setdefault(r["store"], set()).add(str(r["date"])[:10])
    opened = [c for c, m in STORE_META.items() if (m.get("open") or "0000-00") <= month]
    core = [c for c in opened if STORE_META[c]["tier"] in ("core", "flagship")]
    # Chỉ cửa hàng CHÍNH phải có số MỌI ngày — điểm vệ tinh / popup có ngày không bán
    # là bình thường. Cửa hàng khai trương trong tháng: tính từ ngày có doanh thu đầu.
    short, silent, opening = [], [], []
    for c in core:
        ds = sorted(per_store.get(c, ()))
        if not ds:
            silent.append(c)
            continue
        if STORE_META[c].get("open") == month:
            need = dim - int(ds[0][8:10]) + 1
            opening.append(f"{c} khai trương {ds[0][8:10]}/{month[5:7]}")
        else:
            need = dim
        if len(ds) < need:
            miss_d = sorted({f"{month}-{d:02d}" for d in range(dim - need + 1, dim + 1)} - set(ds))
            short.append(f"{c} {len(ds)}/{need} (trống: {', '.join(x[8:10] for x in miss_d[:6])})")
    st = OK if not short and not silent else PART
    add(G, "Cửa hàng chính đủ ngày", st,
        (f"{len(core)}/{len(core)} cửa hàng đủ ngày" + (f" · {'; '.join(opening)}" if opening else "")
         if st == OK else
         ("ngày KHÔNG có doanh thu — đóng cửa thật hay thiếu số? " + ", ".join(short) if short else "") +
         (" · không có doanh thu cả tháng: " + ", ".join(silent) if silent else "")), 2)
    add(G, "Điểm vệ tinh / popup (ngày có bán)", INFO,
        ", ".join(f"{c} {len(per_store.get(c, ()))}" for c in opened if c not in core), 0)

    tgv = {r["store"]: to_num(r.get("target")) for r in T("dim_target")}
    zero = [c for c in core if c in tgv and not tgv[c] and per_store.get(c)]
    absent = [c for c in core if c not in tgv]
    st = OK if not zero and not absent else PART
    add(G, "Target theo cửa hàng", st,
        f"{len(core)} cửa hàng chính có target" if st == OK else
        ((f"target = 0 nhưng CÓ doanh thu: {', '.join(zero)} → sửa config_targets.csv "
          "(chưa có target thì để TRỐNG, đừng ghi 0)" if zero else "")
         + (f" · chưa có target: {', '.join(absent)}" if absent else "")))

    for sid, label, key in (("S02_bill", "POS hoá đơn", "net_bill"), ("S01_item", "POS bán hàng", "net_item")):
        f = l0_month_file(sid, month)
        if not f:
            add(G, label, MISS, f"không có file tháng {month}", 3)
            continue
        drift = []
        for r in T("recon"):
            a, b = to_num(r.get("net"), 0) or 0, to_num(r.get(key))
            if b is None or not a:
                continue
            if abs(b - a) / a > TOL:
                drift.append(f"{r['store']} {(b - a) / a:+.1%}")
        sn = schema_note(sid)
        st = MISS if sn else (OK if not drift and T("recon") else PART)
        add(G, label, st, (f"SAI MẪU — {sn}" if sn else
                           (f"{os.path.basename(f)} · khớp Tracking ≤0,5% ở {len(T('recon'))} cửa hàng"
                            if not drift else "lệch Tracking: " + ", ".join(drift[:5]))), 3)

    f = l0_month_file("S04_monthly", month)
    add(G, "Báo cáo doanh thu tháng (đối soát)", OK if f else MISS,
        os.path.basename(f) if f else "chưa có — xuất POS › Doanh thu theo cửa hàng cả tháng")

    bk = l0_latest("S07_lead")
    rows_bk = [r for r in T("booking")]
    if not bk:
        add(G, "Booking tiệc", MISS, "chưa có file")
    else:
        mt = datetime.fromtimestamp(os.path.getmtime(bk)).date()
        st = OK if mt >= end else PART
        add(G, "Booking tiệc", st, f"{len(rows_bk)} dòng gộp · file sửa {mt:%d/%m/%Y}"
            + ("" if st == OK else " — sửa TRƯỚC khi hết tháng, có thể thiếu lead cuối tháng"))

    # ── 2 · MARKETING ──────────────────────────────────────────────
    G = "2 · Marketing"
    ads = T("ads_month")
    spend = sum(to_num(r.get("spend"), 0) or 0 for r in ads)
    f = l0_month_file("S08_ads_meta", month)
    add(G, "Meta Ads", OK if f and spend else (PART if f else MISS),
        f"chi {spend:,.0f} đ · {len(T('ads_campaign_detail'))} chiến dịch".replace(",", ".") if f
        else "không có file " + month + "_report.xlsx", 2)

    f = l0_month_file("S09_ads_google", month)
    sn = schema_note("S09_ads_google") if f else ""
    g_sp = sum(to_num(r.get("spend"), 0) or 0 for r in T("ads_google"))
    add(G, "Google Ads", MISS if not f else (PART if month in sn or not g_sp else OK),
        (f"chi {g_sp:,.0f} đ · {len(T('ads_google'))} chiến dịch".replace(",", ".") if f
         else "không có thư mục Tháng " + str(int(month[5:7])) + "." + month[:4]), 2)

    sm = T("social_month")
    fb = [r for r in sm if str(r.get("platform")).upper() == "FACEBOOK"]
    fb_reach = [r for r in fb if to_num(r.get("reach")) is not None]
    add(G, "Social · Facebook (4 fanpage)",
        OK if len(fb_reach) >= 4 else (PART if fb else MISS),
        f"{len(fb)} fanpage · {len(fb_reach)} có người xem trong kỳ" if fb else "chưa có số tháng này")
    tt = [r for r in sm if str(r.get("platform")).upper() == "TIKTOK"]
    add(G, "Social · TikTok", OK if tt else MISS,
        f"{sum(to_num(r.get('views'), 0) or 0 for r in tt):,.0f} lượt xem".replace(",", ".") if tt
        else "chưa có dòng tháng này trong TikTok_Tong_hop")

    q = _quarter_tag(month)
    for sid, label in (("S10_budget", "Ngân sách Marketing"), ("S16_pre_analytics", "Pre-Analysis khuyến mãi")):
        fs = [os.path.basename(x) for x in l0_files(sid)]
        hit = [x for x in fs if q in x.upper() and month[:4] in x]
        add(G, label, OK if hit else (PART if fs else MISS),
            (hit[0] if hit else (f"có file nhưng không phải {q}/{month[:4]}: {fs[0]}" if fs else "chưa có file")))

    # ── 3 · CRM ────────────────────────────────────────────────────
    G = "3 · CRM"
    oa = (T("oa") or [{}])[0]
    od = int(to_num(oa.get("days"), 0) or 0)
    add(G, "Zalo OA", OK if od >= dim else (PART if od else MISS),
        f"{od}/{dim} ngày" if od else "không có file OA Zalo T" + str(int(month[5:7])) + "." + month[:4])

    mb = (T("member") or [{}])[0]
    mdays = int(to_num(mb.get("days"), 0) or 0)
    add(G, "Member đăng ký", OK if mb.get("member") is not None and mdays >= dim
        else (PART if mb.get("member") is not None else MISS),
        (f"{mb.get('member')} member mới · {mdays or '—'}/{dim} ngày chi tiết")
        if mb else "file CRM Dashboard chưa có dòng tháng này")

    vs = l0_files("S11_voucher")
    # Một chiến dịch có thể có nhiều lần xuất — lấy ngày cuối XA NHẤT của mỗi mã
    # (265665 có cả bản tới 07/08 lẫn bản tới 10/09 → không thiếu).
    camp = {}
    for x in vs:
        b = os.path.basename(x)
        m = re.search(r"Campaign_(\d+)", b)
        k = m.group(1) if m else b
        d = _last_date_in_name(b) or date.max
        if k not in camp or d > camp[k]:
            camp[k] = d
    stale = [f"{k} (tới {d:%d/%m})" for k, d in sorted(camp.items()) if d < end]
    add(G, "Voucher iPOS (xuất tới hết tháng)", MISS if not vs else (OK if not stale else PART),
        f"{len(camp)} chiến dịch" + (f" · {len(stale)} chiến dịch chỉ xuất tới trước {end:%d/%m}: "
                                      f"{', '.join(stale)} — còn chạy thì xuất lại" if stale
                                      else " · đều xuất tới sau cuối tháng"))

    fs = [os.path.basename(x) for x in l0_files("S14_crm_kpi")]
    hit = [x for x in fs if q in x.upper().replace(" ", "").replace(".", "") or q in x.upper()]
    add(G, "KPI CRM quý", OK if hit else (PART if fs else MISS), hit[0] if hit else "chưa có file " + q)

    # ── 4 · ĐỐI TÁC ────────────────────────────────────────────────
    G = "4 · Đối tác"
    ev = l0_month_files("S21_evoucher", month)
    add(G, "eVoucher đối tác", OK if ev else MISS, f"{len(ev)} file" if ev else "không có file tháng này")
    agg = T("aggregator")
    f = l0_month_file("S19_aggregator", month)
    no_comm = [f"{r.get('platform')} {r.get('store') or ''}".strip() for r in agg
               if to_num(r.get("commission")) is None]
    add(G, "Aggregator (Grab · Dining City)", MISS if not f else (OK if agg and not no_comm else PART),
        (f"{len(agg)} dòng" + (f" · CHƯA KHAI hoa hồng: {', '.join(no_comm)}" if no_comm else ""))
        if f else "không có file tháng này")
    add(G, "Danh mục đối tác", OK if l0_latest("S15_partnership") else MISS,
        os.path.basename(l0_latest("S15_partnership") or "chưa có"))

    # ── 5 · SẢN PHẨM (chỉ thông tin — thiếu nguồn, không phải thiếu file) ──
    cc = (T("cogs_cov") or [{}])[0]
    rv, rc = to_num(cc.get("rev")), to_num(cc.get("rev_cov"))
    add("5 · Sản phẩm", "Độ phủ giá vốn (BOM)", INFO,
        f"{rc / rv:.0%} doanh thu món có giá vốn" if rv and rc is not None else "chưa tính", 0)

    # ── mẫu file sai ───────────────────────────────────────────────
    for sid, items in bad_schema.items():
        for rel, errs in items:
            add("0 · Mẫu file", SOURCES[sid]["name"], MISS, f"{rel}: {'; '.join(errs)}", 2)

    scored = [r for r in res if r[2] != INFO]
    tot = sum(r[4] for r in scored)
    got = sum(r[4] * (1 if r[2] == OK else 0.5 if r[2] == PART else 0) for r in scored)
    return res, (got / tot if tot else 0)


def render(month):
    res, pct = audit(month)
    lines = ["=" * 78, f"ĐỘ ĐỦ DỮ LIỆU THÁNG {month} — {pct:.0%}", "=" * 78,
             "✔ đủ · ⚠ có nhưng chưa trọn · ✖ thiếu · ℹ thông tin (trọng số: doanh thu ×3)"]
    group = None
    for g, name, st, detail, _ in sorted(res, key=lambda x: x[0]):
        if g != group:
            group = g
            lines.append(f"\n■ {g}")
        lines.append(f"  {st} {name:<36} {detail}")
    gaps = [(n, d) for _, n, s, d, _ in res if s in (MISS, PART)]
    if gaps:
        lines += ["", f"CÒN {len(gaps)} VIỆC ĐỂ THÁNG {month} ĐỦ 100%:"]
        lines += [f"  {i:>2}. {n}: {d}" for i, (n, d) in enumerate(gaps, 1)]
    else:
        lines += ["", f"THÁNG {month} ĐỦ 100%."]
    return lines, pct


def main(argv):
    for _s in (sys.stdout, sys.stderr):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    month = next((a for a in argv if re.match(r"^\d{4}-\d{2}$", a)), last_closed_month())
    lines, pct = render(month)
    print("\n".join(lines))
    return 0 if pct >= 0.999 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
