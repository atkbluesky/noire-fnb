# -*- coding: utf-8 -*-
"""
CỔNG CHUẨN HOÁ ĐẦU VÀO — file lạ trong thư mục nguồn → ĐÚNG SCHEMA CHUẨN
=======================================================================
    python tools/l0_ingest.py            xem thư mục nào có file lạ, chuyển được gì, thiếu gì
    python tools/l0_ingest.py S15        chỉ xem một nguồn

NGUYÊN TẮC (áp cho MỌI nguồn L0, không riêng M9):

  ① Thư mục nguồn có file KHÔNG đúng mẫu tên chuẩn → KHÔNG bỏ qua, KHÔNG dựng màn hình mới
    cho nó. Một bộ chuyển (adapter) đọc file đó và ánh xạ sang ĐÚNG các cột của file chuẩn.
  ② File chuẩn THẮNG từng ô: ô nào người dùng đã điền thì giữ nguyên; file lạ chỉ ĐIỀN VÀO
    CHỖ TRỐNG và thêm dòng mà file chuẩn chưa có.
  ③ Ô nào file lạ KHÔNG ghi rõ thì ĐỂ TRỐNG và báo "cần bổ sung" — tuyệt đối không đoán
    (không suy ngày từ "Tháng 10", không đoán mã cửa hàng, không đổi nền doanh thu).
  ④ Mọi thứ đã chuyển đều ghi rõ nguồn (file + sheet) trong báo cáo để đối chiếu ngược.

Vì sao: mỗi lần có file mới mà dựng riêng một lane đọc + một khối giao diện thì số liệu chạy
hai đường, không so được với nhau. Một đường chuẩn duy nhất giữ cho mọi con số cùng nghĩa.
Xem docs/10_L0_INPUT_CONTRACT.md §Cổng chuẩn hoá và [[new-input-format-to-standard]].
"""
from __future__ import annotations

import fnmatch
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import SOURCES, l0_dir, month_of, norm, store_code, to_num  # noqa: E402

# ══════════════════════════════════════════════════════════════════════
# Tiện ích đọc
# ══════════════════════════════════════════════════════════════════════
def _cell(v):
    """Ô Excel → giá trị sạch; ô trống / 'nan' / '—' → None (KHÔNG thành 0, KHÔNG thành 'nan')."""
    if v is None:
        return None
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    t = str(v).strip()
    return None if t in ("", "nan", "NaT", "None", "—", "-") else t


def _grid(path, sheet):
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True, data_only=True)
    if sheet not in wb.sheetnames:
        wb.close()
        return None
    ws = wb[sheet]
    ws.reset_dimensions()
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()
    return rows


def _table(path, sheet, head_needle):
    """Sheet có tiêu đề ở dòng bất kỳ → list[dict] theo tiêu đề đã chuẩn hoá."""
    g = _grid(path, sheet)
    if not g:
        return []
    hi = next((i for i, r in enumerate(g)
               if r and any(norm(_cell(c)) == norm(head_needle) for c in r)), None)
    if hi is None:
        return []
    head = [norm(_cell(c)) for c in g[hi]]
    out = []
    for r in g[hi + 1:]:
        if not r or all(c is None for c in r):
            continue
        out.append({h: (r[j] if j < len(r) else None) for j, h in enumerate(head) if h})
    return out


def _get(row, *names):
    for n in names:
        if norm(n) in row:
            return _cell(row[norm(n)])
    return None


def _num(row, *names):
    return to_num(_get(row, *names))


# ══════════════════════════════════════════════════════════════════════
# S15 · danh mục đối tác kiểu CŨ (00_Danh_Muc_Partnership.xlsx)
# ══════════════════════════════════════════════════════════════════════
def _detect_danh_muc_cu(path):
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True)
    names = set(wb.sheetnames)
    wb.close()
    return "1. Đối Tác" in names


