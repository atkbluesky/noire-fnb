import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { handleFeedback, type FeedbackEnv } from './api/feedback';
import { handleZaloPerformance } from './api/zalo/performance';
import { handleZaloSnapshot } from './api/zalo/snapshot';
import { handleZaloWebhook } from './api/zalo/webhook';
import type { ZaloEnv } from './api/zalo/_shared';
import { handleIposSync } from './api/ipos/sync';
import { handleIposWebhook } from './api/ipos/webhook';
import type { IposEnv } from './api/ipos/_shared';
import { handleSocialWebhookFb } from './api/social/webhook-fb';
import { handleSocialTick } from './api/social/tick';
import { handleSocialReconcile } from './api/social/reconcile';
import { handleSocialReview } from './api/social/review';
import { handleSocialPerformance } from './api/social/performance';
import { handleSocialAuth } from './api/social/auth';
import type { SocialEnv } from './api/social/_shared';
import { handleAdsSync } from './api/ads/sync';
import { handleAdsPerformance } from './api/ads/performance';
import { handleAdsExport } from './api/ads/export';
import type { AdsEnv } from './api/ads/_shared';

/* Trên Vercel, api/feedback.ts tự chạy thành Function. Dev server và `vite preview`
   không biết thư mục api/, nên plugin này gắn đúng hàm đó vào /api/feedback để chạy
   local giống hệt production. Biến FEEDBACK_* đọc từ .env.local — không có tiền tố
   VITE_ nên Vite không bao giờ nhúng chúng vào bundle. */
function feedbackApi(env: FeedbackEnv): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    try {
      req.setEncoding('utf8');
      let body = '';
      for await (const chunk of req) body += chunk;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      if (req.socket.remoteAddress) headers.set('x-real-ip', req.socket.remoteAddress);

      const method = req.method ?? 'GET';
      const response = await handleFeedback(
        new Request(`http://${req.headers.host ?? 'localhost'}/api/feedback`, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' ? undefined : body,
        }),
        env,
      );

      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    } catch (err) {
      next(err);
    }
  };

  return {
    name: 'noire-feedback-api',
    configureServer(server) {
      server.middlewares.use('/api/feedback', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/feedback', middleware);
    },
  };
}

