# -*- coding: utf-8 -*-
"""
BÁO CÁO KIỂM KÊ L0 — một hàm dựng báo cáo, dùng chung cho check_input.py và update.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from monthly_lib import (  # noqa: E402
    L0_ROOT, L0_WHY, SOURCES, SOURCES_DOC, l0_scan, last_closed_month,
)

ICON = {"OK": "[OK]    ", "THIEU_THANG": "[THIẾU T]", "TRONG": "[TRỐNG] ", "KHONG_CO_THU_MUC": "[KO THƯ MỤC]"}


def build_report(until=None):
    """→ (dòng văn bản, số lỗi bắt buộc, danh sách việc cần làm)."""
    until = until or last_closed_month()
    rep = l0_scan(until)
    out, todo = [], []
    out += ["=" * 78, "NOIRE — KIỂM KÊ FILE EXCEL THÔ (L0_input)", "=" * 78,
            f"Gốc dữ liệu : {L0_ROOT}",
            f"Chọn vì     : {L0_WHY}",
            f"Mốc báo thiếu: các tháng tới hết {until} (tháng đang chạy dở không báo đỏ)",
            "-" * 78]
    group = None
    for r in rep:
        g = r["dir"].split("/")[0]
        if g != group:
            group = g
            out.append(f"\n■ {g} — {SOURCES_DOC.get('groups', {}).get(g, '')}")
        req = " (BẮT BUỘC)" if r["required"] else ""
        out.append(f"{ICON[r['state']]} {r['id']:<18} {r['name']}{req}")
        out.append(f"           {r['dir']}/")
        if r["state"] in ("TRONG", "KHONG_CO_THU_MUC"):
            out.append(f"           → chưa có file nào khớp `{r['pattern']}`")
            todo.append((r["required"], f"{r['name']}: thả file `{SOURCES[r['id']].get('example')}` vào {r['dir']}/"))
            continue
        if r["months"]:
            out.append(f"           có {len(r['months'])} tháng: {r['months'][0]} → {r['months'][-1]}")
        elif r["latest"]:
            out.append(f"           {len(r['files'])} file · bản mới nhất: {r['latest']['file']} (sửa {r['latest']['modified']})")
        if r["missing"]:
            out.append(f"           ✖ THIẾU THÁNG: {', '.join(r['missing'])}")
            todo.append((r["required"], f"{r['name']}: thiếu {', '.join(r['missing'])} → thả vào {r['dir']}/"))
        for m, fs in r["duplicates"].items():
            out.append(f"           ⚠ {m} có nhiều file — dùng bản MỚI NHẤT, bỏ qua: {'; '.join(fs)}")
        if r["unrecognised"]:
            out.append(f"           ⚠ không đọc được tháng từ tên file (bị bỏ qua): {'; '.join(r['unrecognised'][:4])}")
            todo.append((False, f"{r['name']}: đổi tên cho có tháng — {r['unrecognised'][0]}"))
    # ── file SAI MẪU (sheet/cột bắt buộc) ──
    try:
        from l0_validate import validate_all
        bad = validate_all()
    except Exception as e:  # noqa: BLE001
        bad = {}
        out += ["", f"⚠ không chạy được kiểm tra mẫu file: {str(e)[:80]}"]
    if bad:
        out += ["", "✖ FILE SAI MẪU — hệ thống không đọc đúng được, phải xuất lại / sửa tên cột:"]
        for sid, items in bad.items():
            for rel, errs in items:
                out.append(f"  · {rel}")
                out += [f"      {e}" for e in errs]
                todo.append((bool(SOURCES[sid].get("required")), f"{SOURCES[sid]['name']}: SAI MẪU — {rel}"))
    else:
        out += ["", "✔ Mọi file đúng mẫu chuẩn (sheet + cột bắt buộc)."]
    n_ok = sum(1 for r in rep if r["state"] == "OK")
    bad_req = [r for r in rep if r["required"] and r["state"] != "OK"]
    out += ["", "-" * 78,
            f"Đủ: {n_ok}/{len(rep)} nguồn · nguồn BẮT BUỘC chưa đủ: {len(bad_req)}"]
    if todo:
        out += ["", "VIỆC CẦN LÀM (bắt buộc trước):"]
        for i, (req, t) in enumerate(sorted(todo, key=lambda x: not x[0]), 1):
            out.append(f"  {i:>2}. {'[BẮT BUỘC] ' if req else ''}{t}")
    reg = SOURCES_DOC.get("missing_data_register", [])
    if reg:
        out += ["", "Dữ liệu CHƯA CÓ NGUỒN nào (không phải thiếu file — là chưa ai thu thập):"]
        for m in reg:
            out.append(f"  {m['no']:>2}. {m['item'][:54]:<54} chặn {','.join(m['blocks'])}")
    return out, len(bad_req), todo
