# 50 · LỘ TRÌNH THEO GIAI ĐOẠN — ĐÃ XONG GÌ, CÒN GÌ

> Dùng file này để quyết định **nâng cấp cái gì tiếp theo**.
> Mỗi giai đoạn ghi rõ: module nào, điều kiện dữ liệu, và trạng thái thật hiện nay.

---

## 1. Bảng lộ trình P1 → P9

| GĐ | Nội dung | Module | Điều kiện dữ liệu | Trạng thái |
|---|---|---|---|---|
| **P1** | ETL `fact_item` + `fact_bill` + `fact_sales_daily` · 11 chốt QA | D1 · D2 | ✅ đủ T1–T8/2026 | ✅ **xong** |
| **P2** | Tầng L3 metric · Scorecard · Doanh thu | M0 · M1 | ✅ đủ | ✅ **xong** |
| **P3** | Công suất & Kênh *(daypart · kênh · khu vực · nhân viên)* | M3 | ✅ đủ — **trừ vòng quay bàn** | ⚠️ **gần xong** |
| **P4** | Khuyến mãi 4 bản chất · Ngân sách Q3 | M8 · M4 | ✅ đủ | ✅ **xong** |
| **P5** | Menu & Biên lợi nhuận | M2 | ⚠️ **chờ COGS ≥ 90%** *(hiện 46,3%)* | ⚠️ **khung xong, số thiếu** |
| **P5.5** | `lib_benchmark` + cổng duyệt 3 kịch bản | M6 | ⛔ cần tích luỹ lift thật sau mỗi campaign | ⛔ **chưa dựng** |
| **P6** | CRM · Booking | M9 · M11 | ✅ đủ *(nhận diện khách chỉ 8,6%)* | ✅ **xong** |
| **P7** | Digital Ads *(Meta ✅ · Google ✅ · Zalo ⛔)* · Partnership | M5 · M9 | ⚠️ chờ Zalo Ads + aggregator export | ⚠️ **một phần** |
| **P8** | Content & Social · Branding & POSM · CX | *(chưa có tab)* | ⛔ chờ nguồn | ⛔ **chưa dựng** |
| **P9** | Insight tự động · **Trung tâm Báo cáo tháng (R2)** | R1 · R2 | ✅ đủ cho R1 | ⚠️ **R1 xong, R2 chưa** |

---

## 2. Việc tiếp theo — xếp theo tỷ lệ giá trị / công sức

### Nhóm A · Không cần thêm dữ liệu, chỉ cần màn hình — ✅ **ĐÃ XONG 09/09/2026**

11/15 khoá bị bỏ phí đã được gắn lên màn hình — xem [`14_L4_OUTPUT_CONTRACT.md`](14_L4_OUTPUT_CONTRACT.md) §4.

| Việc | Module | Trạng thái |
|---|---|---|
| Bảng kênh hiển thị Google | M5 | ✅ **Maps 2.737đ/chuyển đổi, rẻ hơn 3,0× Mạng hiển thị** |
| Bảng cụm từ tìm kiếm | M5 | ✅ 2.567 cụm · 96,5% tìm theo nhu cầu, không theo tên brand |
| Phễu voucher theo tháng | M8 | ✅ 6.264 phát · 2.129 dùng · 4.135 nằm im |
| Member đăng ký + KPI CRM | M8 | ✅ phơi bày bảng tay mới điền 1/6 tháng |
| Thời gian ngồi bàn theo cửa hàng | M3 | ✅ có đường TB chuỗi 55 phút |
| Cơ cấu phương thức thanh toán | M3 | ✅ AOV VISA 477k vs tiền mặt 334k |
| Cơ cấu theo Nhóm món | M2 | ✅ Top 18 nhóm |
| Bản đồ mã CTKM ↔ Campaign ID | M9 | ✅ |

**Còn lại:** `pre_stat` *(M6 cố ý tính lại vì có bộ lọc brand)* · `core7` · `MKT.meta` — không phải thiếu sót.

### Nhóm A2 · Engine phân tích — ✅ **ĐÃ XONG 09/09/2026**

`src/utils/analytics.ts` — bốn năng lực mới, dùng chung cho mọi module:

