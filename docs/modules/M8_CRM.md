# M8 · CRM · VOUCHER

| | |
|---|---|
| **Câu hỏi** | Bán cho ai, họ có quay lại? |
| **`activeView`** | `m8` |
| **View** | `src/views/CRMView.tsx` |
| **ETL** | `build_hub.py` mục K *(nhận diện/quay lại)* + `build_mkt.py` §2 *(voucher)* · §4 *(member/KPI)* |
| **Giai đoạn** | P6 — ✅ xong |
| **Trạng thái** | ⚠️ **Chạy đủ, nhưng tỷ lệ nhận diện khách chỉ 8,6%** |

---

## 1. Chuỗi trace

```
S02 bill → clean_txt(Số điện thoại)  ← BẮT BUỘC: ô rỗng iPOS là ký tự vô hình ​
   → lọc SĐT ≥ 8 chữ số → identify[] (bills · id_bills · rate)
   → đếm số bill/SĐT     → repeat[] · repeat_stat
S11 voucher → khử trùng theo Mã khuyến mãi → voucher_prog · voucher_month · voucher_stat
   → join "Mã giao dịch" ↔ bill_index.pkl → voucher_join (chốt QA #11)
S13 member · S14 KPI CRM → member_month · member_stat · crm_target
   → CRMView
```

## 2. Màn hình hiển thị gì

| Khối | Nội dung | Khoá |
|---|---|---|
| Thẻ KPI | Tỷ Lệ Nhận Diện · Khách Nhận Diện Được · Tỷ Lệ Quay Lại · Khách Đi Nhiều Nhất · Đo bằng nhận diện | `identify · repeat_stat` |
| **Tỷ lệ nhận diện khách theo tháng** | | `identify` |
| **Phân bố tần suất khách ghé thăm** | 1 lần · 2–3 · 4–9 · 10+ | `repeat` |
| **Độ khớp voucher ↔ hoá đơn POS** | | `voucher_join` |

> Zalo OA đã tách khỏi M8 sang [`M8.1 · Zalo OA Performance`](M8_1_Zalo_OA.md).

**Tăng/giảm so tháng trước** *(chuẩn hoá 02/10/2026 theo `AGENTS.md` QT2)*: thẻ Khách đăng ký mới · Lượt chi tiêu · Doanh thu ·
AOV thành viên · Tổng khách luỹ kế và cột “DT vs Tx” của bảng cửa hàng vẽ bằng `DeltaText` — icon + xanh khi tăng, icon + đỏ khi giảm,
nhãn `vs T8/26`. Đã sửa lỗi thẻ Tổng khách luôn ghép dấu `+` kể cả khi số khách giảm.

## 3. ⛔ Điểm nghẽn lớn nhất — nhận diện khách 8,6%

**Chỉ ~8,6% hoá đơn có số điện thoại.** Trong nhóm nhận diện được thì tỷ lệ quay lại rất tốt
(46% quay lại từ 2 lần trở lên, cá biệt có khách 25 lượt/tháng), **nhưng mẫu quá nhỏ để kết luận**.

> **Nâng tỷ lệ nhận diện lên 30–40% là một dự án riêng, và là điều kiện tiên quyết
> để module CRM có ý nghĩa.**

Đây cũng là lý do hệ thống **cấm dùng ROAS** — không đủ dữ liệu quy doanh thu về quảng cáo.

⚠️ **Bẫy đã chặn:** iPOS xuất ô rỗng thành ký tự vô hình `​`. Nếu không có `clean_txt()`,
`notna()` sẽ báo nhầm và **tỷ lệ nhận diện hiện 100% thay vì 8,6%**. Đừng gỡ hàm này.

## 3b. CRM iPOS theo tháng (thêm 02/10/2026)

Khối đầu màn M8 (`src/views/crm/CRMCustomerSection.tsx`) đọc `crm_*` trong `data_mkt.json`, dựng bởi
`tools/crm_reader.py` (phần `crm` của `tools/build_month.py`):

| Nguồn L0 | File | Cho tháng |
|---|---|---|
| `S27_crm_customer` · `04_CRM/06_CRM_Khach_Hang` | `CRM khách hàng T9.2026.xlsx` (4 sheet iPOS) | từ T9/2026 — **thả mỗi tháng một file** |
| `S28_crm_history` · `04_CRM/07_CRM_Lich_Su` | `CRM_Dashboard_T1-T8.2026.xlsx` | T1–T8 (lượt chi tiêu, voucher T6–T8, ảnh chụp T7–T8) |
| `S30_crm_variance` · `04_CRM/08_Bien_Dong_KH` | `Biến động khách hàng T8.2026.xlsx` | bù cơ cấu lần đầu/2/≥3 + theo cửa hàng + lên hạng cho tháng chưa có file CRM T* (T8 chỉ tới 30/08) |
| `S29_member_revenue` · `04_CRM/05_Doanh_Thu_Thanh_Vien` | `revenue-report_thanh vien T*.csv` | T1–T8 theo cửa hàng |

