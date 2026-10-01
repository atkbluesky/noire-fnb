/**
 * M6.2 · Chuyển nội dung Fanpage sang văn phong Zalo OA bằng Gemini hoặc Claude.
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): prompt · gọi model · validate · retry.
 * CẤM gọi Zalo API, CẤM ghi database, CẤM import `_media.ts`/`_zalo-article.ts`.
 *
 * ── Hai quyết định quan trọng ──────────────────────────────────────────────
 * ① Model KHÔNG được tự viết URL ảnh. Nó chỉ trả `index` trỏ vào danh sách ảnh
 *    đã nạp lên R2; file này thay index bằng URL thật. Model bịa URL là không
 *    thể xảy ra về mặt cấu trúc, không phải nhờ dặn dò trong prompt.
 * ② `title` quá 150 ký tự thì FEED LỖI NGƯỢC cho model sửa, KHÔNG `slice()`.
 *    Cắt cứng hay đứt giữa từ (M8_2 §3).
 */
import {
  ZALO_AUTHOR_MAX, ZALO_DESC_MAX, ZALO_TITLE_MAX,
  type DraftBlock, type DraftPayload, type SocialEnv,
} from './_shared.js';

export const PROMPT_VERSION = 'm82-2026-09-27';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const MAX_ROUNDS = 3;                    // 1 lần đầu + 2 lần sửa lỗi

export interface TransformInput {
  message: string;
  kind: string;
  permalink: string | null;
  imageUrls: string[];
  hasVideo: boolean;
  reactions: number;
  comments: number;
  shares: number;
  /** Bài OA đã duyệt, dùng làm few-shot để bám giọng brand. */
  fewShot: Array<{ source: string; title: string; description: string }>;
}

export interface TransformResult {
  draft: DraftPayload;
  model: string;
  rounds: number;
}

const SYSTEM = `Bạn là biên tập viên nội dung của một chuỗi nhà hàng Việt Nam, chuyên chuyển bài từ Fanpage Facebook sang Zalo Official Account.

BỐI CẢNH KÊNH — đây là gốc của mọi khác biệt:
Facebook là feed công cộng, người đọc lướt nhanh, tiêu đề phải giật để dừng ngón tay.
Zalo OA đọc trong khung chat, gần với tin nhắn từ người quen hơn là quảng cáo. Giọng điềm đạm, rõ ràng, tôn trọng.

BỐN VIỆC BẮT BUỘC:
1. ĐỔI NGỮ CẢNH — bớt giật tít, bớt emoji (tối đa 2–3 cho cả bài), xưng hô nhất quán một kiểu từ đầu đến cuối.
2. BÓC SẠCH DẤU VẾT FACEBOOK — xoá hết "comment bên dưới", "inbox shop", "tag bạn bè", "link ở bình luận", "share để nhận", @mention, chuỗi hashtag, mọi link facebook.com. Thay bằng CTA hợp Zalo: nhắn tin cho OA, gọi hotline, hoặc bỏ hẳn CTA nếu bài không cần.
3. CHIA LẠI ĐỘ DÀI — caption Facebook thường một khối dài. Trên Zalo phải tách thành các đoạn 2–3 câu. Mỗi block text là một đoạn.
4. TỰ CHẤM VÀ TỰ LOẠI — cho điểm bài này đáng đẩy broadcast tới mức nào, và loại thẳng bài không nên sync.

KHI NÀO ĐẶT reject_reason (bài sẽ KHÔNG được đăng):
- Chỉ chia sẻ link báo chí hoặc bài của trang khác
- Chúc mừng nội bộ, sinh nhật nhân viên, thông báo nội bộ
- Ảnh đơn không có caption hoặc caption dưới 15 từ, không có thông tin gì
- Nội dung chỉ có nghĩa trong ngữ cảnh Facebook (minigame comment, thể lệ share)
Không thuộc các nhóm trên thì reject_reason = null.

CHẤM broadcast_score 0–100:
90+ khuyến mãi lớn đang chạy, khai trương, món mới quan trọng
70–89 nội dung có giá trị thật cho khách: món mới, ưu đãi thường, sự kiện
40–69 nội dung thương hiệu, hình ảnh không gian, câu chuyện
dưới 40 tin vụn, cập nhật nhỏ

TIẾNG VIỆT CÓ DẤU ĐẦY ĐỦ. Không markdown, không **in đậm**, không ###.`;

