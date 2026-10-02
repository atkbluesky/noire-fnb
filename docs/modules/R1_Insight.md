# R1 · INSIGHT & CẢNH BÁO

| | |
|---|---|
| **Câu hỏi** | Có gì bất thường, nguyên nhân do đâu? |
| **`activeView`** | `r1` |
| **View** | `src/views/InsightsView.tsx` |
| **ETL** | tổng hợp từ mọi khoá — không có mục ETL riêng |
| **Engine** | `src/utils/analytics.ts` |
| **Giai đoạn** | P9 |
| **Trạng thái** | ✅ **đã có bóc tách nguyên nhân + phát hiện bất thường** *(09/09/2026)* |

---

## 1. Chuỗi trace

R1 là module duy nhất **đọc ngang qua mọi khối**:

```
HUB : store_month · nature · product_stat · identify · bom_stat · meta · stores
MKT : budget · gads_stat · voucher_join
   → InsightsView
```

## 2. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Kỳ Dữ Liệu Trọn Vẹn · Net Sales kỳ trọn gần nhất · Net TB/ngày |
| **Bóc tách nguyên nhân biến động** | 4 thẻ + biểu đồ thác nước — do lượng khách hay do chi tiêu |
| **Tăng trưởng same-store** | số thật · số tính cả cửa hàng mới · phần chênh do mở mới |
| **Biến động bất thường ±1,5σ** | bảng, kèm cột nguyên nhân từng cửa hàng |
| **Cửa hàng nào kéo con số chung đi** | bảng, xếp theo trị tuyệt đối mức biến động |
| Danh sách cảnh báo tổng hợp | rút từ các module, lọc theo Nguy cấp / Cảnh báo / Điểm sáng |

## 3. Engine phân tích — `src/utils/analytics.ts`

Bốn năng lực, dùng chung cho mọi module (NT2: view không tự tính lại):

### ❶ Bóc tách nguyên nhân — `decompose()`

```
Net = Guest × TA

ΔNet = ΔGuest·TA₀  +  Guest₀·ΔTA  +  ΔGuest·ΔTA
       └─ do lượng ─┘  └─ do chi tiêu ─┘  └─ tương tác ─┘
```

Ba thành phần cộng lại **đúng bằng** ΔNet — kiểm chứng được bằng số học.
Yếu tố nào chiếm ≥ 60% mức biến động thì được gọi là yếu tố chi phối; dưới ngưỡng đó ghi “cả hai”.

**Kết quả thật T6→T7/2026:** Net **+272,1tr (+5,6%)**, trong đó
**+210,3tr do LƯỢNG KHÁCH** (Guest 19.011 → 19.829) và chỉ +59,2tr do TA (257k → 260k).
→ *“Doanh thu tăng chủ yếu do LƯỢNG KHÁCH — chiếm 78% mức biến động.”*

### ❷ Phát hiện bất thường — `detectAnomalies()`

z-score trên chuỗi tăng trưởng MoM **của riêng từng cửa hàng**, ngưỡng ±1,5σ.

> So một cửa hàng với trung bình chuỗi là sai — cửa hàng nhỏ luôn trông “bất thường”.
> Phải so với chính lịch sử của nó.

Chuỗi nền loại bỏ kỳ đang xét, để kỳ bất thường không tự kéo trung bình theo mình.
Cần tối thiểu 5 kỳ để có ý nghĩa thống kê.

### ❸ Same-store — `sameStore()`

Chỉ so cửa hàng có mặt ở cả hai kỳ, **kèm luôn con số “tính cả cửa hàng mới”**
để nhìn thấy phần tăng trưởng bị thổi phồng do mở mới.

### ❹ Đóng góp theo cửa hàng — `storeContributions()`

Mẫu số là tổng **trị tuyệt đối** mức biến động, không phải tổng đại số —
nếu lấy tổng đại số, cửa hàng tăng và giảm triệt tiêu nhau và tỷ trọng vọt lên vô nghĩa.

**Kết quả thật T7/2026:** NJFB The Crest +164,7tr (37,1% mức biến động, do lượng khách) ·
NCB SKC +109,8tr (24,8%) · **NCB The Mett −85,6tr (−19,3%, do lượng khách)**.

### ❺ Ngày có số khách vô lý trên POS — `guestOutliers` (trong `InsightsView.tsx`, thêm 02/10/2026)

Bóc tách ❶ tin vào Guest. Một ngày gõ nhầm ô "số khách" đủ làm nó đọc sai nguyên nhân:
**NCB Empress Tower 29/09/2026 ghi 5.133 khách / 76 hoá đơn** (ngày thường ~96) → T9 hiện
"Guest 19.500 → 25.302, TA 270k → 219k, tăng do lượng khách", trong khi bỏ phần dư thì Guest
19.500 → ~20.265 và TA 270k → ~273k — cả hai chỉ nhích nhẹ.

| | |
|---|---|
| Luật | số khách ngày ≥ **5×** trung vị ngày của chính cửa hàng trong tháng **và** dư ≥ **500** khách |
| Nguồn | `daily.json` — tải lười bằng `import('../data/daily')`, không gộp vào chunk R1 |
| Hiện ở | thẻ cảnh báo **Nguy cấp** đầu danh sách + khung đỏ trong khối bóc tách (kèm Guest/TA ước tính sau khi bỏ phần dư) khi ngày lỗi rơi vào hai tháng đang so |
| Không làm | không vá số trong view (NT1) — POS sửa nguồn rồi chạy lại cập nhật |

