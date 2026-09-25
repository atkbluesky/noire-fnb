-- M8.1 · nhật ký request webhook bị BỎ QUA — để chẩn đoán mà không cần mở log Vercel.
-- Chỉ lưu lý do + tên event + app_id có khớp không. KHÔNG lưu body, chữ ký, user id hay nội dung tin.
-- Chạy SAU 002. An toàn khi chạy lại.

create table if not exists zalo_oa_webhook_reject (
  id bigserial primary key,
  reason text not null check (reason in ('INVALID_JSON', 'INVALID_SIGNATURE', 'OA_NOT_TRACKED', 'ERROR')),
  event_name text,
  app_id_match boolean,
  detail text,
  received_at timestamptz not null default now()
);

create index if not exists zalo_oa_webhook_reject_time_idx on zalo_oa_webhook_reject (received_at desc);