Bảng: `crm_month` (tháng) · `crm_store` (tháng × cửa hàng) · `crm_snapshot` (ảnh chụp luỹ kế) ·
`crm_dist` (giới tính/kênh/chi tiêu/tuổi) · `crm_rank` (lên hạng, giao dịch theo hạng). Hợp đồng: `data_contract.json`.

**Luật đọc số**
- Ô nguồn không có = `null`, hiện "—", không vẽ 0 (T8 thiếu cơ cấu lần đầu/2/≥3).
- File iPOS lưu `1.517` thành số thực 1,517 → `cnt()` đưa về số nguyên 1517 và đối chiếu bằng tổng cửa hàng.
- **Sheet "Báo cáo voucher" trùng hệt tháng trước bị loại** + cảnh báo (T9: trùng T8 7.780 phát / 2.551 dùng).
- Ảnh chụp luỹ kế khác grain với số trong tháng — không cộng, không so trực tiếp.
- Đăng ký member: số theo NGÀY (member_actual) ưu tiên → tổng tháng file CRM (S27) → CRM_Dashboard (S28).
  T7: ngày = 116, dashboard cũ = 124 (nhập từ ảnh).

---

## 4. Ngược lại — voucher là kênh đo được gần như hoàn hảo

Trước đây ghi nhận liên kết voucher ↔ hoá đơn “gần như chết (2/95)”.
Kiểm tra lại trên toàn bộ 19 file log với đúng khoá join (`Mã giao dịch` ↔ `Mã hoá đơn`):
**tỷ lệ khớp 99,0%** trong phạm vi có dữ liệu hoá đơn.
873 lượt không khớp đều là voucher dùng **năm 2025**, trước khi bảng kê bắt đầu —
**giới hạn phạm vi, không phải lỗi chất lượng**.

> Điều này thay đổi hẳn câu chuyện đo lường: **attribution quảng cáo bị chặn ở 8,6% nhận diện,
> nhưng attribution qua voucher gần như hoàn hảo.**
> **Cơ chế có phát mã nên được ưu tiên hơn giảm giá trực tiếp tại quầy** —
> không chỉ vì kiểm soát chi phí, mà vì **đo được**.

Đây là kết luận có tác động trực tiếp tới thiết kế chương trình khuyến mãi (M7.1) và pre-analytics (M6).

## 5. Cầu nối CRM → doanh thu

`Phiếu GG` và `Thuế` **không** bị trừ khỏi Net. Nghĩa là giá trị voucher đã dùng
vẫn nằm nguyên trong doanh thu — **đây chính là cầu nối để đo đóng góp thật của CRM
sang doanh thu mà không lo double-count**.

## 6. Bộ lọc — nguyên tắc trung thực

Brand · Từ · Đến. Thanh lọc ghi rõ tỷ lệ nhận diện là số toàn chuỗi.

| Lọc brand áp cho | Không tách được |
|---|---|
| voucher *(brand suy từ cột `Nhà hàng sử dụng`)* | tỷ lệ nhận diện |

## 7. Checklist nâng cấp

- [ ] **Dự án nâng tỷ lệ nhận diện lên 30–40%** — điều kiện tiên quyết, nằm ngoài phạm vi code
- [x] ~~Dùng `voucher_month` · `voucher_stat`~~ ✅ phễu 6.264 phát · 2.129 dùng · **4.135 nằm im**
- [x] ~~Dùng `member_month` · `member_stat`~~ ✅ phơi bày bảng tay **mới điền 1/6 tháng**
- [x] ~~Dùng `crm_target`~~ ✅ cột % đạt KPI tô theo 3 ngưỡng
- [ ] **Phễu CRM đầy đủ**: phát → dùng → doanh thu *(hiện chỉ có tỷ lệ khớp)*
- [ ] **Redeem % theo campaign và theo cửa hàng**
- [ ] **So sánh chi tiêu member vs khách vãng lai** — dữ liệu đã đủ trong `fact_bill`
- [ ] **Đóng góp doanh thu từ member** = `Net từ hoá đơn có member ÷ tổng Net`
- [x] Tách Zalo OA sang M8.1 và thay export tay bằng OpenAPI + Webhook

## 8. File `CRM khách hàng T10.2026.xlsx` — bố cục mới (19/10/2026)

Bản xuất T10 (kỳ 01–18/10) khác T9: **mỗi dòng là một chuỗi `Nhãn,Giá trị,Đơn vị` nằm trong ô A**, sheet 3 voucher
chỉ có tổng quan + chi tiết **theo chương trình** (không còn bảng theo cửa hàng), sheet 4 không còn.
`tools/crm_reader.py` được **THÊM** nhánh đọc bản này (nhận biết bằng dòng `Chỉ số,Giá trị`); bản T9 đọc y như cũ (đã đối chiếu: số T9 không đổi).

