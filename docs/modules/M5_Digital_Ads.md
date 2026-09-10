# M5 · DIGITAL ADS (META + GOOGLE)

| | |
|---|---|
| **Câu hỏi** | Thực chi bao nhiêu, ra kết quả gì? |
| **`activeView`** | `m5` |
| **View** | `src/views/DigitalAdsView.tsx` |
| **ETL** | `tools/build_month.py` — `read_meta_ads()` · `read_google_ads()` |
| **Nguồn** | `monthly/YYYY-MM.xlsx`: `ads_month` · `ads_brand` · `ads_objective` · `ads_campaign_detail` · `ads_google` · `gads_channel` · `gads_kw` |
| **Giai đoạn** | P7 |
| **Trạng thái** | ⚠️ **Meta ✅ · Google ✅ *(T7 + T8/2026)* · Zalo ⛔ chưa có dữ liệu** |

---

## 1. Chuỗi trace

```
S08 Meta   → lọc "Cấp độ phân phối = campaign" → tách HR → gắn brand + objective
              → ads_month · ads_brand · ads_objective · ads_campaign · ads_stat
S09 Google → Báo cáo chiến dịch → map store qua GSTORE → gads · gads_stat
              → Báo cáo cụm từ → gads_channel · gads_kw · gads_kw_stat
S10 budget → so kế hoạch vs thực chi
S02 bill   → store_month → mẫu số của Ad Cost Ratio
   → DigitalAdsView
```

## 2. ❗ CẤM dùng từ “ROAS”

NOIRE không có attribution đủ mạnh để nói doanh thu nào do quảng cáo tạo ra:
chỉ **8,6% hoá đơn có SĐT**, và Meta chỉ đo được tới bước tin nhắn.
Thẻ ROAS đã có ở wireframe v2 — **đã gỡ ở v3.0**.

| Dùng thay | Công thức | Ghi chú |
|---|---|---|
| **Ad Cost Ratio (ACR)** | `Media Spend ÷ Net Sales` | chỉ số chính báo cáo BOD |
| Net / Meta spend | `Net ÷ chi tiêu Meta` | **phải ghi rõ là tương quan, không phải nhân quả** |
| Cost per Conversation | `chi tiêu ÷ số tin nhắn` | |
| CPR / CPA | `spend ÷ result` · `spend ÷ conversions` | |

### ACR phải tính trên tháng trọn kỳ

Chi ads T8 là số đủ tháng, nhưng doanh thu T8 mới có 18/31 ngày.
Chia nhau ra **ACR 1,55%** — sai lệch nghiêm trọng so với **0,74%** thật ở T7.
Hệ thống luôn tính ACR trên tháng trọn kỳ gần nhất và ghi rõ điều đó trên thẻ chỉ số.

## 3. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Chi Tiêu Media Trong Kỳ · Google Ads (T8/2026) |
| **Diễn biến chi tiêu media & Ad Cost Ratio (%)** | trục kép — ghi rõ đơn vị hai bên |
| **Ba kênh quảng cáo — kế hoạch so thực chi Q3** | Meta · Google · Zalo |
| **Top chiến dịch Meta Ads theo chi tiêu** | |
| **Google Ads — Performance Max hướng Google Maps (từ T8/2026)** | |

## 4. Google Ads — điểm chặn cũ đã được giải quyết

Blueprint v3.0 ghi Google Ads bị chặn vì *“ba brand chưa có website”*. **Điều đó không còn đúng.**
Từ T8/2026, NOIRE chạy **5 chiến dịch Performance Max hướng tới Google Maps** — không cần website vẫn chạy được.
Kỳ 01–26/08/2026: chi **3.140.653đ**, **713 lượt chuyển đổi**.

| Kênh hiển thị | Chi phí | Lượt nhấp | Chuyển đổi | CP/chuyển đổi |
|---|---|---|---|---|
| **Maps** | 1.114.005 | 1.598 | **407** | **2.737đ** |
| Mạng hiển thị Google | 1.094.052 | 2.528 | 135 | 8.104đ |
| Google Tìm kiếm | 634.502 | 471 | 130 | 4.881đ |
| YouTube | 159.101 | 1.009 | 41 | 3.881đ |
| Khám phá | 138.991 | 92 | 0 | — |

Maps dẫn đầu cả chi phí lẫn chuyển đổi với **chi phí trên chuyển đổi thấp nhất** —
hợp lý với mô hình F&B tại chỗ, và giải thích vì sao chạy được khi chưa có website.