def _convert_danh_muc_cu(path):
    """Danh mục cũ → 1_PARTNER · 2_AGGREGATOR · 3_CHUONG_TRINH · 4_KE_HOACH."""
    miss, out = [], {"partners": [], "programs": [], "plan": []}

    for r in _table(path, "1. Đối Tác", "Mã ĐT"):
        code = _get(r, "Mã ĐT")
        if not code:
            continue
        kind = _get(r, "Loại đối tác")
        ch = (_get(r, "Kênh") or "").upper()
        if ch not in ("PARTNER", "AGGREGATOR"):
            # Cột Kênh chưa khai: nền tảng trung gian nhận ra theo LOẠI, còn lại để PARTNER.
            ch = "AGGREGATOR" if re.search(r"nền tảng|nen tang|aggregator", norm(kind or "")) else "PARTNER"
        fee_month = _num(r, "Phí cố định / tháng")
        row = dict(code=code, name=_get(r, "Tên đối tác"), channel=ch, kind=kind,
                   brand=_get(r, "Brand áp dụng"), stores=_get(r, "Cửa hàng áp dụng"),
                   start=_get(r, "Ngày bắt đầu"), end=_get(r, "Ngày kết thúc"),
                   status=_get(r, "Trạng thái"),
                   noire_share=_num(r, "% Noire chịu chiết khấu"),
                   commission_pct=_num(r, "% Hoa hồng đối tác"),
                   media=_num(r, "Giá trị media quy đổi"),
                   note=_get(r, "Ghi chú"))
        if ch == "AGGREGATOR":
            row["fee_month"] = fee_month
        else:
            row["fee"] = fee_month
            row["fee_period"] = "Hàng tháng" if fee_month else None
        out["partners"].append(row)

    seen = {}
    for r in _table(path, "2. Mã CTKM", "Mã ĐT"):
        code = _get(r, "Mã ĐT")
        if not code or norm(_get(r, "Áp dụng") or "có") in ("không", "khong", "no"):
            continue
        seen[code] = seen.get(code, 0) + 1
        pos_name = _get(r, "Tên CTKM trên bảng kê")
        out["programs"].append(dict(
            prog=f"{code}-CU{seen[code]}", code=code,
            # Danh mục cũ không có cột "Tên chương trình" riêng — lấy tên CTKM trên bảng kê,
            # không có thì ĐỂ TRỐNG (không tự ghép từ tên đối tác).
            name=pos_name, brand=None, mech=_get(r, "Cơ chế"), offer=None,
            rate=_num(r, "Mức giảm"), cap=_num(r, "Trần giảm (đ)", "Trần giảm"),
            min_bill=_num(r, "HĐ tối thiểu (đ)", "HĐ tối thiểu"),
            condition=None, start=None, end=None, codes=None,
            cid=_get(r, "Campaign ID iPOS"), pos_name=pos_name,
            note=f"nguồn: {os.path.basename(path)} · sheet 2. Mã CTKM"))
        if not _get(r, "Cơ chế") or _num(r, "Mức giảm") is None:
            miss.append(f"{code}: cơ chế / mức ưu đãi chưa ghi ở danh mục cũ")

    yr = None
    for r in _table(path, "4. Tham Số", "Tham số"):
        if norm(_get(r, "Tham số") or "") == norm("Năm phân tích"):
            yr = int(to_num(_get(r, "Giá trị")) or 0) or None
    for r in _table(path, "3. Kế Hoạch", "Mã ĐT"):
        code, mth = _get(r, "Mã ĐT"), to_num(_get(r, "Tháng"))
        if not code or not mth:
            continue
        if not yr:
            miss.append("Kế hoạch: sheet 4. Tham Số không ghi 'Năm phân tích' → không dựng được cột Tháng")
            break
        out["plan"].append(dict(month="%d-%02d" % (yr, int(mth)), code=code,
                                scenario=_get(r, "Kịch bản"), issued=_num(r, "Mã phát hành KH"),
                                use_rate=_num(r, "Tỷ lệ dùng KH"), aov=_num(r, "AOV KH (đ)"),
                                rev=_num(r, "Doanh thu KH (đ)"), cost=_num(r, "Chi phí KH (đ)"),
                                gp=_num(r, "LN gộp KH (đ)"), note=None))
    return out, miss


# ══════════════════════════════════════════════════════════════════════
# S19 · báo cáo Promotion-AGG của team (sheet Aggregator, mục C2)
# ══════════════════════════════════════════════════════════════════════
def _detect_bao_cao_agg(path):
    from openpyxl import load_workbook
    wb = load_workbook(path, read_only=True)
    ok = "Aggregator" in wb.sheetnames
    wb.close()
    return ok