/** Giữ API M8.1 chạy giống nhau giữa Vite local và Vercel Functions. */
function zaloApi(env: ZaloEnv): Plugin {
  const mount = (
    pathName: string,
    handler: (req: Request, env: ZaloEnv) => Promise<Response>,
  ): Connect.NextHandleFunction => async (req, res, next) => {
    try {
      req.setEncoding('utf8');
      let body = '';
      for await (const chunk of req) body += chunk;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const method = req.method ?? 'GET';
      const query = req.url?.startsWith('?') ? req.url : req.url === '/' ? '' : req.url ?? '';
      const response = await handler(new Request(
        `http://${req.headers.host ?? 'localhost'}${pathName}${query}`,
        { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : body },
      ), env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    } catch (error) {
      next(error);
    }
  };

  return {
    name: 'noire-zalo-api',
    configureServer(server) {
      server.middlewares.use('/api/zalo/performance', mount('/api/zalo/performance', handleZaloPerformance));
      server.middlewares.use('/api/zalo/snapshot', mount('/api/zalo/snapshot', handleZaloSnapshot));
      server.middlewares.use('/api/zalo/webhook', mount('/api/zalo/webhook', handleZaloWebhook));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/zalo/performance', mount('/api/zalo/performance', handleZaloPerformance));
      server.middlewares.use('/api/zalo/snapshot', mount('/api/zalo/snapshot', handleZaloSnapshot));
      server.middlewares.use('/api/zalo/webhook', mount('/api/zalo/webhook', handleZaloWebhook));
    },
  };
}

/** Giữ API M10.1 chạy giống nhau giữa Vite local và Vercel Functions. */
function iposApi(env: IposEnv): Plugin {
  const mount = (
    pathName: string,
    handler: (req: Request, env: IposEnv) => Promise<Response>,
  ): Connect.NextHandleFunction => async (req, res, next) => {
    try {
      req.setEncoding('utf8');
      let body = '';
      for await (const chunk of req) body += chunk;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const method = req.method ?? 'GET';
      const query = req.url?.startsWith('?') ? req.url : req.url === '/' ? '' : req.url ?? '';
      const response = await handler(new Request(
        `http://${req.headers.host ?? 'localhost'}${pathName}${query}`,
        { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : body },
      ), env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    } catch (error) {
      next(error);
    }
  };

  const routes: Array<[string, (req: Request, env: IposEnv) => Promise<Response>]> = [
    ['/api/ipos/webhook', handleIposWebhook],
    ['/api/ipos/sync', handleIposSync],
  ];

  return {
    name: 'noire-ipos-api',
    configureServer(server) {
      for (const [p, h] of routes) server.middlewares.use(p, mount(p, h));
    },
    configurePreviewServer(server) {
      for (const [p, h] of routes) server.middlewares.use(p, mount(p, h));
    },
  };
}

/** Giữ API M6.2 chạy giống nhau giữa Vite local và Vercel Functions. */
function socialApi(env: SocialEnv): Plugin {
  const mount = (
    pathName: string,
    handler: (req: Request, env: SocialEnv) => Promise<Response>,
  ): Connect.NextHandleFunction => async (req, res, next) => {
    try {
      req.setEncoding('utf8');
      let body = '';
      for await (const chunk of req) body += chunk;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const method = req.method ?? 'GET';
      const query = req.url?.startsWith('?') ? req.url : req.url === '/' ? '' : req.url ?? '';
      const response = await handler(new Request(
        `http://${req.headers.host ?? 'localhost'}${pathName}${query}`,
        { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : body },
      ), env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    } catch (error) {
      next(error);
    }
  };

  const routes: Array<[string, (req: Request, env: SocialEnv) => Promise<Response>]> = [
    ['/api/social/webhook-fb', handleSocialWebhookFb],
    ['/api/social/tick', handleSocialTick],
    ['/api/social/reconcile', handleSocialReconcile],
    ['/api/social/review', handleSocialReview],
    ['/api/social/performance', handleSocialPerformance],
    ['/api/social/auth', handleSocialAuth],
  ];

  return {
    name: 'noire-social-api',
    configureServer(server) {
      for (const [p, h] of routes) server.middlewares.use(p, mount(p, h));
    },
    configurePreviewServer(server) {
      for (const [p, h] of routes) server.middlewares.use(p, mount(p, h));
    },
  };
}

/** Giữ API M5.1 chạy giống nhau giữa Vite local và Vercel Functions. */
function adsApi(env: AdsEnv): Plugin {
  const mount = (
    pathName: string,
    handler: (req: Request, env: AdsEnv) => Promise<Response>,
  ): Connect.NextHandleFunction => async (req, res, next) => {
    try {
      req.setEncoding('utf8');
      let body = '';
      for await (const chunk of req) body += chunk;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const method = req.method ?? 'GET';
      const query = req.url?.startsWith('?') ? req.url : req.url === '/' ? '' : req.url ?? '';
      const response = await handler(new Request(
        `http://${req.headers.host ?? 'localhost'}${pathName}${query}`,
        { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : body },
      ), env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      // /api/ads/export trả XLSX nhị phân — `response.text()` sẽ làm hỏng file.
      const type = response.headers.get('content-type') ?? '';
      if (type.includes('json') || type.startsWith('text/')) {
        res.end(await response.text());
      } else {
        res.end(Buffer.from(await response.arrayBuffer()));
      }
    } catch (error) {
      next(error);
    }
  };

  const routes: Array<[string, (req: Request, env: AdsEnv) => Promise<Response>]> = [
    ['/api/ads/sync', handleAdsSync],
    ['/api/ads/performance', handleAdsPerformance],
    ['/api/ads/export', handleAdsExport],
  ];

  return {
    name: 'noire-ads-api',
    configureServer(server) {
      for (const [p, h] of routes) server.middlewares.use(p, mount(p, h));
    },
    configurePreviewServer(server) {
      for (const [p, h] of routes) server.middlewares.use(p, mount(p, h));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), '') as ZaloEnv & FeedbackEnv & IposEnv & SocialEnv & AdsEnv;
  return {
    plugins: [react(), feedbackApi(serverEnv), zaloApi(serverEnv), iposApi(serverEnv), socialApi(serverEnv), adsApi(serverEnv)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3001,
      open: false,
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          /* Gom theo ĐƯỜNG DẪN chứ không theo tên gói: EChartWrapper nạp lẻ
             'echarts/core' · 'echarts/charts' · 'echarts/components', nên khai
             theo tên gói như trước sẽ không bắt được các module con đó. */
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            const p = id.split('\\').join('/');
            if (p.includes('lucide-react')) return 'icons';
            if (p.includes('/echarts') || p.includes('/zrender')) return 'echarts';
            if (p.includes('/react-dom/') || p.includes('/react/') || p.includes('/scheduler/')) return 'vendor';
          },
        },
      },
    },
  };
});
