# -*- coding: utf-8 -*-
"""
ĐỌC FILE PRE-ANALYSIS (S16) — BỘ ĐỌC DUY NHẤT
=============================================
    L0_input/03_MARKETING/05_Promotion_Ke_Hoach/NOIRE_Promotion_Pre-Analysis_*.xlsx

M7.1 Pre-Analytics (kế hoạch) và M7.2 Promotion Tracking (target để chấm ĐẠT) cùng đọc
qua hàm này — không nơi nào chép tay số kế hoạch sang file khác.

Cấu trúc file (theo slide TC_AOV_FnB_Marketing.pdf · bước 1–3 slide 8):
  · 4 sheet loại có bảng chuẩn, dòng tiêu đề chứa "ID" + "Chương trình":
        Combo-SetMenu (C#) · Discount (D#) · Gift-FOC (G#) · LTO-Item (L#)
  · Voucher-Loyalty: một chương trình, bảng A (hạng voucher) + bảng B (kiểm tra hiệu quả)
  · Activation-Merch: chương trình branding, không đo ROI doanh thu

NỀN SỐ: "Base/Target Sales gross" GỒM VAT — cùng nền với `net` của POS (cột `Tổng tiền`),
nên target doanh thu so thẳng với thực tế. Pre-Analysis quy "Incr Net" về ex-VAT (÷1,08)
rồi × (1 − COGS%); tương đương trên nền gồm VAT: cm_pct = (1 − COGS%) / 1,08.
"""
from __future__ import annotations

import os
import re
import unicodedata

VAT = 1.08

# loại chương trình: data_contract.json → $campaign.pre_kinds (sheet · tiền tố ID · cơ chế · nhãn)
def _contract_kinds():
    import json
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "..", "data_contract.json"), encoding="utf-8") as f:
        return json.load(f)["$campaign"]["pre_kinds"]


_KINDS = _contract_kinds()
KIND_LABEL = {k["code"]: k["label"] for k in _KINDS}
KIND_MECH = {k["code"]: k["mechanic"] for k in _KINDS}
# 4 sheet có bảng chuẩn (dòng tiêu đề ID + Chương trình); Voucher · Activation đọc riêng
KIND_SHEETS = {k["sheet"]: (k["prefix"], k["code"], k["mechanic"]) for k in _KINDS
               if k["code"] not in ("VOUCHER", "ACTIVATION")}

# tiêu đề cột trong file (đã bỏ dấu, gộp khoảng trắng) → khoá chuẩn
_HDR = [
    ("id", r"^id$"), ("name", r"^chuong trinh"), ("brand", r"^brand"), ("plan_status", r"^status"),
    ("est_tc", r"^est\.? ?tc"), ("base_gross", r"^base sales"), ("growth", r"^growth"),
    ("target_gross", r"^target sales"), ("net_exvat", r"^net ex"), ("cogs_pct", r"^cogs"),
    ("gross_margin", r"^gross margin"), ("incr_net_exvat", r"^incr net"), ("incr_gm", r"^incr gm"),
    ("driver", r"^driver"), ("promo_cost", r"^promo"), ("fixed_cost", r"^fixed"),
    ("total_cost", r"^total cost"), ("net_contrib", r"^net contrib"), ("roi", r"^roi"),
    ("promo_pct_net", r"^ct%"), ("breakeven_incr", r"^breakeven"), ("assessment", r"^danh gia"),
]


def _plain(s):
    s = unicodedata.normalize("NFD", str(s or "")).replace("đ", "d").replace("Đ", "D")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


