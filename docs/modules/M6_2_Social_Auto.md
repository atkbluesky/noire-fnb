# M6.2 · Social Auto — Fanpage → Zalo OA

M6.2 là tên và vị trí mới của module từng được thiết kế là M8.2. Bản thiết kế chi tiết và các quyết định kỹ thuật cũ vẫn được giữ nguyên tại [`M8_2_Social_Auto.md`](M8_2_Social_Auto.md). Không đổi đường dẫn API, tên bảng, migration hoặc `PROMPT_VERSION` để giữ tương thích dữ liệu và tích hợp đã có.

| Thành phần | Hiện trạng |
|---|---|
| Giao diện | `src/views/SocialAutoView.tsx`, route `m62` dưới M6 trong Sidebar. Đăng nhập trước khi xem phễu, quota, lỗi, hàng chờ; phiên hết hạn sau 4 giờ và có nút đăng xuất. |
| API | `/api/social/auth` cấp phiên; `/api/social/performance` và `/api/social/review` đòi phiên hợp lệ. `/api/social/webhook-fb`, `/api/social/tick`, `/api/social/reconcile` giữ xác thực máy riêng. Tạo bản nháp bằng Gemini khi có `GEMINI_API_KEY`; Claude cũ vẫn chạy nếu chưa có Gemini key. |
| Dữ liệu | `004_social_auto.sql` tạo các bảng xử lý bài; `005_social_auth.sql` thêm bảng phiên và giới hạn thử đăng nhập. Hai migration đã có trên DB hiện tại ngày 01/10/2026; các bảng bài, bản nháp và lượt chạy đều có 0 dòng khi kiểm tra. |
| Nhịp chạy | Vercel cron gọi `reconcile` mỗi ngày. `tick` cần scheduler ngoài gọi mỗi 3 phút với `Bearer CRON_SECRET`. |
| An toàn đăng | `SOCIAL_AUTOPUBLISH=false` theo mặc định; bài chờ duyệt trước khi đăng. Broadcast cần thao tác riêng. |

## Điều kiện để chạy thực tế

1. Chạy `npm run probe:fb all`, xác minh quyền và dữ liệu của Facebook Page dùng cho module.
2. Cấu hình `FB_APP_SECRET`, `FB_PAGE_ID`, `FB_PAGE_TOKEN`, `FB_WEBHOOK_VERIFY_TOKEN`, `GEMINI_API_KEY`, các biến `R2_*` ở môi trường server. Có thể chọn model bằng `GEMINI_MODEL` (mặc định `gemini-3.8-flash`). Các key này hiện chưa có giá trị trong `.env.local` của workspace; không đặt chúng với tiền tố `VITE_`. Nếu chưa cấu hình Gemini, code vẫn dùng `ANTHROPIC_API_KEY` cũ khi có.
3. Migration `004_social_auto.sql` đã có trên DB hiện tại. Khi triển khai sang DB khác, chạy migration và kiểm tra bảng `social_*` cùng hàm `social_broadcast_used`.
4. Cấp quyền Nội dung cho Zalo App đang dùng bởi M8.1; xác minh token OA hợp lệ.
5. Đăng ký Facebook webhook `feed` tới `/api/social/webhook-fb`, bật scheduler ngoài cho `/api/social/tick` mỗi 3 phút và xác minh Vercel cron `/api/social/reconcile`.
6. Giữ duyệt thủ công, thử ảnh rồi video trên môi trường phù hợp trước khi cho đăng thật. Nếu video vượt 50 MB, cần `FFMPEG_PATH` hoặc xử lý thủ công trạng thái `NEEDS_TRANSCODE`.

## Đăng nhập quản trị M6.2

1. Chạy `node scripts/social-auth-hash.mjs` trong terminal tương tác, nhập mật khẩu riêng ít nhất 16 ký tự. Lệnh không hiện ký tự đã gõ và chỉ in ra hash.
2. Đặt dòng `SOCIAL_ADMIN_PASSWORD_HASH=...` mà lệnh tạo ra vào `.env.local` khi chạy local và vào biến môi trường server khi triển khai. Không đưa mật khẩu thô hoặc hash vào Git, không thêm tiền tố `VITE_`.
3. Migration `database/migrations/005_social_auth.sql` đã chạy trên DB hiện tại. Khi dùng DB khác, chạy lại file này. Nếu đổi hash mật khẩu, mọi phiên cũ tự mất hiệu lực.
4. API đăng nhập giới hạn 5 lần sai trong 15 phút cho mỗi địa chỉ nguồn. Phiên dùng token ngẫu nhiên 256 bit lưu dạng hash ở DB, cookie `HttpOnly`, `SameSite=Strict`, `Secure` trên HTTPS; chỉ localhost được chạy HTTP. Endpoint ghi kiểm tra Origin và header riêng chống CSRF. `SOCIAL_REVIEW_SECRET` cũ không còn cấp quyền.

Đây là một tài khoản quản trị dùng chung. Để có từng nhân viên, phân quyền và thu hồi riêng, cần tích hợp hệ thống danh tính doanh nghiệp.

`npm run typecheck:api` và `npm run build` đã qua sau khi thêm đăng nhập. Thử với mật khẩu giả trên DB hiện tại xác nhận mật khẩu sai bị từ chối, phiên hoạt động, hết hạn, đăng xuất, và lần sai thứ sáu bị chặn `429`; dòng thử nghiệm đã xóa. Kiểm tra giả lập xác nhận Gemini được ưu tiên, retry khi bản nháp sai và Claude vẫn hoạt động khi chưa có Gemini key. Chưa có bằng chứng chạy end-to-end với Facebook, Gemini, R2 và Zalo OA vì workspace chưa có `GEMINI_API_KEY`.

M6.2 hiện dùng một Facebook Page để chuyển bài sang Zalo OA. Nó không tự ghi dữ liệu vào sheet `social_month` của M6 và chưa thay thế phần đo lường 4 Page + TikTok của tab M6.
