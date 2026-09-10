# M4 · NGÂN SÁCH MARKETING Q3

| | |
|---|---|
| **Câu hỏi** | Kế hoạch chi bao nhiêu, phân bổ cho ai? |
| **`activeView`** | `m4` |
| **View** | `src/views/BudgetView.tsx` |
| **Loader** | `scripts/build-data.mjs` §5 — khối `budget` |
| **Nguồn** | `01_master.xlsx`: `budget_brand` · `budget_extra` · `budget_channel` · `budget_store`<br>`monthly/YYYY-MM.xlsx`: `budget_nonmedia` |
| **Giai đoạn** | P4 — ✅ xong |
| **Trạng thái** | ✅ đủ số *(ngân sách Q3/2026 · chi phí ngoài media từ T8/2026)* |

---

## 1. Vì sao M4 đứng TRƯỚC M5

Trước đây ngân sách nằm rải rác: một phần trong tờ trình Digital, một phần trong sheet Budget
của báo cáo tháng, một phần trong file phân bổ Q3. Không có chỗ nào nhìn được toàn cảnh.

**M4 là khung tham chiếu cho mọi so sánh thực chi ở các module khác.**
Không có nó, *“chi 38,4 triệu”* là một con số vô nghĩa — chỉ khi đặt cạnh *“kế hoạch 48,9 triệu”* mới thành thông tin.

## 2. Chuỗi trace

```
S10 budget (1 file Excel, 4 sheet)
   ├─ Summary                       → total · plan
   ├─ Budget Brand | Brand MKT      → brand[]        (find_header dò tiêu đề)
   ├─ Budget Booking Tiệc + CRM     → extra[]
   └─ Budget Store Ads              → store_ads[] + channel[]
      → data_mkt.json: budget
         → BudgetView
```

Thư mục có 7 file ngân sách — hệ thống **chọn bản đầy đủ nhất** (bản có sheet `Budget Store Ads`)
và ghi lại tên file đã dùng vào `budget.file`.

## 3. Cấu trúc ngân sách Q3/2026 — hai tầng

| | Giá trị |
|---|---|
| Ngân sách gốc Q3 | **606.437.535đ** |
| Tổng đã phân bổ | **601.896.017đ** (99,3%) |
| Chưa phân bổ | 4.541.518đ |

**Tầng 1 — Brand MKT** *(tính theo 2% doanh thu mục tiêu)*: NCB 162,9tr · NDC 179,9tr · NJFB 162,6tr
**Tầng 2 — Extra**: Chạy Tiệc 56,0tr · CRM 63,0tr = **119.024.675đ**

**Trong đó ngân sách quảng cáo — 269.649.567đ (44,8% tổng plan):**

| Kênh | Jul | Aug | Sep | Tổng Q3 |
|---|---|---|---|---|
| Meta Ads | 48,9tr | 61,2tr | 63,3tr | **173,5tr** |
| Google Ads | 17,1tr | 22,1tr | 22,5tr | **61,8tr** |
| Zalo Ads | 11,2tr | 11,4tr | 11,8tr | **34,4tr** |

## 4. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Ngân Sách Gốc Q3 · Tổng Plan Đã Phân Bổ · Plan Brand Đã Chọn · Ngân Sách Ads 3 Kênh |
| **Cấu trúc ngân sách hai tầng** | Brand MKT vs Extra |
| **Ngân sách quảng cáo theo kênh & tháng** | |
| **Tỷ trọng 3 kênh quảng cáo** | |
| **Phân bổ ngân sách quảng cáo theo cửa hàng** | |

## 5. Bộ lọc

Brand · Từ · Đến — nhưng **chỉ có Q3/2026**.
`App.tsx` khai báo `allowedMonths = ['2026-07','2026-08','2026-09']` và ghi chú
*“Dữ liệu chỉ áp dụng cho Kế hoạch Quý 3/2026”* ngay trên thanh lọc.