const TOOL = {
  name: 'emit_draft',
  description: 'Trả bản nháp bài viết Zalo OA đã chuyển đổi.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: `Tiêu đề, TỐI ĐA ${ZALO_TITLE_MAX} ký tự.` },
      description: { type: 'string', description: `Mô tả ngắn hiện ở preview, TỐI ĐA ${ZALO_DESC_MAX} ký tự.` },
      author: { type: 'string', description: `Tên tác giả hiển thị, TỐI ĐA ${ZALO_AUTHOR_MAX} ký tự.` },
      body: {
        type: 'array',
        description: 'Thân bài. Mỗi phần tử là một đoạn văn hoặc một ảnh.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['text', 'image'] },
            content: { type: 'string', description: 'Chỉ dùng khi type=text.' },
            index: { type: 'integer', description: 'Chỉ dùng khi type=image. Số thứ tự ảnh trong danh sách được cung cấp.' },
            caption: { type: 'string', description: 'Chú thích ảnh, không bắt buộc.' },
          },
          required: ['type'],
        },
      },
      broadcast_score: { type: 'integer', description: '0–100.' },
      reject_reason: { type: ['string', 'null'], description: 'Lý do không nên đăng, hoặc null.' },
    },
    required: ['title', 'description', 'author', 'body', 'broadcast_score', 'reject_reason'],
  },
};

function buildUserMessage(input: TransformInput): string {
  const lines: string[] = [];
  if (input.fewShot.length) {
    lines.push('THAM KHẢO GIỌNG VĂN — các bài đã được duyệt trước đây:');
    for (const s of input.fewShot) {
      lines.push(`--- Bài gốc Facebook: ${s.source.slice(0, 300)}`);
      lines.push(`--- Đã duyệt thành: ${s.title} | ${s.description}`);
    }
    lines.push('');
  }
  lines.push(`LOẠI BÀI: ${input.kind}${input.hasVideo ? ' (có video)' : ''}`);
  lines.push(`TƯƠNG TÁC TRÊN FACEBOOK: ${input.reactions} cảm xúc · ${input.comments} bình luận · ${input.shares} chia sẻ`);
  lines.push(input.imageUrls.length
    ? `ẢNH KHẢ DỤNG: ${input.imageUrls.length} ảnh, đánh số từ 0 đến ${input.imageUrls.length - 1}. Chèn bằng {"type":"image","index":N}. Không được bịa số ngoài khoảng này.`
    : 'ẢNH KHẢ DỤNG: không có. Thân bài chỉ gồm block text.');
  lines.push('');
  lines.push('CAPTION GỐC TRÊN FACEBOOK:');
  lines.push(input.message || '(bài không có caption)');
  return lines.join('\n');
}

/* ─── Validate: trả danh sách lỗi bằng tiếng Việt để feed ngược cho model ── */

interface RawBlock { type?: string; content?: string; index?: number; caption?: string }

function validate(raw: Record<string, unknown>, imageCount: number): { errors: string[]; draft?: DraftPayload } {
  const errors: string[] = [];
  const title = String(raw.title ?? '').trim();
  const description = String(raw.description ?? '').trim();
  const author = String(raw.author ?? '').trim();

  if (!title) errors.push('title đang rỗng.');
  else if (title.length > ZALO_TITLE_MAX) {
    errors.push(`title dài ${title.length} ký tự, trần là ${ZALO_TITLE_MAX}. Viết lại ngắn hơn, KHÔNG cắt cụt giữa chừng.`);
  }
  if (!description) errors.push('description đang rỗng.');
  else if (description.length > ZALO_DESC_MAX) {
    errors.push(`description dài ${description.length} ký tự, trần là ${ZALO_DESC_MAX}. Viết lại ngắn hơn.`);
  }
  if (!author) errors.push('author đang rỗng.');
  else if (author.length > ZALO_AUTHOR_MAX) {
    errors.push(`author dài ${author.length} ký tự, trần là ${ZALO_AUTHOR_MAX}.`);
  }

  const rawBody = Array.isArray(raw.body) ? raw.body as RawBlock[] : [];
  if (!rawBody.length) errors.push('body đang rỗng, phải có ít nhất một block text.');

  const body: DraftBlock[] = [];
  rawBody.forEach((b, i) => {
    if (b.type === 'text') {
      const content = String(b.content ?? '').trim();
      if (!content) { errors.push(`body[${i}] là text nhưng content rỗng.`); return; }
      body.push({ type: 'text', content });
    } else if (b.type === 'image') {
      const idx = Number(b.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= imageCount) {
        errors.push(`body[${i}] dùng index=${b.index} nhưng chỉ có ${imageCount} ảnh (0..${imageCount - 1}).`);
        return;
      }
      body.push({ type: 'image', url: String(idx), ...(b.caption ? { caption: String(b.caption).trim() } : {}) });
    } else {
      errors.push(`body[${i}] có type="${b.type}" không hợp lệ, chỉ nhận "text" hoặc "image".`);
    }
  });
  if (!body.some(b => b.type === 'text')) errors.push('body phải có ít nhất một block text.');

  let score = Number(raw.broadcast_score);
  if (!Number.isFinite(score)) errors.push('broadcast_score phải là số nguyên 0–100.');
  score = Math.max(0, Math.min(100, Math.round(score || 0)));

  const rejectRaw = raw.reject_reason;
  const reject = rejectRaw == null || rejectRaw === 'null' || String(rejectRaw).trim() === ''
    ? null : String(rejectRaw).trim().slice(0, 300);

  if (errors.length) return { errors };
  return {
    errors: [],
    draft: { title, description, author, body, broadcast_score: score, reject_reason: reject },
  };
}

