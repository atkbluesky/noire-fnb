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