Kèm theo là **2.567 cụm từ tìm kiếm**, trong đó chỉ 89 cụm (3,5%) chứa “noire”.
**96,5% khách tìm theo nhu cầu, không tìm theo tên thương hiệu** — đầu vào tốt cho nội dung và đặt tên món.

> ✅ Cả hai bảng đã lên màn hình (09/09/2026). Khi gắn `gads_kw` mới lộ ra lỗi: bảng còn lẫn
> 4 dòng cộng dồn `Tổng số: …` — ETL chỉ lọc ở báo cáo kênh, quên lọc ở báo cáo cụm từ.
> Đã vá ở cả hai lane; số đúng là 2.567 chứ không phải 2.571.

## 5. Kế hoạch so thực chi (tới hết T8)

| Kênh | Plan Q3 | Plan tới hết T8 | Thực chi | Đạt/plan |
|---|---|---|---|---|
| Meta Ads | 173,5tr | 110,2tr | 79,8tr | **72,4%** |
| Google Ads | 61,8tr | 22,1tr | 3,1tr | **14,2%** |
| Zalo Ads | 34,4tr | 22,6tr | **0** | **0%** |
| **Tổng** | 269,6tr | 154,9tr | 82,9tr | **53,5%** |

**Cách đọc đúng:** so thực chi với phần kế hoạch **đã tới hạn**, không so với cả quý.
Ngưỡng lành mạnh 95–105%. Dưới 70% nghĩa là tiền đang nằm im và sẽ dồn áp lực vào tháng cuối —
chi vội cuối quý thường kém hiệu quả hơn chi đều.

## 6. Ba bẫy dữ liệu đã chặn

1. **Export Meta có cả dòng cấp `campaign` lẫn `adset`** (có tháng tách theo tuổi × giới tính).
   Cộng tất cả ra **549 triệu thay vì 157 triệu** — sai gấp 3,5 lần. → lọc `Cấp độ phân phối = campaign`.
2. **Chiến dịch tuyển dụng nhân sự nằm chung tài khoản quảng cáo** (6,99tr).
   Không phải marketing thương hiệu → tách khỏi ACR (`ads_stat.hr_spend`).
3. **Báo cáo Google cụm từ tìm kiếm có xen dòng `Tổng số: Chiến dịch`** —
   không loại sẽ nhân đôi chi phí (6,28tr thay vì 3,14tr).

## 7. Checklist nâng cấp

- [x] ~~Dựng bảng kênh hiển thị Google~~ ✅ **Maps 2.737đ/chuyển đổi — rẻ hơn 3,0× Mạng hiển thị**
- [x] ~~Dựng bảng cụm từ tìm kiếm~~ ✅ 2.567 cụm · 96,5% tìm theo nhu cầu *(đồng thời vá lỗi lẫn 4 dòng `Tổng số:`)*
- [ ] Hiển thị **`gads_stat.paused_spend`** — chiến dịch đã tạm dừng vẫn tiêu 1,01tr với 0 chuyển đổi
- [ ] Hiển thị **`gads_stat.unmapped`** — chiến dịch chưa map về cửa hàng nào
- [ ] Hiển thị **`ads_stat.hr_spend`** riêng để minh bạch phần đã trừ khỏi ACR
- [ ] **Zalo Ads** — xác nhận có chạy hay không; nếu chạy thì xin nguồn export
- [ ] Thêm **Cost per Conversation** — Meta đo được tới bước tin nhắn

---

## Google Ads nay có chiều THÁNG

Bản trước lưu Google Ads dưới dạng **ảnh chụp một kỳ**: không có cột `month`, và `_stats`
khai cứng `gads_stat.period = "1 tháng 8, 2026 – 26 tháng 8"`. Hệ quả: mỗi lần nộp tháng mới,
màn hình vẫn hiện kỳ cũ và bảng chiến dịch vẫn là số của kỳ cũ — im lặng.

Nay `ads_google` · `gads_channel` · `gads_kw` đều có cột `month`, `period` được **suy từ chính
dữ liệu**, và view lọc theo kỳ đang chọn rồi gộp lại theo chiến dịch. Chọn hai tháng thì mỗi
chiến dịch vẫn là **một** dòng với chi phí đã cộng.

**Cụm từ tìm kiếm chỉ giữ phần CÓ hoạt động.** Báo cáo T8/2026 có 3.799 cụm từ nhưng chỉ
452 cụm có lượt nhấp / chuyển đổi / chi phí; phần đuôi 0 lượt nhấp chiếm ~88% số dòng mà
không nói lên điều gì. `gads_kw_stat.terms` vì thế đếm trên tập có hoạt động, không phải
tổng số cụm từ Google trả về.