| Năng lực | Công thức | Đã gắn vào |
|---|---|---|
| **Bóc tách nguyên nhân** | `ΔNet = ΔGuest·TA₀ + Guest₀·ΔTA + ΔGuest·ΔTA` | R1 · thẻ + biểu đồ thác nước |
| **Phát hiện bất thường** | z-score trên chuỗi MoM **riêng của từng cửa hàng**, ngưỡng ±1,5σ | R1 · bảng |
| **Same-store** | chỉ so cửa hàng có mặt ở cả hai kỳ, kèm số “tính cả cửa hàng mới” để thấy phần thổi phồng | R1 · 3 thẻ |
| **Đóng góp theo cửa hàng** | `% mức biến động` trên tổng **trị tuyệt đối** *(không lấy tổng đại số — tăng và giảm sẽ triệt tiêu nhau)* | R1 · bảng |

Kết quả thật T6→T7: doanh thu **+272,1tr, trong đó 78% do LƯỢNG KHÁCH** (Guest 19.011 → 19.829),
chỉ 59,2tr do TA tăng. NJFB The Crest đóng góp +164,7tr (37,1% mức biến động),
NCB The Mett kéo xuống −85,6tr.

### Nhóm B · Cần một nguồn dữ liệu, mở khoá cả một tầng

| # | Cần gì | Ai cấp | Mở khoá |
|---|---|---|---|
| 1 | **COGS 1.200 SKU** — ưu tiên nhóm Nhật NJFB (~500tr/tháng) | Bếp + Cost control | Toàn bộ M2 · CM% · Menu Class đủ · Prime Cost |
| 2 | **Số chỗ ngồi mỗi bàn** *(đã có 217 bàn · 18 khu vực · giờ tới phút)* | Ops | Vòng quay bàn · doanh thu/chỗ ngồi · tỷ lệ lấp đầy → hoàn tất P3 |
| 3 | **Chi phí nhân sự & mặt bằng** theo store × tháng | Kế toán | `fact_cost` → Prime Cost · lãi gộp theo cửa hàng |
| 4 | **Zalo Ads** — 34,4tr Q3 chưa ghi nhận chi tiêu nào | MKT | Hoàn tất bức tranh 3 kênh ở M5 |
| 5 | **Aggregator export** (Grab Dine Out · Dining City) | Partnership | M9 hết phải điền tay |
| 6 | **Meta Insights organic** | MKT | Mở tab Content & Social (P8) |
| 7 | **Đánh giá khách Google/Facebook** | MKT | Mở tab CX (P8) |
| 8 | **NDC Berkley** — chưa xuất hiện trong file POS nào | Ops | Đã khai báo trong `DIM_STORE` nhưng chưa có số |

### Nhóm C · Cần viết logic mới

