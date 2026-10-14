# -*- coding: utf-8 -*-
"""
M7.1 · FILE PRE-ANALYTICS QUÝ BẢN FINAL (ĐÃ TRÌNH CEO) → BẢNG M7.1
===================================================================
    python tools/preeval_final.py            (in thử số đọc được — không ghi gì)

Đọc  L0_input/03_MARKETING/05_Promotion_Ke_Hoach/NOIRE_Pre-Analytics_*.xlsx   (S16 · định dạng FINAL)
     — file đánh giá quý do team dựng TRÊN BẢN XUẤT M7.1 rồi chỉnh theo MKT Plan bản Final và trình CEO.
     Sheet: CHUONG_TRINH · CO_CHE · MON · CHI_PHI · NEN_POS · TINH_TOAN · XEP_HANG · KIEM_SOAT_TC · TONG_HOP.

Vì sao KHÔNG tính lại bằng tools/preeval.py: số trên file đã trình CEO (nền POS 01/01–30/09, số HĐ neo theo
số đo Q3/T9, chi phí theo plan Final). Bộ tính chạy lại mỗi lần cập nhật với nền POS mới nhất nên sẽ lệch số đã
trình. File FINAL vì vậy là NGUỒN THẮNG cho đúng quý của nó: tools/preeval.py tính như cũ, rồi gọi `apply()` —
mọi chương trình cùng quý được thay bằng số NGUYÊN của file (không làm tròn, không tính lại), chương trình sổ cùng
quý mà file Final không chấm thì bỏ (file đã quyết bỏ / chuyển sang "chưa chấm"). Quý khác giữ nguyên.

Cùng công thức với bộ tính (sheet HUONG_DAN của file ghi "đúng bộ tính M7.1 — tools/preeval.py"), nên các bảng
pre_eval · pre_eval_fin · pre_eval_scheme · pre_eval_base · pre_eval_input dựng thẳng từ cột của TINH_TOAN / CO_CHE /
NEN_POS — cùng cột, cùng nghĩa với số bộ tính ghi. Thêm 2 bảng: pre_eval_tc (HĐ MKT mang về theo tháng — sheet
KIEM_SOAT_TC) · pre_eval_final (thông tin file + số tham chiếu file Đóng góp TC).

Khoá kế hoạch: chương trình đã chấm của file FINAL khoá bằng chính số file (lock_reason = CEO_FINAL) — M7.2 so
thực tế với số đã trình CEO, không với bản khoá cũ tự chụp từ bộ tính.
"""
from __future__ import annotations

import os
import re
import sys
import unicodedata
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

VAT = 1.08
DEC = {"DUYET": "DUYET", "CHAY THU": "CHAY_THU", "SUA CO CHE": "SUA_CO_CHE", "BRANDING": "BRANDING"}
DOW = {"T2": 0, "T3": 1, "T4": 2, "T5": 3, "T6": 4, "T7": 5, "CN": 6}
SCN = ("THAN_TRONG", "CO_SO", "LAC_QUAN")


def _plain(s):
    s = unicodedata.normalize("NFD", str(s or "")).replace("đ", "d").replace("Đ", "D")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", s).strip().upper()


