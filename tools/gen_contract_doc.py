# -*- coding: utf-8 -*-
"""
SINH LẠI BẢNG SHEET TRONG docs/15_PROCESSED_INPUT_CONTRACT.md TỪ data_contract.json
===================================================================================
    python tools/gen_contract_doc.py

Tài liệu và hợp đồng lệch nhau là chuyện chỉ cần một lần quên. Phần giữa hai mốc
<!-- AUTO:SHEETS --> … <!-- /AUTO:SHEETS --> được sinh lại từ hợp đồng, nên sửa
data_contract.json rồi chạy lệnh này là tài liệu tự đúng.
"""
from __future__ import annotations

import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import CONTRACT, ROOT, SHEETS  # noqa: E402

DOC = os.path.join(ROOT, "docs", "15_PROCESSED_INPUT_CONTRACT.md")
START, END = "<!-- AUTO:SHEETS -->", "<!-- /AUTO:SHEETS -->"

TIER_TITLE = {
    "master": ("A", "`01_master.xlsx` — CHIỀU & KẾ HOẠCH",
               "Đổi khi có cửa hàng mới, target quý mới, ngân sách mới, đối tác mới. "
               "KHÔNG phải file nộp hằng tháng."),
    "monthly": ("B", "`monthly/YYYY-MM.xlsx` — SỰ THẬT THEO THÁNG",
                "Mỗi tháng một file. Cột tháng (`month` / `m`) được loader **tự điền từ tên "
                "file** — bỏ trống cũng đúng."),
    "snapshot": ("C", "`02_snapshot.xlsx` — BẢNG LUỸ KẾ TOÀN KỲ",
                 "Cộng dồn mọi tháng đang có. Nộp lại là THAY THẾ toàn bộ, không nối thêm."),
    "any": ("D", "`_stats` — đặt ở file nào cũng được",
            "Cửa thoát cho con số tổng mà bảng đã cắt top-N không suy lại được."),
}


def fmt_cols(name, spec):
    req = set(spec.get("req") or [])
    key = set(spec.get("key") or [])
    out = []
    for c in spec.get("cols", []):
        if c in req:
            out.append(f"**{c}**")
        elif c in key:
            out.append(f"_{c}_")
        else:
            out.append(c)
    return " · ".join(out) or "—"


def build():
    lines = []
    for tier in ("master", "monthly", "snapshot", "any"):
        letter, title, blurb = TIER_TITLE[tier]
        names = [k for k, v in SHEETS.items() if v.get("tier") == tier]
        if not names:
            continue
        lines += [f"### TẦNG {letter} · {title}", "", blurb, "",
                  "| Sheet | Cột | Khoá tự nhiên | Loader tự tính |",
                  "|---|---|---|---|"]
        for n in names:
            spec = SHEETS[n]
            lines.append("| `%s` | %s | %s | %s |" % (
                n, fmt_cols(n, spec),
                " + ".join(spec.get("key") or []) or "—",
                " · ".join(spec.get("derived") or []) or "—"))
        lines += [""]
        for n in names:
            d = SHEETS[n].get("desc")
            if d:
                lines.append(f"- **`{n}`** — {d}")
        lines += [""]
    lines += ["> Cột **đậm** là bắt buộc · cột _nghiêng_ nằm trong khoá tự nhiên "
              "(trùng khoá thì file đọc sau thắng).", ""]
    return "\n".join(lines)


def main():
    if not os.path.exists(DOC):
        print("Chưa có %s — tạo file rồi chèn hai mốc %s / %s" % (DOC, START, END))
        return 1
    s = io.open(DOC, encoding="utf-8").read()
    if START not in s or END not in s:
        print("Không thấy mốc %s … %s trong %s" % (START, END, os.path.basename(DOC)))
        return 1
    head, rest = s.split(START, 1)
    _, tail = rest.split(END, 1)
    io.open(DOC, "w", encoding="utf-8").write(
        head + START + "\n" + build() + END + tail)
    n = sum(1 for v in SHEETS.values())
    print("Đã sinh lại bảng %d sheet trong docs/%s" % (n, os.path.basename(DOC)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