/* ─── Gọi Claude ────────────────────────────────────────────────────────── */

interface AnthropicContent { type: string; name?: string; input?: Record<string, unknown> }

async function callClaude(
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>, model: string, env: SocialEnv,
): Promise<{ toolInput: Record<string, unknown>; assistantContent: unknown }> {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error('ANTHROPIC_API_KEY_NOT_CONFIGURED');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },   // ép ra đúng schema, không parse markdown
      messages,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({})) as Record<string, any>;
  if (!res.ok) {
    throw new Error(`CLAUDE_FAILED:${res.status}:${String(body?.error?.message ?? '').slice(0, 160)}`);
  }
  const content: AnthropicContent[] = body.content ?? [];
  const call = content.find(c => c.type === 'tool_use' && c.name === TOOL.name);
  if (!call?.input) throw new Error('CLAUDE_NO_TOOL_USE');
  return { toolInput: call.input, assistantContent: content };
}

/* Gemini dùng JSON Schema của bản nháp cũ, vẫn qua validate() và retry như Claude. */
async function callGemini(
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  model: string, env: SocialEnv,
): Promise<{ toolInput: Record<string, unknown>; assistantText: string }> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: {
          responseFormat: { text: { mimeType: 'application/json', schema: TOOL.input_schema } },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const body = await res.json().catch(() => ({})) as Record<string, any>;
  if (!res.ok) {
    throw new Error(`GEMINI_FAILED:${res.status}:${String(body?.error?.message ?? '').slice(0, 160)}`);
  }
  const assistantText = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? '').join('');
  if (!assistantText) throw new Error(`GEMINI_NO_CONTENT:${String(body.candidates?.[0]?.finishReason ?? body.promptFeedback?.blockReason ?? '').slice(0, 80)}`);
  let toolInput: unknown;
  try { toolInput = JSON.parse(assistantText); }
  catch { throw new Error('GEMINI_INVALID_JSON'); }
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
    throw new Error('GEMINI_INVALID_JSON');
  }
  return { toolInput: toolInput as Record<string, unknown>, assistantText };
}

export async function transform(input: TransformInput, env: SocialEnv): Promise<TransformResult> {
  const useGemini = Boolean(env.GEMINI_API_KEY?.trim());
  if (!useGemini && !env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }
  const model = useGemini
    ? env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
    : env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
    { role: 'user', content: buildUserMessage(input) },
  ];
  const geminiContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [
    { role: 'user', parts: [{ text: buildUserMessage(input) }] },
  ];

  let lastErrors: string[] = [];
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const response = useGemini
      ? await callGemini(geminiContents, model, env)
      : await callClaude(messages, model, env);
    const { toolInput } = response;
    const { errors, draft } = validate(toolInput, input.imageUrls.length);

    if (draft) {
      // Thay index bằng URL thật — model không bao giờ chạm vào URL.
      draft.body = draft.body.map(b =>
        b.type === 'image' ? { ...b, url: input.imageUrls[Number(b.url)] } : b);
      return { draft, model, rounds: round };
    }

    lastErrors = errors;
    if (round === MAX_ROUNDS) break;
    const feedback = `Bản vừa rồi chưa hợp lệ. Sửa đúng các lỗi sau rồi trả lại JSON theo schema:\n`
      + errors.map(e => `- ${e}`).join('\n');
    if (useGemini) {
      geminiContents.push({ role: 'model', parts: [{ text: (response as { assistantText: string }).assistantText }] });
      geminiContents.push({ role: 'user', parts: [{ text: feedback }] });
    } else {
      messages.push({ role: 'assistant', content: (response as { assistantContent: unknown }).assistantContent });
      messages.push({ role: 'user', content: `${feedback}\nGọi lại ${TOOL.name}.` });
    }
  }
  throw new Error(`${useGemini ? 'GEMINI' : 'CLAUDE'}_VALIDATION_FAILED:${lastErrors.join(' | ').slice(0, 300)}`);
}

/**
 * Điểm cuối = điểm AI trộn với tương tác THẬT bên Facebook.
 * AI đọc nội dung, engagement đọc phản ứng của người — bài hay mà không ai tương
 * tác thì đừng đốt quota broadcast vào nó (quota chỉ 1–4/tháng, M8_2 §4b).
 */
export function blendScore(aiScore: number, reactions: number, comments: number, shares: number): number {
  const weighted = reactions + comments * 3 + shares * 5;
  const engagement = Math.min(100, Math.round((Math.log10(weighted + 1) / 3) * 100));
  return Math.max(0, Math.min(100, Math.round(aiScore * 0.6 + engagement * 0.4)));
}
