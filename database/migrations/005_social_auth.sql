-- M6.2: phiên quản trị và giới hạn thử đăng nhập. Chỉ thêm bảng mới.
create table if not exists social_admin_session (
  token_hash text primary key,
  credential_tag text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists social_admin_session_expires on social_admin_session (expires_at);

create table if not exists social_auth_attempt (
  client_key text primary key,
  attempts integer not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz
);