| Việc | Module | Vì sao đáng làm |
|---|---|---|
| **Đo Lift thật + store đối chứng** | M7 | Hiện M7 chỉ hiện doanh thu *chạm* CTKM, chưa đo **tăng thêm**. Không có bước này thì mọi ROI đều là tự huyễn hoặc |
| **`lib_benchmark`** — ghi lift thật sau mỗi campaign | M6 | Biến `Growth%` từ ô gõ tay thành ô tính tự động. **Tài sản dài hạn giá trị nhất hệ thống tạo ra** |
| **Cổng duyệt 3 kịch bản** (thận trọng p25 · cơ sở trung vị · lạc quan p75) | M6 | Quy tắc: ROI ở kịch bản thận trọng ≥ 0 mới được chạy |
| **R2 · Trung tâm Báo cáo tháng** | mới | Sinh file 17 sheet tự động, chỉ rõ ô nào máy điền / ô nào người điền |
| **GitHub Action tự chạy ETL** | hạ tầng | Bỏ hẳn bước chạy tay — push file raw là Vercel có số mới |
| **3 chốt QA bổ sung** (#12 · #13 · #14) | D1 | Xem [`40_QA_GATES.md`](40_QA_GATES.md) |

---

## 3. Về R2 — điểm quan trọng của thứ tự

**R2 (sinh báo cáo tháng tự động) chỉ cần P1 → P4 là đã thay được phần lớn công việc thủ công hiện tại.**
Không cần chờ đủ 17 module.

Hiện NOIRE vận hành **hai hệ thống tách rời**: Analytics Hub (dashboard liên tục, dựng từ POS)
và Báo cáo MKT tháng (Excel 17 sheet + deck 24 slide, dựng tay từ hàng chục nguồn, 10 team cùng điền —
**team chỉ điền được 5/17 sheet**). Hai thứ đo cùng một doanh nghiệp, dùng cùng một tập số,
nhưng chạy hai đường khác nhau.

**NT5 đảo ngược cách làm:** thay vì *thu thập → tổng hợp → báo cáo*,
quy trình mới là *hệ thống luôn sẵn số → cuối tháng bấm xuất → người viết nhận định*.

Ánh xạ module → sheet báo cáo tháng:

| Sheet báo cáo | Module sinh số |
|---|---|
| `SCORECARD` | M0 |
| `Business-Data` | M1 |
| `Product-Promotion` | M2 *(phần món)* + M7 *(phần chương trình)* |
| `Digital-Ads` | M5 |
| `Budget` | M4 |
| `CRM` | M8 |
| `Partnership` · `Aggregator` | M9 |
| `Booking-Event` | M10 |
| `Content (NCB/NDC/NJFB)` · `Branding` · `CX` | ⛔ chưa có nguồn (P8) |

> **Action Plan không nằm trong hệ thống.** Phần kế hoạch hành động vẫn do team quản lý ở báo cáo tháng.
> Hệ thống dừng ở phát hiện và bóc tách nguyên nhân.

---

## 4. Nợ kỹ thuật đã biết trong repo

| Vấn đề | Ảnh hưởng | Hướng xử lý |
|---|---|---|
| `data*.json` tồn tại ở 2 nơi, chép tay | dễ lệch bản | ✅ **đã xử lý** — JSON giờ **sinh ra tự động** từ `data_input/*.xlsx`, nằm trong `.gitignore` |
| Không có `.gitignore` | `_cache/` 14,6MB · `dist/` 1,7MB sẽ lọt vào repo | ✅ **đã xử lý** |
| `find_root()` không tìm được gốc trên máy này | ETL không chạy được | ✅ **đã xử lý** — thêm `NOIRE_ROOT` + `L0_input/` |
| 10 import thừa + hàm `escapeHtml` chết trong `src/` | bundle nặng thêm | ✅ **đã xử lý** — bundle index giảm ~6 KB |
| Bảng cụm từ tìm kiếm Google lẫn dòng `Tổng số:` | 4 dòng cộng dồn đứng đầu bảng xếp hạng | ✅ **đã xử lý** ở cả hai lane — số đúng là 2.567 cụm |
| ~~Hai nhánh output song song~~ | ~~2 chỗ phải sửa khi đổi biểu đồ~~ | **Đã xử lý 10/09/2026.** Nhánh HTML tĩnh chuyển vào `_archive/`. Lý do không phải dung lượng mà là **nguồn số**: nó dựng từ `data.json` ở gốc (lane thô) trong khi app dựng từ `data_input/` (lane chính) — hai nguồn khác nhau nên số **có thể** lệch. Cần gửi báo cáo ra ngoài thì dùng nút In Báo Cáo → PDF |
| Nhiều `qa_log_*.txt` tích tụ ở gốc dự án | rối mắt | Đã `.gitignore`; giữ ở máy local vì là bằng chứng |
| `_cache/` không tự vô hiệu khi sửa nội dung file cũ | “số không đổi” | Chỉ ảnh hưởng lane thô. Đã ghi vào runbook; có thể nâng cấp: so `mtime` file Excel với pickle |
| 6 hệ thống phân tích chạy song song ngoài repo *(31 file .py · 15.276 dòng · 11 dashboard HTML · 53,6MB cache trùng)* | lệch số giữa các báo cáo | Không viết lại tool nào — chỉ đổi đầu vào sang đọc `data.json` của Hub. Xem tab **D2** |

---

## 5. Ba nguyên tắc khi nâng cấp

1. **Không nới ngưỡng QA để tab trông đẹp hơn.** Ngưỡng là hợp đồng, không phải tham số.
2. **Không tính lại chỉ số ở tầng view.** Công thức chỉ tồn tại ở L3 (NT2).
   Nếu view cần một chỉ số mới, thêm nó vào ETL rồi mới dùng.
3. **Không hiển thị chỉ số tính trên mẫu thiếu như thể là toàn bộ.**
   Luôn ghi cỡ mẫu bên cạnh — ví dụ *“CM% tính trên 46,3% doanh thu — 1.200 SKU chưa có giá vốn”*.
