# M10 · PARTNERSHIP

| | |
|---|---|
| **Câu hỏi** | Hợp tác đối tác mang lại gì? |
| **`activeView`** | `m10` |
| **View** | `src/views/PartnershipView.tsx` |
| **ETL** | `tools/build_month.py` — `read_partnership()` |
| **Nguồn** | `01_master.xlsx`: `partners` · `partner_camp`<br>`monthly/YYYY-MM.xlsx`: `partner_month` |
| **Giai đoạn** | P7 |
| **Trạng thái** | ⚠️ **Danh mục đủ · số dùng voucher chưa đo được** |

---

## 1. Chuỗi trace

```
S15 Partnership
   ├─ sheet "1. Đối Tác"  → partners[]     (code · name · kind · brand · start · end · status · media)
   └─ sheet "2. Mã CTKM"  → partner_camp[] (code ↔ Campaign ID iPOS ↔ cơ chế ↔ mức giảm)  ← CHƯA DÙNG
S11 voucher → lọc theo Campaign ID iPOS của từng đối tác
   → gắn ngược vào partners[]: issued · used · use_rate · rev · disc
      → PartnershipView
```

**Cơ chế gắn kết quả:** mỗi đối tác có một hoặc nhiều `Campaign ID iPOS` khai trong sheet “2. Mã CTKM”.
ETL lọc `fact_voucher` theo các ID đó rồi gắn ngược kết quả thật vào dòng đối tác.
Đây là lý do voucher là kênh đo được — xem [`M9_CRM.md`](M9_CRM.md) §4.

## 2. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Đối Tác Danh Mục · Tổng Mã Voucher Phát · Tỷ Lệ Sử Dụng Mã · Giá Trị Media Quy Đổi |
| **Danh mục hợp tác đối tác chiến lược** | |
| **Tỷ lệ sử dụng kho mã theo từng chương trình** | |

## 3. Phát hiện đáng chú ý

**5 đối tác trong danh mục. TCB × OneU phát 3.000 mã, mới dùng 5 = 0,2%.**

Con số này là ví dụ điển hình cho việc *phát mã không đồng nghĩa với có khách*.
Tỷ lệ sử dụng kho mã nên là chỉ số chính khi đàm phán gia hạn hợp tác,
chứ không phải số mã đã phát.

## 4. Bộ lọc

Brand · Từ · Đến. Lọc brand áp cho danh mục đối tác và voucher đối tác.

## 5. ⛔ Đang thiếu gì

| Thiếu | Hệ quả |
|---|---|
| **Export Grab Dine Out · Dining City** | Phần aggregator hiện chỉ có số team điền tay, không đối soát được |
| `partner_camp` chưa lên màn hình | Người đọc không thấy được cách kết quả được gắn cho đối tác |
| Chưa tách phần NOIRE trả vs phần nền tảng trả | Quy ước `PARTNER` yêu cầu ghi rõ hai phần này |

**Ngưỡng độ sâu cho aggregator:** kênh chiếm dưới 1% doanh thu chuỗi chỉ báo cáo 3 dòng,
không dựng slide riêng. Grab hiện 0,2% — nên M9 tập trung vào đối tác voucher, không vào aggregator.

## 6. Checklist nâng cấp

- [x] ~~Dùng `partner_camp`~~ ✅ bảng mã CTKM ↔ Campaign ID iPOS
- [ ] **Tách phần NOIRE trả vs phần nền tảng trả** cho mỗi chương trình `PARTNER`
- [ ] **Xin cổng đối tác hoặc file đối soát** của Grab Dine Out / Dining City
- [ ] Thêm chỉ số **giá trị media quy đổi ÷ chi phí ưu đãi** — đo hiệu quả trao đổi
- [ ] Cảnh báo đối tác sắp hết hạn *(đã có `end` trong `partners`)*
- [ ] Cảnh báo kho mã tỷ lệ dùng < 5% — như TCB × OneU

---

## `partner_month` — lát cắt theo tháng

Sheet `partners` giữ con số **luỹ kế cả chương trình**, nên thanh lọc Từ–Đến không có tác
dụng với nó. `partner_month` là lát cắt từng tháng để bộ lọc hoạt động thật.

Nguồn hiện tại: `05 Data Raw/Partnership/eVoucher … _TN.YYYY.xlsx`. **Những file này chỉ là
DANH SÁCH MÃ ĐÃ PHÁT** — một cột `Mã khuyến mãi`, không có lượt dùng, không có doanh thu.
Vì vậy ETL chỉ điền `issued`; `used` · `rev` · `disc` để **trống**.

T8/2026: Techcombank Reward × OneU phát 4.500 mã (3.000 NCB + 1.500 JFB).

**Cột "Tỷ lệ dùng" hiện `—`, không phải `0,0%`.** Bản trước hiện `0,0%` vì `n0(null) = 0`, và
`0,0%` đọc ra là "chương trình thất bại hoàn toàn" — một kết luận sai khi chưa hề đo.

Để đo được lượt dùng, cần export log voucher iPOS của đúng Campaign ID khai ở `partner_camp`
(Techcombank = `337795`).

**Lưu ý đọc file:** hai file eVoucher này không khai `dimension` trong XML, nên `openpyxl` ở
chế độ `read_only` báo 1 dòng. ETL gọi `ws.reset_dimensions()` trước khi đọc.