def _num(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def _rows(ws):
    """Các dòng của sheet, bỏ ô trống ở mép trái TỪNG dòng: tiêu đề sheet nằm cột A còn
    bảng số đặt từ cột B — so theo vị trí tuyệt đối là lệch một cột."""
    out = []
    for r in ws.iter_rows(values_only=True):
        r = list(r)
        while r and r[0] is None:
            r.pop(0)
        out.append(r)
    return out


def _kind_table(rows):
    """Bảng chuẩn của sheet loại: tìm dòng tiêu đề có ID + Chương trình."""
    out, hdr = [], None
    for r in rows:
        cells = [_plain(c) for c in r]
        if hdr is None:
            if "id" in cells and any(c.startswith("chuong trinh") for c in cells):
                hdr = {}
                for j, c in enumerate(cells):
                    for key, rx in _HDR:
                        if key not in hdr and c and re.search(rx, c):
                            hdr[key] = j
                            break
            continue
        j = hdr.get("id")
        rid = r[j] if j is not None and j < len(r) else None
        if not rid or not re.match(r"^[A-Z]\d+$", str(rid).strip()):
            if out:
                break          # hết bảng (dòng ghi chú bên dưới)
            continue
        rec = {k: (r[i] if i < len(r) else None) for k, i in hdr.items()}
        for k in list(rec):
            if k not in ("id", "name", "brand", "plan_status", "assessment"):
                rec[k] = _num(rec[k])
        out.append(rec)
    return out


def _voucher(rows):
    """Voucher-Loyalty: tổng chi phí redemption (bảng A) + kiểm tra hiệu quả (bảng B)."""
    txt = {_plain(r[0]): r for r in rows if r and r[0] is not None}
    name = None
    for r in rows[:3]:
        m = re.search(r"\n?(.+?)\s*\.\s*Logic", str(r[0] if r else ""))
        if m:
            name = m.group(1).strip()
    total = next((r for k, r in txt.items() if k == "tong"), None)
    nums = [x for x in (total or []) if isinstance(x, (int, float))]

    def val(prefix):
        r = next((r for k, r in txt.items() if k.startswith(prefix)), None)
        return _num(next((x for x in (r or [])[1:] if isinstance(x, (int, float))), None))

    cost = val("cp redemption") or (nums[0] if nums else None)
    return dict(name=name or "Voucher / Loyalty", promo_cost=cost, fixed_cost=0.0,
                total_cost=cost, rev_linked_gross=(nums[1] if len(nums) > 1 else None),
                incr_share=val("% doanh thu that su"), cogs_pct=val("cogs % binh quan"),
                incr_net_exvat=val("dt incremental"), incr_gm=val("bien gop tang them"),
                net_contrib=val("dong gop rong"), roi=val("roi"))


def _activation(rows):
    out, hdr = [], None
    for r in rows:
        cells = [_plain(c) for c in r]
        if hdr is None:
            if cells and cells[0].startswith("chuong trinh") and any("tong cp" in c for c in cells):
                hdr = cells
            continue
        if not r or r[0] is None:
            if out:
                break
            continue
        rec = dict(zip(hdr, r))
        if str(r[0]).lower().startswith("ghi chu"):
            break
        out.append(dict(name=str(r[0]).strip(), brand=rec.get("brand"),
                        promo_cost=_num(rec.get("giai thuong/qua (vnd)")),
                        fixed_cost=_num(rec.get("cp san xuat (vnd)")),
                        total_cost=_num(rec.get("tong cp")),
                        reach_target=_num(rec.get("reach/engage muc tieu")),
                        net_contrib=-(_num(rec.get("tong cp")) or 0), roi=None))
    return out


def read(path):
    """→ list[dict] mỗi chương trình một dòng, khoá `pre_id` (C1, D2, G7, V1, A1…)."""
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        plan = []
        master = {}
        ms = next((n for n in wb.sheetnames if "tong hop" in _plain(n)), None)
        if ms:
            for r in _rows(wb[ms]):
                if r and isinstance(r[0], (int, float)) and len(r) > 1 and r[1]:
                    master[_plain(r[1])] = dict(brand=r[2], kind_label=r[3], roi_master=r[5])
        for sheet, (prefix, kind, mech) in KIND_SHEETS.items():
            if sheet not in wb.sheetnames:
                continue
            for rec in _kind_table(_rows(wb[sheet])):
                rec.update(pre_id=str(rec.pop("id")).strip(), kind=kind, mechanic_hint=mech, sheet=sheet)
                plan.append(rec)
        vs = next((n for n in wb.sheetnames if _plain(n).startswith("voucher")), None)
        if vs:
            v = _voucher(_rows(wb[vs]))
            m = next((x for k, x in master.items() if _plain(v["name"]).split(" (")[0] in k), None)
            brand = m["brand"] if m else None
            if not m:
                m = next(((k, x) for k, x in master.items() if "voucher" in _plain(x["kind_label"])), None)
                if m:
                    v["name"] = next(r[1] for r in _rows(wb[ms]) if r and len(r) > 1 and _plain(r[1]) == m[0])
                    brand = m[1]["brand"]
            v.update(pre_id="V1", kind="VOUCHER", mechanic_hint=KIND_MECH["VOUCHER"], sheet=vs, brand=brand)
            plan.append(v)
        acs = next((n for n in wb.sheetnames if _plain(n).startswith("activation")), None)
        if acs:
            for i, a in enumerate(_activation(_rows(wb[acs])), 1):
                a.update(pre_id=f"A{i}", kind="ACTIVATION", mechanic_hint=KIND_MECH["ACTIVATION"], sheet=acs)
                # tên ngắn khớp sheet tổng hợp
                full = next((r[1] for r in _rows(wb[ms]) if ms and r and len(r) > 1 and r[1]
                             and _plain(r[1]).split(" (")[0] == _plain(a["name"]).split(" (")[0]), None)
                if full:
                    a["name"] = full
                plan.append(a)
    finally:
        wb.close()

    for p in plan:
        p["name"] = str(p.get("name") or "").strip()
        p["brand"] = str(p.get("brand") or "").strip().upper() or None
        p["kind_label"] = KIND_LABEL[p["kind"]]
        base, tgt = p.get("base_gross"), p.get("target_gross")
        # doanh thu tăng thêm trên nền GỒM VAT — cùng nền với POS
        p["incr_gross"] = (tgt - base) if (base is not None and tgt is not None) else None
        cogs = p.get("cogs_pct")
        p["cm_pct"] = ((1 - cogs) / VAT) if cogs is not None else None
        if p.get("total_cost") is None and p.get("promo_cost") is not None:
            p["total_cost"] = (p.get("promo_cost") or 0) + (p.get("fixed_cost") or 0)
        if p.get("est_tc") and tgt:
            p["target_aov"] = tgt / p["est_tc"]
        p["source_file"] = os.path.basename(path)
    return plan


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from monthly_lib import l0_latest
    f = l0_latest("S16_pre_analytics")
    for p in read(f):
        print(p["pre_id"], p["brand"], p["kind"], p["name"][:40], p.get("target_gross"), p.get("total_cost"),
              p.get("net_contrib"), p.get("roi"))