def _convert_bao_cao_agg(path, platforms=None):
    """Mục C2 của báo cáo team → AGG_THANG.

    `Sales` của báo cáo là doanh thu TRƯỚC VAT/phí phục vụ, khác nền "Tổng tiền hoá đơn" của
    cột Doanh thu chuẩn → KHÔNG tự đổi, để trống và ghi số báo cáo vào ghi chú để người khai
    điền đúng nền. Các cột đếm được (đơn, khách) và tiền phí thì nghĩa giống nhau nên chuyển thẳng.
    """
    month = month_of(os.path.basename(path)) or month_of(re.sub(r"[-_]", ".", os.path.basename(path)))
    miss, rows = [], []
    if not month:
        return {"agg": []}, [f"{os.path.basename(path)}: tên file không đọc được tháng"]
    g = _grid(path, "Aggregator")
    if not g:
        return {"agg": []}, miss
    hi = next((i for i, r in enumerate(g)
               if r and any(norm(_cell(c)) == "nền tảng" for c in r)), None)
    if hi is None:
        return {"agg": []}, [f"{os.path.basename(path)}: không thấy mục C2 (bảng theo nền tảng)"]
    head = [norm(_cell(c)) for c in g[hi]]

    def at(r, *needles):
        for n in needles:
            for j, h in enumerate(head):
                if h and norm(n) in h:
                    return to_num(r[j]) if j < len(r) else None
        return None

    # Tên nền tảng trên báo cáo team viết khác danh mục ("Grab DineOut" ↔ "Grab Dine Out"):
    # so khớp sau khi bỏ hết khoảng trắng, và nhận thêm bí danh khai ở cột "Tên khác trên báo cáo".
    squash = lambda x: re.sub(r"\s+", "", norm(x))
    plat = {squash(k): v for k, v in (platforms or {}).items() if k}
    def row_of(r, code, store):
        """Trả (dòng chuẩn, cảnh báo) — cảnh báo chỉ ghi khi dòng được GIỮ, tránh báo cho
        dòng tổng của nền tảng đã bị bỏ."""
        sales = at(r, "sales")
        warn_ = (f"{month} · {store or code}: Doanh thu để trống — báo cáo ghi Sales trước VAT, "
                 f"cần Tổng tiền hoá đơn (gồm VAT & phí phục vụ)") if sales else None
        return warn_, dict(month=month, brand=(store or "")[:4].rstrip("_") or None, store=store, code=code,
                    bookings=None, cancels=None, guests=at(r, "khách"), bills=at(r, "order"),
                    net=None,                      # nền khác — người khai điền Tổng tiền hoá đơn
                    disc_noire=at(r, "discount"), disc_platform=None,
                    commission=at(r, "commission"), fee_other=None, method=None,
                    note=f"nguồn: {os.path.basename(path)} · C2" +
                         (f" · báo cáo ghi Sales {sales:,.0f} (trước VAT)".replace(",", ".") if sales else ""))

    cur, pending, n_store = None, None, 0

    def flush():
        # Nền tảng có dòng cửa hàng ở dưới → dòng nền tảng là TỔNG, bỏ để khỏi cộng đôi.
        # Không có dòng cửa hàng nào (Dining City) → giữ chính dòng nền tảng.
        if pending is not None and n_store == 0:
            rows.append(pending[1])
            if pending[0]:
                miss.append(pending[0])

    for r in g[hi + 1:]:
        name = _cell(r[0]) if r else None
        if not name or norm(name) in ("tổng", "tong", "khác", "khac"):
            continue
        code = next((c for k, c in plat.items() if k and (k in squash(name) or squash(name) in k)), None)
        st = store_code(name)
        if code:
            flush()
            cur, pending, n_store = code, row_of(r, code, None), 0
            continue
        if not st or not cur:
            if not st and not code:
                miss.append(f"{month}: dòng '{name}' chưa nhận ra — khai tên này vào cột "
                            f"'Tên khác trên báo cáo' của 2_AGGREGATOR (hoặc bí danh cửa hàng ở dim_store)")
            continue
        n_store += 1
        w, row = row_of(r, cur, st)
        rows.append(row)
        if w:
            miss.append(w)
    flush()
    return {"agg": rows}, miss


# ══════════════════════════════════════════════════════════════════════
# Sổ đăng ký bộ chuyển — thêm nguồn mới thì thêm MỘT dòng ở đây
# ══════════════════════════════════════════════════════════════════════
ADAPTERS = [
    dict(id="danh_muc_cu", source="S15_partnership", name="Danh mục đối tác kiểu cũ (1. Đối Tác · 2. Mã CTKM · 3. Kế Hoạch)",
         detect=_detect_danh_muc_cu, convert=_convert_danh_muc_cu),
    dict(id="bao_cao_agg", source="S19_aggregator", name="Báo cáo Promotion-AGG của team (sheet Aggregator · mục C2)",
         detect=_detect_bao_cao_agg, convert=_convert_bao_cao_agg),
]


def stray_files(source_id):
    """File trong thư mục nguồn KHÔNG khớp mẫu tên chuẩn (bỏ file tạm ~$ của Excel)."""
    d = l0_dir(source_id)
    if not d:
        return []
    # Mẫu tên có thể khai NHIỀU dạng, ngăn bằng "|" (S16: *.xlsx | *.xlsm) — phải tách ra,
    # không thì file hợp lệ cũng bị coi là lạ. File _MAU_* là file mẫu do hệ thống sinh.
    pats = [x.strip() for x in str(SOURCES[source_id].get("pattern") or "*").split("|") if x.strip()]
    out = []
    for p in sorted(glob.glob(os.path.join(d, "*.xls*"))):
        b = os.path.basename(p)
        if b.startswith("~$") or b.startswith("_MAU_") or any(fnmatch.fnmatch(b, x) for x in pats):
            continue
        out.append(p)
    return out