Bắt được hiện nay: Empress Tower 29/09/2026 (phạm vi cửa hàng chính) · thêm NCB GW 12/05/2026
(1.127 khách / 11 hoá đơn) khi chọn phạm vi "Tất cả".

### Quy chuẩn tăng / giảm (QT2) — sửa 02/10/2026

- Hai thẻ Net kỳ trọn và Net TB/ngày dùng `curRawValue` + `prevValue` + `deltaLabel` (`T9/26 vs T8/26`),
  bỏ chữ trơn `customDeltaText` (từng hiện `++5.3%`).
- Bốn ô bóc tách, cột "MoM kỳ này" (bất thường) và cột "Biến động" (đóng góp cửa hàng) dùng `DeltaText`.
- Thẻ "Kỳ dữ liệu trọn vẹn" tự liệt kê tháng bị loại (trước ghi cứng "Loại trừ tháng T8").
- Cảnh báo Zalo lấy kỳ từ cột tháng của ngân sách và tháng trọn gần nhất (trước ghi cứng "Q3", "hết Tháng 8").
- Cảnh báo Google tạm dừng liệt kê chiến dịch có trạng thái tạm dừng, không lặp tên (trước lấy nhầm `unmapped`).
- Cảnh báo Voucher dùng tỷ lệ nhận diện thật (trước ghi cứng 8,6%).

## 4. Insight Report theo thiết kế — ba phần

Blueprint quy định R1 **không phải bảng số — là kết luận**. Mỗi kỳ sinh ra:

1. **Top 3 biến động bất thường** — vượt ±1,5 độ lệch chuẩn so với xu hướng riêng của chính cửa hàng đó
   *(không so với trung bình chuỗi — cửa hàng nhỏ luôn “bất thường” nếu so ngang)*
2. **Với mỗi biến động: bóc nguyên nhân theo cấu phần** — do Guest hay do TA? do brand nào? do cửa hàng nào?
3. **Ba hành động đề xuất kèm mức tác động ước tính**

**Phần ❶ và ❷ đã dựng xong** *(mục 3 ở trên)*. Còn lại **phần ❸ — ba hành động đề xuất
kèm mức tác động ước tính** — đây là bước cuối để hệ thống đi từ *bóc tách* sang *quyết định*.

## 5. Bốn quyết định mà hệ thống phải kết thúc bằng

Blueprint 11.3 ❿: *một hệ thống phục vụ kinh doanh phải kết thúc bằng quyết định, không phải biểu đồ.*
Mỗi quyết định kèm số tiền ước tính:

| # | Quyết định | Cần module | Trạng thái |
|---|---|---|---|
| 1 | **Cắt món nào khỏi menu** → tiết kiệm bao nhiêu chi phí vận hành | M2 | ⚠️ chờ COGS |
| 2 | **Tăng giá món nào, mức bao nhiêu** → thêm bao nhiêu lợi nhuận | M2 | ⚠️ chờ COGS |
| 3 | **Thêm/bớt người ca nào** → tiết kiệm bao nhiêu chi phí nhân sự | M3 | ⛔ chờ `fact_cost` |
| 4 | **Dồn marketing vào cửa hàng/khung giờ nào** → thêm bao nhiêu doanh thu | M3 + M5 | ✅ dữ liệu đã đủ |

**Quyết định #4 đã đủ dữ liệu để dựng ngay** — daypart, kênh, khu vực, chi tiêu ads theo cửa hàng đều có.

## 6. Bộ lọc

Brand · Từ · Đến · scope · perday. Toàn bộ engine phân tích chạy lại theo bộ lọc —
đổi brand hay bật/tắt cửa hàng satellite thì bóc tách và bất thường tính lại đúng phạm vi đó.

## 7. Checklist nâng cấp

- [x] ~~**Phát hiện bất thường ±1,5σ** trên xu hướng riêng của từng cửa hàng~~ ✅ `detectAnomalies()`
- [x] ~~**Bóc tách nguyên nhân theo cấu phần**~~ ✅ `decompose()` + biểu đồ thác nước
- [x] ~~**Same-store** tách khỏi phần thổi phồng do mở cửa hàng mới~~ ✅ `sameStore()`
- [x] ~~**Đóng góp theo cửa hàng**~~ ✅ `storeContributions()`
- [ ] **Ba hành động đề xuất kèm tác động ước tính** — bước còn lại để đi từ *bóc tách* sang *quyết định*
- [ ] Dựng **quyết định #4** (dồn marketing vào đâu) — dữ liệu đã đủ
- [ ] Áp engine bóc tách cho **daypart** và **kênh bán**, không chỉ cho cửa hàng
- [ ] Xuất `.md` để đọc nhanh · `.xlsx` để gửi · `.pptx` khi cần trình bày
- [ ] Hiển thị **`pre_stat`** làm số đối chiếu “toàn bộ danh sách” khi đang lọc theo brand

> **Action Plan không nằm trong hệ thống.** Phần kế hoạch hành động vẫn do team quản lý ở báo cáo tháng.
> Hệ thống dừng ở **phát hiện và bóc tách nguyên nhân**.
