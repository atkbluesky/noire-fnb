import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Share2 } from 'lucide-react';

type FunnelRow = { state: string; count: number };
type QueueRow = {
  fb_post_id: string;
  fb_permalink: string | null;
  fb_message: string | null;
  fb_created_at: string;
  broadcast_score: number | null;
  title: string;
  description: string;
  author: string;
  body: unknown;
  version: number;
};
type PublishedRow = { fb_post_id: string; fb_permalink: string | null; title: string | null; broadcast_score: number | null };
type FailureRow = { fb_post_id: string; state: string; attempt: number; last_error: string | null; fb_permalink: string | null };
type RunRow = { job_type: string; status: string; picked: number; advanced: number; started_at: string; error_message: string | null };
type Performance = {
  ok: boolean;
  authenticated?: boolean;
  code?: string;
  message?: string;
  error?: string;
  month?: string;
  funnel?: FunnelRow[];
  totals?: { total: number; last7: number; published: number; reach_ready: number };
  broadcast?: { used: number; quota: number; remaining: number };
  failures?: FailureRow[];
  runs?: RunRow[];
  queue?: QueueRow[];
  published?: PublishedRow[];
};

const stateLabels: Record<string, string> = {
  INGESTED: 'Mới nhận', MEDIA_STAGED: 'Đã lưu media', NEEDS_TRANSCODE: 'Cần chuyển mã',
  TRANSFORMED: 'Đã viết lại', PENDING_REVIEW: 'Chờ duyệt', APPROVED: 'Đã duyệt',
  VIDEO_UPLOADING: 'Đang tải video', VIDEO_CONVERTING: 'Đang xử lý video',
  ARTICLE_CREATING: 'Đang tạo bài', ARTICLE_VERIFYING: 'Đang xác minh',
  PUBLISHED: 'Đã đăng', BROADCAST_QUEUED: 'Chờ broadcast', BROADCAST_SENT: 'Đã broadcast',
  REJECTED: 'Đã từ chối', SKIPPED: 'Đã bỏ qua', FAILED: 'Lỗi',
};

const responseMessage = (data: Performance) => data.message || data.error || data.code || 'Không tải được dữ liệu';
const EMPTY_DRAFT = { title: '', description: '', author: '', body: '' };

