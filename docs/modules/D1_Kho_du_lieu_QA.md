# D1 · KHO DỮ LIỆU & QA

| | |
|---|---|
| **Câu hỏi** | Số trên dashboard có đáng tin không? |
| **`activeView`** | `d1` |
| **View** | `src/views/DataWarehouseView.tsx` |
| **ETL** | `build_hub.py` §5 (9 chốt) + §6 · `build_mkt.py` (chốt #10 · #11) |
| **Giai đoạn** | P1 — ✅ xong |
| **Trạng thái** | ✅ **10/11 chốt đạt** *(chỉ #8 độ phủ COGS đỏ)* |

---

## 1. Chuỗi trace (NT4)

```
S01 item · S02 bill · S04 monthly · S05 BOM
   → fact_item · fact_bill · fact_sales_monthly · dim_product
      → 11 chốt QA + bảng đối soát
         → data.json: qa · meta · coverage · cogs_cov · recon · store_month · stores
            + data_mkt.json: qa
               → DataWarehouseView
```

## 2. Màn hình hiển thị gì

| Khối | Nội dung | Khoá |
|---|---|---|
| Thẻ KPI | Chốt QA đạt chuẩn · Hoá đơn đã xử lý · Dòng món đã xử lý · Kỳ dữ liệu | `qa · meta · coverage` |
| **11 chốt kiểm tra chất lượng** | tên chốt · kết quả · chi tiết | `qa` + `MKT.qa` |
| **Đối soát rollup hoá đơn ↔ báo cáo tháng** | cột chồng Khớp (≤0,5%) / Lệch (>0,5%) theo tháng | `recon` |
| **Độ phủ giá vốn theo tháng** | đường độ phủ COGS | `cogs_cov` |
| **Bảng master cửa hàng (`DIM_STORE`)** | code · brand · tier · mở từ · doanh thu | `stores · store_month` |

Tháng chưa trọn kỳ bị loại khỏi biểu đồ đối soát (`coverage[m].partial`).

## 3. Bộ lọc

Không có thanh lọc — D1 và D2 là hai màn hình duy nhất `showFilterBar = false`.
Đây là màn hình về **chất lượng dữ liệu**, không phải về kết quả kinh doanh, nên lọc theo brand không có nghĩa.

## 4. Đang chặn bởi gì

Không chặn gì. Chốt #8 đỏ là **thông tin đúng**, không phải lỗi màn hình.

## 5. Checklist nâng cấp

- [ ] Thêm **chốt #12** — đối soát `fact_item` ↔ `fact_bill` theo `month × store`
      *(hiện chỉ đối soát bill ↔ báo cáo tháng; item lệch sẽ không ai biết)*
- [ ] Thêm **chốt #13** — độ phủ target: store nào chưa có target trong kỳ
- [ ] Thêm **chốt #14** — ngưỡng giải ngân ngân sách ngoài 95–105%
      *(Zalo Ads đang 0% mà không chốt nào bắt)*
- [ ] Hiển thị **sổ thiếu dữ liệu** từ `data_sources.json → missing_data_register` ngay trong tab
      *(hiện chỉ `check_input.py` in ra terminal — Blueprint 12.6 yêu cầu nó nằm trong dashboard)*
- [ ] Hiển thị **trạng thái nạp từng nguồn**: kỳ mới nhất, số dòng, lần chạy gần nhất
      *(cần ETL ghi thêm khoá `sources_status`)*
- [ ] Cho phép bấm vào một dòng lệch ở bảng đối soát để mở chi tiết `month × store`