| Khối | Cách đọc bản T10 |
|---|---|
| Lượt chi tiêu · khách đăng ký | nhãn `Khách đăng ký` · `Lượt chi tiêu` (T9 ghi `Khách hàng đăng ký mới` · `Tổng lượt chi tiêu`) |
| Doanh thu thành viên theo cửa hàng | đã nằm trong sheet 2 (header `Số lượng hóa đơn`) |
| Voucher | `Đã phát hành` · `Đã dùng` · `Tổng doanh thu` (= trước giảm) · `Tổng giảm giá`; **không có voucher theo cửa hàng** nên cột voucher của bảng cửa hàng để trống |
| Ảnh chụp khách | quy về bố cục T9 rồi dùng chung `parse_snapshot_sheet`; nhóm tuổi T10 chỉ có `18-24` · `Không xác định` · `Khác` |
| Tháng chưa trọn | `crm_month.note` = `tháng chưa trọn — số tới 18/10/2026` |

Hạng thành viên: T10 chỉ có bảng *lên hạng*, không có *số giao dịch theo hạng*.

### 8b. Voucher theo chi nhánh T10 (20/10/2026)

File T10 xuất lại có thêm bảng `STT,Chi nhánh,Voucher sử dụng,Tỷ trọng volume (%),Doanh thu trước giảm giá,…`
(10 chi nhánh, dòng `TỔNG CỘNG` = 1.567 dùng · 1,05 tỷ trước giảm · 202,7 tr chi phí giảm).
`tools/crm_reader.py` **THÊM** `_voucher_branch_table()` gọi trong nhánh bản T10 (bản T9 không đổi — đã đối chiếu).

- **Phạm vi khác nhau trong cùng sheet:** tổng quan (`Đã phát hành 1.054 · Đã dùng 269`) chỉ cộng 5 chương trình liệt kê;
  bảng chi nhánh đếm **mọi voucher**. T6–T9 tổng tháng = Σ chi nhánh, nên khi có bảng chi nhánh thì
  `crm_month.v_used / v_rev_* / v_disc` lấy dòng TỔNG CỘNG, còn `v_issued` để **trống** (không ghép phát hành 5 chương trình
  với số dùng mọi voucher). `crm_month.note` ghi rõ.
- **Lệch trong file nguồn** (báo nguồn, không vá): Σ giảm giá 5 chương trình = 21.711.713đ ≠ `Tổng giảm giá` 32.551.400đ.
- View: khối "Báo cáo voucher của CRM iPOS" thêm **bảng Voucher theo chi nhánh** của tháng đang xem
  (Đã dùng · Tỷ trọng · DT trước/sau giảm · Chi phí giảm · % giảm · Giảm TB/voucher + dòng tổng). Không có cột so tháng trước
  vì T10 chưa trọn tháng; tỷ trọng / % giảm là tỷ lệ, không gắn icon (QT2.6). Cột "Dùng ÷ phát" không gắn ⚠ khi thiếu phát hành.
- Bản xuất Excel theo tháng: `bao_cao/M8/M8_Voucher_theo_chi_nhanh_T6-T10.2026.xlsx`.

### 8c. File T10 đủ tháng — bố cục 5 sheet (02/11/2026)

Bản đủ tháng `CRM khách hàng T10.2026.xlsx` (01–31/10) đổi bố cục lần nữa: 5 sheet tên mới (`Tổng Quan & Phân Khúc` ·
`Biểu Đồ & Nhân Khẩu Học` · `Doanh thu thành viên` · `Biến động khách hàng` · `Báo cáo voucher`), hai sheet cuối là chuỗi `a,b,c`
không dấu. `crm_reader.py` cần sheet `2. Biến động khách hàng` nên trả rỗng → **chạy trước** `python tools/crm_normalize.py <tháng>`:
dựng lại file theo bố cục T9, dừng nếu các tổng trong file không khớp, bản gốc dời sang `L0_input/_GOC_iPOS/`. Không sửa `crm_reader.py`.

| Khối | Bản T10 đủ tháng |
|---|---|
| Chỉ số tháng | 880 đăng ký · 1.843 lượt chi tiêu (831 lần đầu · 93 lần 2 · 919 từ 3 lần) · DT thành viên 1,71 tỷ · giảm 177,6 tr |
| Ảnh chụp luỹ kế | 3.812 khách · 7,56 tỷ · 14.144 HĐ · 3 phân khúc |
| Lên hạng | 579 khách (không có *giao dịch theo hạng*) |
| Nhân khẩu học · kênh · mức chi tiêu | **không nạp** — bản gốc chỉ có tỷ lệ *ước tính từ biểu đồ*, không có số khách |
| Voucher | **không nạp** — bản gốc chỉ có e-voucher theo chương trình (1.018 phát · 188 dùng · giá trị 92,4 tr / 14,5 tr), khác phạm vi số voucher T6–T9; số voucher theo chi nhánh của bản tới 18/10 (§8b) bị thay |

`update.py` đổi file `S27` chỉ dựng phần `crm`, bỏ phần `member` (cùng lỗi `_part_map` ghi ở M8.1) → dựng tay:
`python tools/build_month.py <tháng> --parts=member,crm` rồi `node scripts/build-data.mjs`.
Nguồn cần sửa: dòng `IFC Signature by Noire` ở sheet Doanh thu thành viên có Giảm giá 292.500 nhưng trống Doanh thu.