def ingest(source_id, **kw):
    """Mọi file lạ của một nguồn → ({bảng chuẩn: [dòng]}, [dòng báo cáo])."""
    tables, report = {}, []
    for path in stray_files(source_id):
        ad = next((a for a in ADAPTERS if a["source"] == source_id and a["detect"](path)), None)
        b = os.path.basename(path)
        if not ad:
            report.append(dict(file=b, adapter=None, rows=0,
                               note="chưa có bộ chuyển cho dạng file này — file đang KHÔNG được đọc"))
            continue
        got, miss = ad["convert"](path, **kw) if kw else ad["convert"](path)
        for k, v in got.items():
            tables.setdefault(k, []).extend(v)
        report.append(dict(file=b, adapter=ad["id"], rows=sum(len(v) for v in got.values()), miss=miss,
                           note=f"{ad['name']} → {' · '.join('%s %d dòng' % (k, len(v)) for k, v in got.items() if v) or 'không có dòng nào'}"))
    return tables, report


def merge(std, raw, key, label="", match=None):
    """File chuẩn THẮNG từng ô; file lạ chỉ điền chỗ trống và thêm dòng chưa có.

    `match(raw_row, std_rows)` cho phép khớp lỏng hơn khoá cứng: file lạ ghi theo CỬA HÀNG
    còn file chuẩn ghi theo BRAND thì vẫn là một dòng, không được tách thành hai (sẽ cộng đôi
    số hoá đơn). Trả (dòng đã gộp, [dòng báo cáo]) — ghi rõ ô nào được điền từ đâu."""
    idx = {tuple(str(r.get(k) or "") for k in key): r for r in std}
    filled, added = [], []
    for r in raw:
        kk = tuple(str(r.get(k) or "") for k in key)
        cur = idx.get(kk) or (match(r, std) if match else None)
        if cur is None:
            r["_src"] = "raw"
            std.append(r)
            idx[kk] = r
            added.append("/".join(x for x in kk if x))
            continue
        for k, v in r.items():
            if k.startswith("_") or v is None:
                continue
            if cur.get(k) in (None, ""):
                cur[k] = v
                filled.append(f"{'/'.join(x for x in kk if x)}·{k}")
    rep = []
    if added:
        rep.append(f"{label}thêm {len(added)} dòng chưa có ở file chuẩn: {', '.join(added[:6])}"
                   + (" …" if len(added) > 6 else ""))
    if filled:
        rep.append(f"{label}điền {len(filled)} ô còn trống: {', '.join(filled[:6])}"
                   + (" …" if len(filled) > 6 else ""))
    return std, rep


def platform_map():
    """{tên nền tảng / bí danh: Mã ĐT} — lấy từ danh mục đã dựng (01_master.partners)."""
    from monthly_lib import DATA_INPUT, read_workbook
    p = os.path.join(DATA_INPUT, "01_master.xlsx")
    if not os.path.exists(p):
        return {}
    out = {}
    for r in read_workbook(p).get("partners") or []:
        if not r.get("code"):
            continue
        for nm in [r.get("name")] + str(r.get("aliases") or "").split("|"):
            if nm and str(nm).strip():
                out[str(nm).strip()] = r["code"]
    return out


def main(argv):
    ids = [a for a in argv if not a.startswith("-")]
    srcs = [s for s in SOURCES if stray_files(s)]          # quét MỌI nguồn L0, không chỉ nguồn đã có bộ chuyển
    if ids:
        srcs = [s for s in srcs if any(i.lower() in s.lower() for i in ids)]
    print("─" * 74)
    print("CỔNG CHUẨN HOÁ ĐẦU VÀO — file lạ trong thư mục nguồn")
    print("─" * 74)
    for sid in srcs:
        stray = stray_files(sid)
        print(f"\n▸ {sid} · {SOURCES[sid]['name']}")
        print(f"   mẫu tên chuẩn: {SOURCES[sid].get('pattern')}")
        if not stray:
            print("   không có file lạ")
            continue
        if not any(a["source"] == sid for a in ADAPTERS):
            for p in stray:
                print(f"   • {os.path.basename(p)}")
                print("     CHƯA CÓ BỘ CHUYỂN — file đang KHÔNG được đọc. Viết adapter ở tools/l0_ingest.py, "
                      "hoặc đổi tên file cho đúng mẫu chuẩn.")
            continue
        _, rep = ingest(sid, platforms=platform_map()) if sid == "S19_aggregator" else ingest(sid)
        for r in rep:
            print(f"   • {r['file']}")
            print(f"     {r['note']}")
            for m in (r.get("miss") or [])[:8]:
                print(f"     ⚠ {m}")
    print("\nSố đã chuyển được nạp vào lúc dựng (build_mkt.py) — file chuẩn luôn thắng từng ô.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