**Bộ lọc brand chỉ áp cho tầng Brand MKT và bảng cửa hàng.**
Ngân sách Extra và bảng kênh ads không tách được theo brand — điều này ghi rõ trên thanh lọc.

## 6. Bốn cờ đỏ đã phát hiện

**❶ Zalo Ads được cấp 34,4 triệu nhưng chưa có dòng chi tiêu nào.**
Trong đó 30 triệu dành riêng cho mục tiêu tăng follow Zalo OA. Đến hết T8 vẫn chưa ghi nhận.
Hoặc kênh chưa triển khai, hoặc đã chạy mà chưa có nguồn dữ liệu — **khoản nằm im lớn nhất**.

**❷ Chiến dịch Google đã tạm dừng vẫn phát sinh 1.011.131đ với 0 lượt chuyển đổi** — chiếm 32% tổng chi Google.
Chiến dịch `NDC-Phạm Ngọc Thạch` cũng **chưa map được về cửa hàng nào** trong `dim_store`.

**❸ Hai cửa hàng không có ngân sách Google/Zalo nhưng vẫn đang chạy.**
`NOIRE The Mett` và `NOIRE SKC` để trống cột Google và Zalo trong bảng phân bổ Q3,
nhưng thực tế `NCB-SKC-Performance Max` đã chi 746.599đ.

**❹ Tỷ lệ ngân sách quảng cáo trên doanh thu mục tiêu chênh lệch lớn giữa các cửa hàng** —
từ 0,72% (The Mett, SKC) tới 3,20% (JFB SSV). Cửa hàng mới được đầu tư đậm hơn theo tỷ lệ,
hợp lý về chiến lược, nhưng cần theo dõi hiệu quả riêng thay vì so ngang với cửa hàng đã ổn định.

## 7. Checklist nâng cấp

- [ ] **Chỉ số giải ngân** = `thực chi ÷ phần kế hoạch ĐÃ TỚI HẠN` *(không so với cả quý)*.
      Ngưỡng lành mạnh 95–105%; dưới 70% nghĩa là tiền đang nằm im và sẽ dồn áp lực vào tháng cuối
- [ ] Thêm **chốt QA #14** — cảnh báo tự động khi giải ngân ngoài 95–105%
- [ ] Hiển thị **trạng thái “Chặn bởi: …”** cho khoản chưa tiêu được, thay vì để ô trống
- [ ] Nạp ngân sách Q4 khi có — hiện `allowedMonths` hard-code Q3, nên đọc từ `budget` thay vì gán cứng
- [ ] Ghép `dim_cost` để mở phần chi phí ngoài media

---

## Chi phí NGOÀI media — vì sao tách riêng

Sheet `budget_nonmedia` giữ KOL/KOC · POSM & in ấn · sản xuất nội dung · quà tặng · sự kiện,
tách hẳn khỏi media spend.

**Lý do là công thức, không phải thẩm mỹ.** Ad Cost Ratio = Media Spend ÷ Net Sales chỉ có
nghĩa khi tử số là **tiền mua lượt tiếp cận**. Gộp 86 triệu tiền in POSM của T8/2026 vào đó
sẽ đẩy ACR lên gần gấp đôi và dẫn tới kết luận sai rằng quảng cáo đang quá đắt.

Hai khoản đầu tiên được ghi nhận (T8/2026):

| Hạng mục | Ngân sách | Thực chi | % sử dụng |
|---|---|---|---|
| POSM / in ấn | 83,0 tr | 86,1 tr | 103,7% |
| KOL / KOC | 90,0 tr | 17,3 tr | 19,2% |

Nguồn: sheet `Budget` mục **C4** của `NOIRE_Bao_Cao_Promotion AGG - MKT_TN-YYYY.xlsx`.
ETL định vị mục theo **chữ** ("C4.", "Hạng mục") chứ không theo số dòng — biểu mẫu này
thường xuyên được chèn thêm dòng.