export const SocialAutoView: React.FC = () => {
  const [summary, setSummary] = useState<Performance | null>(null);
  const [authState, setAuthState] = useState<'checking' | 'signed_out' | 'signed_in' | 'unconfigured'>('checking');
  const [password, setPassword] = useState('');
  const [privateData, setPrivateData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const res = await fetch('/api/social/performance?queue=1', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await res.json() as Performance;
      if (res.status === 401) {
        setAuthState('signed_out');
        setSummary(null);
        setPrivateData(null);
        setDraft(EMPTY_DRAFT);
        return;
      }
      if (!res.ok || !data.ok) throw new Error(responseMessage(data));
      setSummary(data);
      setPrivateData(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Không kết nối được API Social Auto');
      setPrivateData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/social/auth', { credentials: 'same-origin', cache: 'no-store' });
        const data = await res.json() as Performance;
        if (!active) return;
        if (res.status === 503 && data.code === 'AUTH_NOT_CONFIGURED') { setAuthState('unconfigured'); setNotice(responseMessage(data)); return; }
        if (!res.ok || !data.ok) throw new Error(responseMessage(data));
        setAuthState(data.authenticated ? 'signed_in' : 'signed_out');
        if (data.authenticated) await load();
      } catch (error) {
        if (active) { setAuthState('signed_out'); setNotice(error instanceof Error ? error.message : 'Không kiểm tra được phiên đăng nhập'); }
      }
    })();
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (authState !== 'signed_in') return;
    let active = true;
    const verify = async () => {
      try {
        const res = await fetch('/api/social/auth', { credentials: 'same-origin', cache: 'no-store' });
        const data = await res.json() as Performance;
        if (active && (!res.ok || !data.authenticated)) {
          setAuthState('signed_out'); setSummary(null); setPrivateData(null); setDraft(EMPTY_DRAFT); setNotice('Phiên đã hết hạn. Vui lòng đăng nhập lại.');
        }
      } catch {
        if (active) { setAuthState('signed_out'); setSummary(null); setPrivateData(null); setDraft(EMPTY_DRAFT); setNotice('Không kiểm tra được phiên. Vui lòng đăng nhập lại.'); }
      }
    };
    const timer = window.setInterval(() => { void verify(); }, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void verify(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [authState]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setNotice('');
    try {
      const res = await fetch('/api/social/auth', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Social-Action': '1' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json() as Performance;
      if (!res.ok || !data.ok) throw new Error(responseMessage(data));
      setPassword('');
      setAuthState('signed_in');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Đăng nhập thất bại');
    } finally { setLoading(false); }
  };

  const logout = async () => {
    try {
      const res = await fetch('/api/social/auth', {
        method: 'DELETE', credentials: 'same-origin', headers: { 'X-Social-Action': '1' },
      });
      if (!res.ok) throw new Error('Không đăng xuất được');
      setSummary(null);
      setPrivateData(null);
      setDraft(EMPTY_DRAFT);
      setPassword('');
      setAuthState('signed_out');
      setNotice('');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Không đăng xuất được'); }
  };

  const action = async (fbPostId: string, kind: 'approve' | 'reject' | 'edit' | 'broadcast' | 'retry', fields: Record<string, unknown> = {}) => {
    if (kind === 'approve' && !window.confirm('Duyệt bài này để máy đưa lên Zalo OA?')) return;
    if (kind === 'broadcast' && !window.confirm('Xếp bài này vào hàng gửi broadcast Zalo OA?')) return;
    if (kind === 'reject' && !window.confirm('Từ chối bài này?')) return;
    setBusyId(fbPostId);
    setNotice('');
    try {
      const res = await fetch('/api/social/review', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Social-Action': '1' },
        body: JSON.stringify({ fb_post_id: fbPostId, action: kind, ...fields }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; errors?: string[] };
      if (res.status === 401) { setAuthState('signed_out'); setSummary(null); setPrivateData(null); setDraft(EMPTY_DRAFT); return; }
      if (!res.ok || !data.ok) throw new Error(data.errors?.join('; ') || data.error || 'Thao tác thất bại');
      setEditId(null);
      await load();
      setNotice(`Đã thực hiện: ${kind}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Thao tác thất bại');
    } finally {
      setBusyId(null);
    }
  };

  const beginEdit = (row: QueueRow) => {
    setEditId(row.fb_post_id);
    setDraft({ title: row.title, description: row.description, author: row.author, body: JSON.stringify(row.body, null, 2) });
  };

  const saveEdit = async (fbPostId: string) => {
    try {
      const body = JSON.parse(draft.body) as unknown;
      if (!Array.isArray(body) || body.length === 0) throw new Error('Nội dung phải là mảng JSON không rỗng.');
      await action(fbPostId, 'edit', { ...draft, body });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'JSON không hợp lệ');
    }
  };

  if (authState !== 'signed_in') return (
    <div className="mx-auto max-w-md p-5 pt-16">
      <div className="rounded-xl border border-brand-border bg-brand-surface p-6">
        <div className="flex items-center gap-2 text-brand-goldLight"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-bold">M6.2 · KHU VỰC QUẢN TRỊ</span></div>
        <h1 className="mt-3 font-display text-xl font-bold">Đăng nhập Social Auto</h1>
        <p className="mt-2 text-xs text-brand-muted">Phiên đăng nhập có hạn 4 giờ. Chỉ người có quyền mới xem bản nháp và duyệt bài.</p>
        {notice && <p role="alert" className="mt-4 rounded-lg border border-status-warning/40 bg-status-warningBg p-3 text-xs text-status-warning">{notice}</p>}
        {authState === 'checking' && <p className="mt-4 text-xs text-brand-muted">Đang kiểm tra phiên đăng nhập…</p>}
        {authState === 'unconfigured' && <p className="mt-4 text-xs text-brand-muted">Cần cấu hình SOCIAL_ADMIN_PASSWORD_HASH và chạy migration 005_social_auth.sql trên server.</p>}
        {authState === 'signed_out' && <form onSubmit={e => void login(e)} className="mt-5 space-y-3">
          <label htmlFor="social-admin-password" className="block text-xs font-bold">Mật khẩu quản trị</label>
          <input id="social-admin-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required className="w-full rounded-lg border border-brand-border bg-brand-dark px-3 py-2 text-sm text-brand-text" />
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-brand-gold px-4 py-2 text-xs font-bold text-brand-dark disabled:opacity-50">Đăng nhập</button>
        </form>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand-goldLight"><Share2 className="h-5 w-5" /><span className="text-xs font-bold">M6.2 · SOCIAL AUTO</span></div>
          <h1 className="mt-1 font-display text-2xl font-bold">Social Auto</h1>
          <p className="mt-1 text-xs text-brand-muted">Theo dõi bài, duyệt bản nháp và quản lý quota broadcast.</p>
        </div>
        <div className="flex gap-2"><button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-xs text-brand-text disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Làm mới</button><button type="button" onClick={() => void logout()} className="rounded-lg border border-brand-border px-3 py-2 text-xs text-brand-text">Đăng xuất</button></div>
      </div>

      {notice && <div role="alert" className="rounded-lg border border-status-warning/40 bg-status-warningBg p-3 text-xs text-status-warning">{notice}</div>}
      {summary?.code && <div className="rounded-lg border border-brand-border p-3 text-xs text-brand-muted">{responseMessage(summary)}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Tổng bài', summary?.totals?.total], ['7 ngày gần đây', summary?.totals?.last7],
          ['Chờ duyệt', summary?.totals?.reach_ready], ['Đã đăng', summary?.totals?.published],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-brand-border bg-brand-surface p-4"><div className="text-xs text-brand-muted">{label}</div><div className="mt-2 text-2xl font-bold text-brand-goldLight">{value ?? '—'}</div></div>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-brand-border bg-brand-surface p-4">
          <h2 className="text-sm font-bold">Trạng thái xử lý</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {(summary?.funnel ?? []).map(row => <div key={row.state} className="rounded-lg bg-brand-dark/50 p-2"><span className="text-brand-muted">{stateLabels[row.state] ?? row.state}</span><span className="float-right font-bold">{row.count}</span></div>)}
          </div>
        </section>
        <section className="rounded-xl border border-brand-border bg-brand-surface p-4">
          <h2 className="text-sm font-bold">Broadcast · {summary?.month ?? '—'}</h2>
          <p className="mt-3 text-2xl font-bold text-brand-goldLight">{summary?.broadcast?.used ?? '—'} / {summary?.broadcast?.quota ?? '—'}</p>
          <p className="mt-2 text-xs text-brand-muted">Còn {summary?.broadcast?.remaining ?? '—'} lượt theo giới hạn đang cấu hình. Broadcast cần người xếp hàng.</p>
        </section>
      </div>

      <section className="rounded-xl border border-brand-border bg-brand-surface p-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-goldLight" /><h2 className="text-sm font-bold">Khu vực duyệt nội dung</h2></div>
        <p className="mt-2 text-xs text-brand-muted">Bản nháp chỉ được tải sau khi đăng nhập. Thao tác duyệt vẫn cần xác nhận trước khi gửi.</p>
        {(privateData?.queue ?? []).map(row => (
          <article key={row.fb_post_id} className="mt-4 rounded-lg border border-brand-border bg-brand-dark/50 p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-brand-text">{row.title}</strong><span className="text-brand-goldLight">Điểm {row.broadcast_score ?? '—'} · bản {row.version}</span></div>
            <p className="mt-2 text-brand-muted">{row.description}</p>
            <p className="mt-2 whitespace-pre-wrap text-brand-muted">{row.fb_message}</p>
            {row.fb_permalink && <a href={row.fb_permalink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-brand-goldLight underline">Bài gốc Facebook</a>}
            {editId === row.fb_post_id ? (
              <div className="mt-3 space-y-2">
                {(['title', 'description', 'author'] as const).map(field => <input key={field} value={draft[field]} onChange={e => setDraft(v => ({ ...v, [field]: e.target.value }))} aria-label={field} className="w-full rounded border border-brand-border bg-brand-surface p-2 text-brand-text" />)}
                <textarea value={draft.body} onChange={e => setDraft(v => ({ ...v, body: e.target.value }))} aria-label="Nội dung bài dạng JSON" rows={8} className="w-full rounded border border-brand-border bg-brand-surface p-2 font-mono text-brand-text" />
                <button type="button" disabled={busyId === row.fb_post_id} onClick={() => void saveEdit(row.fb_post_id)} className="rounded bg-brand-gold px-3 py-2 font-bold text-brand-dark">Lưu bản sửa</button>
                <button type="button" onClick={() => setEditId(null)} className="ml-2 rounded border border-brand-border px-3 py-2">Hủy</button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busyId === row.fb_post_id} onClick={() => void action(row.fb_post_id, 'approve')} className="rounded bg-brand-gold px-3 py-2 font-bold text-brand-dark">Duyệt</button>
                <button type="button" disabled={busyId === row.fb_post_id} onClick={() => beginEdit(row)} className="rounded border border-brand-border px-3 py-2">Sửa</button>
                <button type="button" disabled={busyId === row.fb_post_id} onClick={() => void action(row.fb_post_id, 'reject')} className="rounded border border-status-warning/50 px-3 py-2 text-status-warning">Từ chối</button>
              </div>
            )}
          </article>
        ))}
        {privateData?.queue?.length === 0 && <p className="mt-3 text-xs text-brand-muted">Chưa có bài chờ duyệt.</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-brand-border bg-brand-surface p-4">
          <h2 className="text-sm font-bold">Bài đã đăng · có thể broadcast</h2>
          {(privateData?.published ?? []).map(row => <div key={row.fb_post_id} className="mt-3 flex items-center justify-between gap-2 border-t border-brand-border pt-3 text-xs"><span className="min-w-0 truncate">{row.title || row.fb_post_id}</span><button type="button" disabled={busyId === row.fb_post_id || !summary?.broadcast?.remaining} onClick={() => void action(row.fb_post_id, 'broadcast')} className="shrink-0 rounded border border-brand-gold px-2 py-1 text-brand-goldLight disabled:opacity-40">Xếp broadcast</button></div>)}
          {privateData?.published?.length === 0 && <p className="mt-3 text-xs text-brand-muted">Chưa có bài đủ điều kiện.</p>}
        </section>
        <section className="rounded-xl border border-brand-border bg-brand-surface p-4">
          <h2 className="text-sm font-bold">Bài cần xử lý</h2>
          {(summary?.failures ?? []).map(row => <div key={row.fb_post_id} className="mt-3 border-t border-brand-border pt-3 text-xs"><div className="flex justify-between gap-2"><span>{stateLabels[row.state] ?? row.state} · {row.fb_post_id}</span><button type="button" disabled={!privateData || busyId === row.fb_post_id} onClick={() => void action(row.fb_post_id, 'retry')} className="text-brand-goldLight disabled:opacity-40">Thử lại</button></div><p className="mt-1 text-brand-muted">{row.last_error || 'Chưa có chi tiết lỗi'}</p></div>)}
          {summary?.failures?.length === 0 && <p className="mt-3 text-xs text-brand-muted">Không có bài lỗi.</p>}
        </section>
      </div>

      <section className="rounded-xl border border-brand-border bg-brand-surface p-4">
        <h2 className="text-sm font-bold">Lần chạy gần đây</h2>
        {(summary?.runs ?? []).map((run, i) => <p key={`${run.started_at}-${i}`} className="mt-2 border-t border-brand-border pt-2 text-xs text-brand-muted">{new Date(run.started_at).toLocaleString('vi-VN')} · {run.job_type} · {run.status} · {run.advanced}/{run.picked} bài {run.error_message && `· ${run.error_message}`}</p>)}
        {summary?.runs?.length === 0 && <p className="mt-3 text-xs text-brand-muted">Chưa có lần chạy nào.</p>}
      </section>
    </div>
  );
};
