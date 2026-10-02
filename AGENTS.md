# QUY TẮC BẮT BUỘC KHI SỬA CODE — NOIRE ANALYTICS HUB

> Áp dụng cho mọi người và mọi trợ lý AI (Claude Code, Codex…) sửa repo này.
> Đây là nơi DUY NHẤT ghi các quy tắc làm việc — `CLAUDE.md` chỉ nạp lại file này.
> Kiến trúc và nguyên tắc dữ liệu (NT1–NT5) vẫn ở `docs/00_INDEX.md`; tra cổng → file ở `docs/20_BAN_DO_MODULE.md` §2.

---

## QT1 · Đọc code cổng nào thì sửa cổng đó — không xoá code hệ thống

1. **Chỉ sửa trong phạm vi cổng được giao** (M0 … M11, D1, D2, R1):
   view của cổng trong `src/views/` (+ thư mục con riêng của cổng, vd. `src/views/ads/`, `src/views/crm/`)
   và tài liệu `docs/modules/<Mã>.md` của cổng đó.
2. **Không xoá, đổi tên, viết lại code hệ thống dùng chung:**
   `src/context/` · `src/components/` · `src/utils/` · `src/data/index.ts` · `src/App.tsx` ·
   `scripts/` · `tools/` · `api/` · `data_contract.json` · `data_sources.json` · `build_hub.py` · `build_mkt.py` · `update.py`.
   Bắt buộc phải đụng tới thì **chỉ được THÊM** (prop / tham số / hàm tuỳ chọn, giá trị mặc định giữ nguyên
   hành vi cũ để các cổng khác không đổi) và phải ghi rõ trong báo cáo + commit.
3. **Thấy lỗi ở cổng khác trong lúc làm → ghi lại và báo, không tự sửa.** Muốn sửa thì làm thành việc riêng cho cổng đó.
4. **Không đụng thay đổi chưa commit ngoài phạm vi cổng** (xem `git status` trước khi làm) — đó có thể là việc dở của người khác.
5. Sửa cổng nào thì **cập nhật `docs/modules/<Mã>.md`** của cổng đó cho khớp code.
6. Lỗi số liệu nằm ở **dữ liệu nguồn** (POS nhập sai…) thì báo nguồn sửa; không vá bằng hằng số trong view (NT1, NT2).

## QT2 · Quy chuẩn hiển thị tăng / giảm — áp dụng cho MỌI khung có so sánh

| Hướng | Icon (`lucide-react`) | Màu | Số |
|---|---|---|---|
| **Tăng** | `TrendingUp` | xanh `text-status-ok` | có dấu `+` |
| **Giảm** | `TrendingDown` | đỏ `text-status-bad` | có dấu `-` |
| Không đổi (\|Δ\| < 0,01%) | `Minus` | xám `text-brand-muted` | `0.0%` |
| Không có kỳ so sánh | — | xám | `—` (không ghi 0) |

1. **Luôn có cả icon lẫn màu** — chỉ đổi màu chữ, hoặc chỉ ghi `+12%` bằng chữ trơn, là chưa đạt.
2. **Luôn ghi nhãn kỳ so sánh** cạnh con số: `vs T8/26` · `T9/26 vs T8/26` · `vs kỳ trước`.
3. **Không để khung mất so sánh im lặng.** Không có kỳ liền trước cùng độ dài thì so tháng cuối kỳ với tháng
   liền trước (ghi rõ nhãn, vd. `T9/26 vs T8/26`); không có cả hai thì hiện `—` kèm lý do.
4. **Cách làm đúng:**
   - Thẻ KPI: dùng `MetricCard` với `curRawValue` + `prevValue` (+ `deltaLabel` cho nhãn kỳ) —
     component tự vẽ icon + màu theo bảng trên. **Không** nhét phép so sánh vào `customDeltaText` dạng chữ trơn.
   - Bảng / dòng chữ / so sánh nằm trong `customDeltaText`: dùng `<DeltaText change={…} label="vs T8/26" />`
     (`src/components/common/DeltaText.tsx`, thêm `inverse` cho chỉ số càng thấp càng tốt) — không tự viết lại
     logic icon + màu trong view.
5. **Ngoại lệ — chỉ số “càng thấp càng tốt”** (CPA, CPL, CPM, chi phí / đơn, % huỷ, % giảm giá, giá vốn…):
   icon vẫn theo hướng thật (tăng = `TrendingUp`) nhưng màu theo tốt / xấu — **tăng = đỏ, giảm = xanh**
   (như `costDelta` của M5). Chỉ số nào áp ngoại lệ phải ghi trong `docs/modules/<Mã>.md` của cổng.
6. Chỉ số là **tỷ trọng / tỷ lệ đạt** (vd. “16,9% DT brand”, “% đạt kế hoạch”) không phải phép so sánh kỳ —
   không gắn icon tăng / giảm.

## QT3 · Chứng minh không làm vỡ trước khi báo xong

1. `node scripts/build-data.mjs` — chốt QA không được đỏ thêm so với trước khi sửa.
2. `node ./node_modules/typescript/bin/tsc --noEmit` — sạch lỗi.
3. Mở đúng cổng trên localhost (`CHAY_LOCALHOST.bat`), xem số và màu tăng / giảm hiển thị đúng; không có `NaN` / `undefined`.
