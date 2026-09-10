# M8 · KHUYẾN MÃI & 4 BẢN CHẤT

| | |
|---|---|
| **Câu hỏi** | Bán bằng cách nào, tốn bao nhiêu? |
| **`activeView`** | `m8` |
| **View** | `src/views/PromotionView.tsx` |
| **ETL** | `tools/build_month.py` — `read_pos()` *(nature)* · `read_promotion()` *(aggregator)* |
| **Nguồn** | `monthly/YYYY-MM.xlsx`: `nature` · `aggregator` · `02_snapshot.xlsx`: `campaigns` |
| **Giai đoạn** | P4 — ✅ xong phần phân loại |
| **Trạng thái** | ✅ đủ số · ✅ aggregator từ T8/2026 · ⛔ **chưa đo được Lift** |

---

## 1. Chuỗi trace

```
S01 item → fact_item → cột "Tên CTKM" → classify_nature() → nature (4 nhãn)
   → gộp month × nature × brand  → nature[]     (rev · disc · bills)
   → gộp tên CTKM × nature × brand → campaigns[] (top 80 theo doanh thu)
      → PromotionView
```

Chiều `brand` được thêm vào cả hai bảng ở tầng ETL để **bộ lọc brand hoạt động thật**, không chỉ hiện nút.

## 2. Phát hiện gốc — bốn bản chất không được gộp

48 CTKM trong một tháng, phủ 34,3% doanh thu. Nhưng chúng **không cùng bản chất**:

| Bản chất | Ví dụ thật trong data | Doanh thu T1 | Vào ROI marketing? |
|---|---|---|---|
| **INTERNAL** — nội bộ | CHAIRMAN AND FAMILY 30% · DIRECTORS AND MANAGERS 25% | **483,9tr** | ❌ **không** — đây là khoản mục P&L |
| **PARTNER** — đối tác/toà nhà | SKG Members 20% · GIẢM GIÁ 50% SKG-NOIRE SSV · RESIDENTS S OFFERS | ~320tr | tách riêng, ghi rõ phần NOIRE trả |
| **LOYALTY** — hạng thành viên | Hạng Black Diamond · Hạng Silver · Giảm 15% Thẻ VIP | ~82tr | ✅ nhưng tính ở M8 |
| **COMMERCIAL** — marketing thật | HAPPY TUESDAY · NOIRE THURSDAY DELIGHT | ~195tr | ✅ **chỉ nhóm này** |

**483,9tr chiết khấu nội bộ = 12,3% doanh thu tháng.**
Gộp chung vào “hiệu quả khuyến mãi” thì mọi con số ROI marketing đều sai nghiêm trọng —
và sai theo hướng **làm marketing trông tệ hơn thực tế**.

T7/2026: chi phí ưu đãi 221,8tr, trong đó **INTERNAL 166,4tr = 75%** chỉ cho **202 hoá đơn**.

## 3. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| **Doanh thu gắn CTKM theo tháng & bản chất** | cột chồng 4 nhãn |
| **Tỷ trọng 4 bản chất** | |
| **Top 25 chương trình khuyến mãi theo doanh thu chạm** | |

**Màu theo ngữ nghĩa:** `COMMERCIAL` xanh · `INTERNAL` đỏ · `PARTNER` vàng · `LOYALTY` ô liu —
nhìn màu là biết nhóm nào tính vào hiệu quả marketing.

> ⚠️ Chú ý cách gọi: **“doanh thu chạm”** — tức doanh thu của các dòng món có gắn tên CTKM.
> Đây **không phải** doanh thu do CTKM tạo ra. Muốn biết phần tạo ra thật thì phải đo Lift (mục 5).

## 4. Bộ lọc

Brand · Từ · Đến. Bộ lọc brand áp cho **cả bốn bản chất** — chiều brand đã có sẵn trong ETL.

## 5. ⛔ Đang thiếu gì — đo Lift

Module hiện trả lời được *“chương trình nào chạm nhiều doanh thu nhất”*
nhưng **chưa trả lời được *“chương trình nào tạo thêm doanh thu”***.

Để đo Lift cần:

| Thành phần | Công thức | Trạng thái |
|---|---|---|
| **Kỳ nền (baseline)** | TB 4 tuần liền trước, cùng cửa hàng, loại tuần lễ tết | dữ liệu đã đủ |
| **Lift %** | `(Net kỳ chạy − Net kỳ nền) ÷ Net kỳ nền` | chưa dựng |
| **Store đối chứng** | cửa hàng không chạy campaign, cùng kỳ | chưa dựng |
| **ROI Promotion** | `(Net tăng thêm − chi phí ưu đãi − chi phí ads) ÷ tổng chi phí` | chưa dựng |
| **`dim_campaign`** | ngày bắt đầu/kết thúc, phạm vi cửa hàng, ngân sách | ⛔ **chưa có bảng này** |

**Quy tắc chống thổi phồng:** Lift luôn phải so **cùng cửa hàng**, không so chain.
Và phải kiểm tra **store đối chứng** trong cùng kỳ — nếu store đối chứng cũng tăng tương đương
thì lift là do mùa vụ, không phải do campaign.
**Không có bước này, mọi báo cáo ROI đều là tự huyễn hoặc.**

**Rào chắn độ chín 14 ngày:** chương trình chạy dưới 14 ngày không được gắn nhãn KHÔNG ĐẠT.

## 6. Checklist nâng cấp

- [ ] **Dựng `dim_campaign`** — campaign_id · type · brand · store_scope · date_from · date_to · budget · kpi_target · **nature**
      *(một campaign chỉ được một `type`; nếu vừa đẩy promotion vừa thu lead thì tách thành 2 dòng với ngân sách chia rõ)*
- [ ] **Dựng mô hình Lift** + store đối chứng → mở khoá ROI Promotion
- [ ] **Timeline campaign trên nền đường doanh thu** — nhìn ra ngay chương trình nào trùng kỳ
- [ ] **Bảng pre/during/post** cho mỗi campaign
- [ ] Tách rõ **chi phí ưu đãi** (đang có ở `nature.disc`) khỏi **doanh thu chạm** trên màn hình
- [ ] Ghép chi tiêu Ads từ M5 để tính ROI đầy đủ
- [ ] Ghi kết quả lift thật vào **`lib_benchmark`** để nuôi M6 *(vòng lặp đóng của hệ thống)*

---

## Khối Aggregator (từ T8/2026)

Nền tảng trung gian bán hộ và giữ lại một phần: GrabFood · Dining City · (sau này ShopeeFood).

**`sales` là doanh thu ghi nhận TRÊN NỀN TẢNG, không phải tiền về túi.** Phải trừ discount,
hoa hồng và ads của nền tảng mới ra `net_after`. Tỷ lệ nền tảng giữ lại (`take_rate`) là con
số đáng theo dõi nhất — nó quyết định kênh này lãi hay lỗ, và nó không nằm trong bất kỳ báo
cáo POS nào.

T8/2026 — tháng đầu vận hành:

| Nền tảng | Cửa hàng | Doanh thu | Đơn | AOV | Nền tảng giữ |
|---|---|---|---|---|---|
| GrabFood | NJFB · The Crest | 49,9 tr | 29 | 1,72 tr | — |
| GrabFood | NDC · 39 NTMK | 31,2 tr | 41 | 760 k | 5,0% |
| Dining City | *(toàn chuỗi)* | 7,8 tr | 13 | 604 k | 7,3% |
| **Tổng** | | **89,0 tr** | **83** | **1,07 tr** | 2,4% |

**Khoá tự nhiên là `month + platform + store`, không phải `month + platform`.** Báo cáo nguồn
liệt kê GrabFood ở hai cửa hàng; khử trùng theo `platform` sẽ nuốt mất một cửa hàng và báo
57,8 tr thay vì 89,0 tr.

**Dòng tổng của nền tảng bị bỏ khi đã có dòng cửa hàng.** Trong biểu mẫu nguồn, dòng
`GrabFood` là TỔNG của hai dòng cửa hàng ngay dưới — lấy cả ba là cộng đôi.

`take_rate` để trống nghĩa là **chưa khai** discount/hoa hồng, không phải nền tảng không giữ
đồng nào. Màn hình hiện `—`.
