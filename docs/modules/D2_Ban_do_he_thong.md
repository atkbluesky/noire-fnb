# D2 · BẢN ĐỒ HỆ THỐNG

| | |
|---|---|
| **Câu hỏi** | Hệ thống phân tích của NOIRE đang phân mảnh tới mức nào? |
| **`activeView`** | `d2` |
| **View** | `src/views/SystemMapView.tsx` |
| **ETL** | `build_mkt.py` §7 — quét cây thư mục, không đọc nội dung file |
| **Giai đoạn** | P1 — ✅ xong |
| **Trạng thái** | ⚠️ Màn hình hoạt động tốt; **thứ nó phơi bày mới là vấn đề** |

---

## 1. Chuỗi trace

```
quét cây thư mục gốc (bỏ __pycache__ · ARCHIVE · node_modules · .git)
   → đếm file .py · dòng code · dashboard HTML · thư mục cache · data.json trùng tên
      → data_mkt.json: system
         → SystemMapView
```

## 2. Màn hình hiển thị gì

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Hệ thống độc lập · File Python tồn tại · Dashboard HTML rời rạc · Cache đọc trùng lặp |
| Các hệ thống đang chạy song song | thư mục gốc · số file · dòng code · output |
| **Bốn tool cùng đọc một nguồn — nhưng dùng 4 định nghĩa khác nhau** | cột doanh thu dùng · cách map cửa hàng |
| Danh sách 11 dashboard HTML rời rạc | tên · đường dẫn · dung lượng |

## 3. Phát hiện gốc mà màn hình này trình bày

**Sáu hệ thống chạy song song · 31 file Python · 15.276 dòng code · 11 dashboard HTML · 4 thư mục cache (53,6 MB đọc lại cùng nguồn) · `data.json` trùng tên ở 3 nơi với nội dung khác nhau.**

Nguyên nhân gốc — **bốn tool cùng đọc `accounting_sale`, mỗi tool định nghĩa khác nhau**:

| Tool | Cột doanh thu dùng | Map cửa hàng |
|---|---|---|
| Partnership | `Tổng tiền` | bảng riêng |
| Tool Dashboard CRM | `Tổng tiền` · `Tổng tiền (bao gồm hoa hồng)` · `Tổng tiền (không VAT)` — **cả ba** | bảng riêng |
| Basket · RFM · K-Means | `Tổng tiền` · `Thành tiền` · `Doanh thu Net` — **ba cơ sở** | bảng riêng |
| **Analytics Hub** | `Tổng tiền` *(đã đối soát 4 tầng)* | **`dim_store` dùng chung** |

Khi hai báo cáo cùng nói về “doanh thu tháng 7” nhưng ra hai con số — đây là lý do.
Không phải ai đó tính sai, mà mỗi bên đang trả lời một câu hỏi hơi khác nhau mà không ai ghi rõ.

Ba cái bẫy đã biết (dòng tổng lẫn trong dữ liệu · alias cửa hàng viết khác nhau · ô rỗng là ký tự vô hình)
**mỗi tool phải tự phát hiện lại từ đầu**. Tool nào chưa gặp thì vẫn đang sai âm thầm.

## 4. Hướng gộp — ba bước, không xoá tool nào

> Nguyên tắc: **không viết lại 15.276 dòng code.** Các tool chuyên sâu vẫn giữ nguyên giá trị —
> chỉ đổi nguồn đầu vào để dùng chung một định nghĩa.

1. **Đổi nguồn đầu vào** — mỗi tool thay phần tự đọc Excel bằng đọc `data.json` của Hub.
   Thay đổi nhỏ về code nhưng giải quyết triệt để chuyện lệch số.
2. **Gộp cache** — bốn thư mục về một chỗ. Tiết kiệm 53,6 MB, mỗi file Excel chỉ đọc một lần.
3. **Phân vai rõ** — Hub là nơi **tra số**; các dashboard chuyên sâu (Ads, CRM, Partnership, Basket-RFM)
   là nơi **đào sâu**. Người đọc biết mở cái nào cho việc gì.

## 5. Checklist nâng cấp

- [ ] Thêm cột **“đã chuyển sang đọc data.json”** cho từng tool → biến D2 thành bảng theo dõi tiến độ gộp
- [ ] Đánh dấu rõ bản cũ/bản mới của nguồn ads *(`04 Marketing Campaigns` chỉ tới T7, `05 Data Raw` có T8 + Google)* — **đây là điểm phân mảnh mới**
- [ ] Cảnh báo khi phát hiện `data.json` trùng tên ở nhiều nơi với nội dung khác nhau
- [ ] Bổ sung dòng cho chính repo này: 2 nhánh output (React + HTML tĩnh), đã đồng bộ JSON tự động