def _n(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def _z(v):
    return _n(v) or 0.0


def _s(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    v = str(v).strip()
    return v or None


def _div(a, b):
    return a / b if (a is not None and b) else None


def _hdr(c):
    return re.sub(r"\s+", " ", str(c)).strip() if c is not None else ""


def _table(ws, key="Mã chương trình", stop_blank=True):
    """Bảng có dòng tiêu đề chứa ô `key` → list[dict] theo tên cột (khoảng trắng / xuống dòng gộp làm một).
    Dừng ở dòng đầu tiên ô `key` trống (dòng cộng, khối ghi chú)."""
    rows = list(ws.iter_rows(values_only=True))
    for i, r in enumerate(rows):
        h = [_hdr(c) for c in r]
        if key in h:
            k, out = h.index(key), []
            for x in rows[i + 1:]:
                if k >= len(x) or _s(x[k]) is None:
                    if stop_blank:
                        break
                    continue
                out.append({h[j]: x[j] for j in range(min(len(h), len(x))) if h[j]})
            return out, i, h
    return [], None, []


def _col(row, *starts):
    """Ô đầu tiên có tên cột bắt đầu bằng một trong `starts` (tên cột dài, có chú thích)."""
    for st in starts:
        for k, v in row.items():
            if k == st or k.startswith(st):
                return v
    return None


def is_final(wb):
    names = set(wb.sheetnames)
    return {"TINH_TOAN", "XEP_HANG", "CHUONG_TRINH"} <= names


def _quarter(path, progs):
    m = re.search(r"Q([1-4])[ ._-]*(20\d\d)", os.path.basename(path), re.I)
    if m:
        return f"{m.group(2)}-Q{m.group(1)}"
    qs = [f"{p['date_from'][:4]}-Q{(int(p['date_from'][5:7]) - 1) // 3 + 1}" for p in progs if p.get("date_from")]
    return max(set(qs), key=qs.count) if qs else None


def _dow(text):
    t = _plain(text)
    if not t or "MOI NGAY" in t:
        return None
    ds = sorted({DOW[x] for x in re.findall(r"T[2-7]|CN", t)})
    return "|".join(str(d) for d in ds) or None


def _slug(text):
    return re.sub(r"[^A-Z0-9]", "", _plain(text))[:18] or "CT"


# ─────────────────────────── đọc 1 file ───────────────────────────
def read(path):
    """File FINAL → dict(quarter, file, programs, tables{pre_eval…}, pending_ids, meta)."""
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        if not is_final(wb):
            raise ValueError("không phải file FINAL (thiếu sheet TINH_TOAN · XEP_HANG · CHUONG_TRINH)")
        S = {n: wb[n] for n in wb.sheetnames}
        ct, _, _ = _table(S["CHUONG_TRINH"])
        tt, _, _ = _table(S["TINH_TOAN"])
        xh, _, _ = _table(S["XEP_HANG"])
        cc, _, _ = _table(S["CO_CHE"]) if "CO_CHE" in S else ([], 0, [])
        mon, _, _ = _table(S["MON"]) if "MON" in S else ([], 0, [])
        cp, _, _ = _table(S["CHI_PHI"]) if "CHI_PHI" in S else ([], 0, [])
        nen, _, _ = _table(S["NEN_POS"]) if "NEN_POS" in S else ([], 0, [])
        tc_rows, tc_months = _tc_table(S["KIEM_SOAT_TC"]) if "KIEM_SOAT_TC" in S else ([], {})
        tc_ref = _tc_ref(S["KIEM_SOAT_TC"]) if "KIEM_SOAT_TC" in S else []
        pend, head = _pending(S["TONG_HOP"]) if "TONG_HOP" in S else ([], None)
    finally:
        wb.close()

    fname = os.path.basename(path)
    src = f"FINAL: {fname}"
    progs = []
    for r in ct:
        pid = _s(r.get("Mã chương trình"))
        progs.append(dict(
            program_id=pid, brand=(_s(r.get("Brand")) or "ALL").upper(), name=_s(r.get("Tên chương trình")),
            stores=[x.strip() for x in str(r.get("Cửa hàng") or "").split("|") if x.strip()],
            date_from=_s(r.get("Từ ngày")), date_to=_s(r.get("Đến ngày")), dow_text=_s(r.get("Thứ chạy")),
            days=_n(_col(r, "Số ngày chạy")), objective=_s(r.get("Mục tiêu")), lever=_s(_col(r, "Phương án")),
            status=_s(r.get("Trạng thái sổ")), season=_n(r.get("Hệ số mùa vụ")),
            est_bills=_n(_col(r, "Số HĐ tham gia dự kiến")), part=_n(_col(r, "% TC nền tham gia")),
            cannib=_n(_col(r, "% cannib")), uplift=_n(_col(r, "Uplift u")),
            ocogs=_n(r.get("COGS% món khác áp dụng")), opex=_n(_col(r, "Opex biến đổi")),
            cost_total=_n(_col(r, "Tổng chi phí chương trình")), cannib_src=_s(r.get("Nguồn %cannib")),
            part_src=_s(r.get("Nguồn số HĐ tham gia")), content=_s(r.get("Nội dung / cơ chế")),
            hypothesis=_s(r.get("Giả thuyết / mục tiêu")), note=_s(r.get("Ghi chú của sổ")),
            owner=_s(r.get("Phụ trách")), origin=_s(r.get("Nguồn đầu vào"))))
    quarter = _quarter(path, progs)
    P = {p["program_id"]: p for p in progs}
    X = {_s(r.get("Mã chương trình")): r for r in xh}
    T = {(_s(r.get("Mã chương trình")), _s(r.get("Kịch bản"))): r for r in tt}

    costs = {}
    for c in cp:
        pid = _s(c.get("Mã chương trình"))
        t = (_s(c.get("Loại chi phí")) or "OTHER").upper()
        k = {"MERCH": "gift", "ADS": "ads", "KOL": "kol", "PRINT": "posm"}.get(t, "other")
        costs.setdefault(pid, dict(gift=0.0, ads=0.0, kol=0.0, posm=0.0, other=0.0))[k] += _z(c.get("Số tiền (chưa VAT)"))
    stock = {}
    for s in cc:
        st = _n(s.get("Giới hạn quà (stock)"))
        if st:
            pid = _s(s.get("Mã chương trình"))
            stock[pid] = stock.get(pid, 0.0) + st

    out = dict(pre_eval=[], pre_eval_fin=[], pre_eval_scheme=[], pre_eval_base=[], pre_eval_input=[],
               pre_eval_tc=[], pre_eval_final=[])
    for pid, p in P.items():
        x = X.get(pid, {})
        dec = DEC.get(_plain(x.get("QUYẾT ĐỊNH")))
        why = _s(x.get("Lý do"))
        action = _s(_col(x, "Việc cần làm"))
        cs = costs.get(pid, dict(gift=0.0, ads=0.0, kol=0.0, posm=0.0, other=0.0))
        for sc in SCN:
            t = T.get((pid, sc))
            if not t:
                continue
            B = _z(_col(t, "Σ HĐ tham gia"))
            c = _z(t.get("% cannib"))
            tc0 = _n(t.get("NỀN · TC"))
            gfood = _z(t.get("Giá vốn món tặng"))
            merch = _z(t.get("Vật phẩm tặng"))
            fixed = _z(t.get("Chi phí chương trình"))
            st = stock.get(pid)
            out["pre_eval"].append(dict(
                program_id=pid, scenario=sc, name=p["name"], brand=p["brand"], stores="|".join(p["stores"]),
                date_from=p["date_from"], date_to=p["date_to"], days=p["days"], objective=p["objective"],
                lever=p["lever"], status=p["status"], decision=dec, decision_note=why, action=action,
                bills=B, bills_incr=B * (1 - c), cannib_pct=c, rev_incl=_n(t.get("DT CTKM gồm VAT")),
                net_incr=_n(t.get("DT thuần TĂNG THÊM")), gp_incr=_n(t.get("Lãi gộp tăng thêm")),
                promo_cost=_n(_col(t, "Chi ưu đãi")), program_cost=fixed + merch,
                opex_incr=_n(t.get("Opex biến đổi")), ebitda_incr=_n(t.get("EBITDA TĂNG THÊM")),
                ebitda_pct=_n(t.get("EBITDA % DT thuần CTKM")), roi=_n(t.get("ROI")),
                breakeven_bills=_n(t.get("HĐ hoà vốn")), max_cannib=_n(t.get("% cannib tối đa còn hoà vốn")),
                redemption_needed=_div(st, tc0), stock_days=_div(st, _div(B, p["days"])),
                gate_flags=(_s(t.get("Cảnh báo cổng")) or "").rstrip(".") or None, campaign_id=None,
                quarter=quarter, season_factor=p["season"], scheme_mode="CHI_TIET", tc_base=tc0,
                tc_share=_div(B, tc0), participation_src=p["part_src"], cannib_src=p["cannib_src"],
                other_cogs_pct=_n(t.get("COGS% món khác")), opex_pct=_n(t.get("Opex %")),
                base_note=_base_note(nen, pid), safety_bills=_n(t.get("HĐ dự kiến ÷ hoà vốn")),
                input_source=src, missing=None, gift_cost=gfood + merch, guests=_n(t.get("Σ Guest tham gia")),
                cogs_cost=_z(t.get("Giá vốn tăng thêm")) - gfood, gift_total=gfood + merch + cs["gift"],
                gift_fixed=cs["gift"], cost_ads=cs["ads"], cost_kol=cs["kol"], cost_posm=cs["posm"],
                cost_other=cs["other"], disc_cost=_n(t.get("Giảm giá (chưa VAT)"))))
            out["pre_eval_fin"] += _fin(pid, sc, t)
        out["pre_eval_input"] += _inputs(p, [s for s in cc if _s(s.get("Mã chương trình")) == pid],
                                         [m for m in mon if _s(m.get("Mã chương trình")) == pid])
        tf = _n((T.get((pid, "CO_SO")) or {}).get("Hệ số thuế/phí")) or VAT
        for s in cc:
            if _s(s.get("Mã chương trình")) == pid:
                out["pre_eval_scheme"].append(_scheme(pid, s, tf))
    for b in nen:
        out["pre_eval_base"].append(_base(b))

    pending_ids = []
    for it in pend:
        pid, rows = _pending_rows(it, quarter, src)
        pending_ids.append(pid)
        out["pre_eval"].append(rows[0])
        out["pre_eval_input"] += rows[1]

    for r in tc_rows:
        pid = _s(r.get("Mã chương trình"))
        for col, month in tc_months.items():
            out["pre_eval_tc"].append(dict(
                program_id=pid, quarter=quarter, month=month, mkt_bills=_n(r.get(col)),
                bills_file=_n(_col(r, "HĐ tham gia Cơ sở")), unit_per_bill=_n(r.get("Đơn vị / 1 HĐ")),
                bills_used=_n(_col(r, "HĐ dùng chương trình")), incr_share=_n(_col(r, "% tăng thêm")),
                mkt_bills_total=_n(_col(r, "HĐ MKT mang về")), tc_section=_s(r.get("Ghi ở file TC")),
                note=_s(r.get("Ghi chú đơn vị"))))
    meta = [dict(quarter=quarter, key="file", label="File Final", value=fname),
            dict(quarter=quarter, key="file_date", label="Ngày sửa file", value=_mdate(path))]
    if head:
        meta.append(dict(quarter=quarter, key="head", label="Mô tả file", value=head))
    meta += [dict(quarter=quarter, **r) for r in tc_ref]
    out["pre_eval_final"] = meta
    _round(out)
    return dict(quarter=quarter, file=fname, path=path, programs=P, tables=out, pending_ids=pending_ids)


MONEY = {
    "pre_eval": ("rev_incl", "net_incr", "gp_incr", "promo_cost", "program_cost", "opex_incr", "ebitda_incr",
                 "gift_cost", "cogs_cost", "gift_total", "gift_fixed", "cost_ads", "cost_kol", "cost_posm",
                 "cost_other", "disc_cost"),
    "pre_eval_scheme": ("bill_value", "discount", "rev_after_disc", "ta", "cogs", "merch_cost", "promo_cost"),
    "pre_eval_base": ("net_incl", "aov_incl", "ta_incl", "net_day"),
}
BILLS = {"pre_eval": ("bills", "bills_incr", "guests", "tc_base", "breakeven_bills"), "pre_eval_scheme": ("bills",)}


def _round(out):
    """Tiền về đồng (như bộ tính ghi), số HĐ 2 chữ số lẻ — tỷ lệ giữ nguyên. Sai khác ≤ 0,5 đ mỗi ô."""
    for t, cols in MONEY.items():
        for r in out.get(t, []):
            for c in cols:
                if r.get(c) is not None:
                    r[c] = round(r[c])
    for t, cols in BILLS.items():
        for r in out.get(t, []):
            for c in cols:
                if r.get(c) is not None:
                    r[c] = round(r[c], 2)
    for r in out.get("pre_eval_fin", []):
        for c in ("base", "without", "with_promo", "total", "incr"):
            if r.get(c) is not None:
                r[c] = round(r[c], 2) if r["row"] == "tc" else round(r[c])


def _mdate(path):
    return datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d")


def _base_note(nen, pid):
    rs = [r for r in nen if _s(r.get("Mã chương trình")) == pid]
    if not rs:
        return "nền POS theo file Final"
    r = rs[0]
    return (f"file Final · nền POS {_dmy(r.get('Kỳ nền từ'))}→{_dmy(r.get('Kỳ nền đến'))} · "
            f"{int(_z(r.get('Số ngày nền có bán')))} ngày có bán · quy về kỳ chạy × {_z(r.get('Hệ số quy về kỳ chạy')):.4f}")


def _dmy(v):
    s = _s(v) or ""
    return f"{s[8:10]}/{s[5:7]}/{s[:4]}" if len(s) >= 10 else s


def _fin(pid, sc, t):
    """Bảng PP672 (Có KM · Không KM · Tổng · Tăng thêm) — cùng dòng / cùng nghĩa bộ tính (preeval.evaluate)."""
    tf = _n(t.get("Hệ số thuế/phí")) or VAT
    base = dict(tc=_z(t.get("NỀN · TC")), gross=_z(t.get("NỀN · giá menu")) * tf, disc=_z(t.get("NỀN · giảm giá")) * tf,
                net=_z(t.get("NỀN · DT thuần")), cogs=_z(t.get("NỀN · giá vốn")))
    cann = dict(tc=_z(t.get("KHÁCH VỐN SẼ ĐẾN · TC")), gross=_z(t.get("KVSĐ · giá menu")) * tf, disc=0.0,
                net=_z(t.get("KVSĐ · DT thuần")), cogs=_z(t.get("KVSĐ · giá vốn")))
    withp = dict(tc=_z(_col(t, "Σ HĐ tham gia")), gross=_z(t.get("CÓ KM · giá menu")) * tf,
                 disc=_z(t.get("CÓ KM · giảm giá")) * tf, net=_z(t.get("CÓ KM · DT thuần")),
                 cogs=_z(_col(t, "CÓ KM · giá vốn")))
    for d in (base, cann, withp):
        d["gp"] = d["net"] - d["cogs"]
    without = {k: base[k] - cann[k] for k in base}
    total = {k: without[k] + withp[k] for k in base}
    out = []
    for key, label in (("tc", "Hoá đơn (TC)"), ("gross", "Gross sales — gồm VAT"), ("disc", "Giảm giá — gồm VAT"),
                       ("net", "Doanh thu thuần — chưa VAT"), ("cogs", "Giá vốn (COGS)"), ("gp", "Lợi nhuận gộp")):
        b_, w_, p_, t_ = base[key], without[key], withp[key], total[key]
        out.append(dict(program_id=pid, scenario=sc, row=key, label=label, base=b_, without=w_, with_promo=p_,
                        total=t_, cannib_pct=_div(b_ - w_, w_) if key in ("net", "tc") else None,
                        incr=t_ - b_, incr_pct=_div(t_ - b_, b_)))
    return out


def _scheme(pid, s, tf):
    V, d = _z(_col(s, "V — giá trị HĐ tham gia")), _z(_col(s, "d — giảm giá"))
    gift = _z(s.get("Giá vốn món tặng"))
    merch = _z(_col(s, "Vật phẩm / HĐ"))
    cogs = _z(_col(s, "Giá vốn HĐ tham gia"))
    net_after = (V - d) * tf / VAT
    u = _z(_col(s, "u — khách vốn sẽ đến"))
    how = _s(s.get("V xác định bằng")) or "—"
    return dict(program_id=pid, scheme_id=_s(s.get("Scheme")), scheme_name=_s(s.get("Tên scheme")),
                condition=_s(s.get("Điều kiện")), benefit=_s(s.get("Loại ưu đãi")), bills=_n(s.get("Số HĐ · Cơ sở")),
                bill_value=V * tf, discount=d * tf, rev_after_disc=(V - d) * tf, ta=(V - d) * tf, cogs=cogs,
                cogs_pct=_div(cogs, net_after), margin_pct=(1 - cogs / net_after) if net_after else None,
                merch_cost=merch + gift, promo_cost=d * tf / VAT + merch + gift,
                basis_note=f"giá trị hoá đơn = {how} {V:,.0f}".replace(",", ".") + f" · u khách sẵn có = {u:+.0%}")


def _base(b):
    days = _z(b.get("Số ngày nền có bán"))
    net, tc, gu = _z(_col(b, "DT kỳ nền")), _z(b.get("TC kỳ nền")), _z(b.get("Guest kỳ nền"))
    menu = _z(_col(b, "Giá menu kỳ nền"))
    return dict(program_id=_s(b.get("Mã chương trình")), store=_s(b.get("Cửa hàng")), base_from=_s(b.get("Kỳ nền từ")),
                base_to=_s(b.get("Kỳ nền đến")), base_days=days, net_incl=net, tc=tc, guests=gu,
                aov_incl=_div(net, tc), ta_incl=_div(net, gu), tc_day=_div(tc, days), net_day=_div(net, days),
                tax_factor=_n(b.get("Hệ số thuế/phí POS")), disc_share=_div(_z(_col(b, "Giảm giá kỳ nền")), menu),
                note="file Final · 56 ngày gần nhất trước ngày chạy (POS tới 30/09/2026), bỏ lễ, lọc đúng thứ chạy")


def _inputs(p, schemes, items):
    """Đầu vào đã chuẩn hoá (pre_eval_input) — đúng các trường $preeval.input_fields, nguồn = FINAL."""
    from monthly_lib import CONTRACT
    fields = CONTRACT["$preeval"]["input_fields"]["fields"]
    one = lambda k: " · ".join(f"{s.get('Scheme')}: {s.get(k)}" for s in schemes if _s(s.get(k))) or None  # noqa: E731
    codes = lambda role: "|".join(  # noqa: E731
        f"{_s(m.get('Mã món POS'))}*{_z(m.get('Số lượng / HĐ')):g}" for m in items
        if (_s(m.get("Vai trò")) or "").upper() == role and _s(m.get("Mã món POS"))) or None
    val = dict(name=p["name"], brand=p["brand"], store_scope="|".join(p["stores"]) or None,
               date_from=p["date_from"], date_to=p["date_to"], dow=_dow(p["dow_text"]), objective=p["objective"],
               lever_primary=p["lever"], condition=one("Điều kiện"), benefit=one("Loại ưu đãi"),
               benefit_value=one("Giá trị ưu đãi (tỷ lệ / VND)"), item_codes=codes("REQUIRED"), gift_codes=codes("GIFT"),
               est_bills=p["est_bills"], participation_pct=p["part"], cannib_pct=p["cannib"], uplift_pct=p["uplift"],
               season_factor=p["season"], content=p["content"], hypothesis=p["hypothesis"],
               chi_phi=p["cost_total"] or None, note=p["note"])
    return [dict(program_id=p["program_id"], field=f["code"], value=val.get(f["code"]),
                 source="FINAL" if val.get(f["code"]) not in (None, "") else None, level=f["level"],
                 status="OK" if val.get(f["code"]) not in (None, "") else "TRONG", hint=None) for f in fields]


def _tc_table(ws):
    rows, i, h = _table(ws)
    months = {}
    if i is None:
        return [], months
    all_rows = list(ws.iter_rows(values_only=True))
    lab = next((r for r in all_rows[:i] if any(_hdr(c) == "Từ ngày" for c in r)), None)
    for j, name in enumerate(h):
        if re.fullmatch(r"T\d{1,2}", name):
            d = _s(lab[j]) if lab and j < len(lab) else None
            months[name] = d[:7] if d else name
    return rows, months


def _tc_ref(ws):
    """Khối tham chiếu file Đóng góp TC (dưới bảng tổng theo brand): nhãn ở cột D, số ở cột Q4."""
    out, seen = [], False
    keys = {"TỔNG PROMOTION": "tc_mkt_total", "ADS TIN NHẮN": "tc_ads", "CHƯƠNG TRÌNH ĐANG CHẠY TIẾP": "tc_running",
            "TỶ LỆ ĐẠT": "tc_hit_rate", "HOÁ ĐƠN MKT ĐÓNG GÓP": "tc_mkt_after", "TỔNG TC DỰ PHÓNG": "tc_forecast",
            "MỤC TIÊU TC": "tc_target"}
    for r in ws.iter_rows(values_only=True):
        cells = [c for c in r if c is not None]
        txt = next((str(c) for c in cells if isinstance(c, str)), "")
        if "TỔNG \"MỤC 1\"" in txt.upper():
            seen = True
            continue
        if not seen:
            continue
        nums = [c for c in r if isinstance(c, (int, float))]
        for k, code in keys.items():
            if txt.upper().startswith(k) and nums:
                out.append(dict(key=code, label=txt.strip(), value=nums[-1]))
    return out


def _pending(ws):
    """TONG_HOP §4 — hạng mục có trong plan nhưng chưa chấm + dòng mô tả file (dòng 2)."""
    rows = list(ws.iter_rows(values_only=True))
    head = _s(rows[1][0]) if len(rows) > 1 and rows[1] else None
    out = []
    for i, r in enumerate(rows):
        if r and _hdr(r[0]) == "Hạng mục":
            h = [_hdr(c) for c in r]
            for x in rows[i + 1:]:
                if not x or _s(x[0]) is None or re.match(r"^\d+ ·", str(x[0])):
                    break
                out.append({h[j]: x[j] for j in range(min(len(h), len(x))) if h[j]})
            break
    return out, head


def _pending_rows(it, quarter, src):
    title = _s(it.get("Hạng mục")) or "Hạng mục"
    brand, _, name = title.partition(" · ")
    brand = brand.strip().upper()
    if brand not in ("NCB", "NDC", "NJFB"):
        brand = "ALL"
    name = (name or title).strip()
    q = (quarter or "").replace("-", "")
    pid = f"{brand}-{q}-{_slug(name)}"
    miss, owner, state = _s(it.get("Còn thiếu để chấm")), _s(it.get("Đầu mối")), _s(it.get("Trạng thái"))
    note = (f"Chưa chấm — còn thiếu: {miss}" if miss else "Chưa chấm") + (f" · Đầu mối: {owner}" if owner else "") + \
           (f" · {state}" if state else "")
    row = dict(program_id=pid, scenario="CO_SO", name=name, brand=brand, stores="", date_from=None, date_to=None,
               objective=None, lever=None, status="CHO", decision="THIEU_SO", decision_note=note, action=note,
               quarter=quarter, campaign_id=None, input_source=src, missing=None)
    inp = [dict(program_id=pid, field="name", value=name, source="FINAL", level="required", status="OK", hint=None),
           dict(program_id=pid, field="brand", value=brand, source="FINAL", level="required", status="OK", hint=None),
           dict(program_id=pid, field="content", value=_s(it.get("Nội dung trong plan")), source="FINAL",
                level="optional", status="OK", hint=None),
           dict(program_id=pid, field="note", value=note, source="FINAL", level="optional", status="OK", hint=None)]
    return pid, (row, inp)


# ─────────────────────────── nối vào bộ tính ───────────────────────────
def latest_by_quarter():
    """File FINAL sửa gần nhất của mỗi quý. Lỗi đọc → ghi issues, không chặn M7.1."""
    import pre_analysis
    by, issues = {}, []
    for f in pre_analysis.files_by_format().get("FINAL", []):
        try:
            d = read(f)
        except Exception as e:  # noqa: BLE001 — một file hỏng không chặn cả M7.1
            issues.append(f"{os.path.basename(f)}: không đọc được file Final — {str(e)[:90]}")
            continue
        k = d["quarter"] or d["file"]
        if k not in by or os.path.getmtime(f) > os.path.getmtime(by[k]["path"]):
            by[k] = d
    return list(by.values()), issues


def apply(out, log=print):
    """Thay số bộ tính bằng số file FINAL cho đúng quý của file. `out` = {bảng: [dòng]} của tools/preeval.py.
    Giữ campaign_id của sổ (nối M7.2). Trả danh sách file FINAL đã áp (cho `lock`)."""
    finals, issues = latest_by_quarter()
    for i in issues:
        log("   ! " + i)
    for F in finals:
        ids = set(F["programs"]) | set(F["pending_ids"])
        camp = {r["program_id"]: r.get("campaign_id") for r in out.get("pre_eval", []) if r.get("campaign_id")}
        same_q = {r["program_id"] for r in out.get("pre_eval", []) if r.get("quarter") == F["quarter"]}
        dropped = sorted(same_q - ids)
        drop = ids | same_q
        for t in list(out):
            out[t] = [r for r in out[t] if r.get("program_id") not in drop]
        for t, rows in F["tables"].items():
            for r in rows:
                if t == "pre_eval" and camp.get(r["program_id"]):
                    r["campaign_id"] = camp[r["program_id"]]
            out.setdefault(t, [])
            out[t] += rows
        n_dec = {}
        for r in F["tables"]["pre_eval"]:
            if r["scenario"] == "CO_SO":
                n_dec[r["decision"]] = n_dec.get(r["decision"], 0) + 1
        log(f"  file Final {F['quarter']}: {F['file']} · {len(F['programs'])} chương trình chấm + "
            f"{len(F['pending_ids'])} chưa chấm · " + " · ".join(f"{k} {v}" for k, v in sorted(n_dec.items()))
            + " — số lấy NGUYÊN từ file (đã trình CEO), thay số bộ tính")
        if dropped:
            log(f"   bỏ {len(dropped)} chương trình sổ cùng quý không có trong file Final: " + ", ".join(dropped))
    return finals


def lock_meta(progs, finals):
    """Danh sách chương trình đưa cho preeval.lock_plans: chương trình của file FINAL coi như DA_DUYET (đã trình
    CEO) và lấy ngày chạy của file — để lock_plans không gỡ khoá chúng; số khoá do `lock` ghi đè ngay sau đó."""
    fin = {}
    for F in finals:
        for pid, p in F["programs"].items():
            fin[pid] = dict(program_id=pid, status="DA_DUYET", date_from=p["date_from"], date_to=p["date_to"])
    out = [dict(p, **fin[p["program_id"]]) if p["program_id"] in fin else p for p in progs]
    have = {p["program_id"] for p in progs}
    return out + [v for k, v in fin.items() if k not in have]


def lock(finals, lock_path, lock_new, write_workbook, read_workbook, log=print):
    """Khoá kế hoạch bằng số file FINAL (lock_reason = CEO_FINAL) cho mọi chương trình đã chấm của file.
    Gọi SAU preeval.lock_plans — dòng khoá cũ (tự chụp từ bộ tính) của các chương trình này bị thay."""
    if not finals:
        return
    rows = read_workbook(lock_path, {"pre_plan_lock"}).get("pre_plan_lock", []) if os.path.exists(lock_path) else []
    old = {r["program_id"]: r for r in rows}
    n = 0
    for F in finals:
        by = {}
        for r in F["tables"]["pre_eval"]:
            by.setdefault(r["program_id"], {})[r["scenario"]] = r
        day = _mdate(F["path"])
        for pid, sc in by.items():
            b, t = sc.get("CO_SO"), sc.get("THAN_TRONG")
            if not b or b.get("decision") == "THIEU_SO":
                continue
            bills = b.get("bills") or 0
            prev = old.get(pid) or {}
            same = prev.get("lock_reason") == "CEO_FINAL" and _n(prev.get("ebitda")) == _n(b.get("ebitda_incr"))
            old[pid] = dict(
                program_id=pid, quarter=b.get("quarter"), locked_at=prev.get("locked_at") if same else day,
                lock_reason="CEO_FINAL", submitted=day, name=b.get("name"), brand=b.get("brand"), stores=b.get("stores"),
                date_from=b.get("date_from"), date_to=b.get("date_to"), objective=b.get("objective"), lever=b.get("lever"),
                decision=b.get("decision"), bills=bills, tc_base=b.get("tc_base"), tc_share=b.get("tc_share"),
                cannib_pct=b.get("cannib_pct"), net_incr=b.get("net_incr"), rev_incl=b.get("rev_incl"),
                ebitda=b.get("ebitda_incr"), ebitda_low=t.get("ebitda_incr") if t else None, roi=b.get("roi"),
                promo_cost=b.get("promo_cost"), program_cost=b.get("program_cost"),
                gift_per_bill=_div(b.get("gift_cost") or 0, bills), other_cogs_pct=b.get("other_cogs_pct"),
                opex_pct=b.get("opex_pct"), **{k_lock: b.get(k_row) for k_lock, k_row in lock_new})
            n += 1
    write_workbook(lock_path, {"pre_plan_lock": sorted(old.values(), key=lambda r: (str(r["quarter"]), r["program_id"]))},
                   title="M7.1 · KẾ HOẠCH ĐÃ KHOÁ — M7.2 so thực tế với bản này. Sinh bởi tools/preeval.py, không sửa tay.")
    log(f"  khoá theo file Final (CEO_FINAL): {n} chương trình")


if __name__ == "__main__":
    for _s_ in (sys.stdout, sys.stderr):
        _s_.reconfigure(encoding="utf-8", errors="replace")
    fs, iss = latest_by_quarter()
    for F in fs:
        print("══", F["file"], F["quarter"], len(F["programs"]), "CT ·", len(F["pending_ids"]), "chưa chấm")
        for r in F["tables"]["pre_eval"]:
            if r["scenario"] == "CO_SO":
                print(f"  {r['program_id']:<28} {r['decision']:<10} HĐ {r.get('bills') or 0:>8.1f} · "
                      f"EBITDA {r.get('ebitda_incr') or 0:>14,.0f}")
    for i in iss:
        print("  !", i)
