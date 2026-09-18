import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { handleFeedback, type FeedbackEnv } from './api/feedback';
import { handleZaloPerformance } from './api/zalo/performance';
import { handleZaloSnapshot } from './api/zalo/snapshot';
import { handleZaloWebhook } from './api/zalo/webhook';
import type { ZaloEnv } from './api/zalo/_shared';

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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), '') as ZaloEnv & FeedbackEnv;
  return {
    plugins: [react(), feedbackApi(serverEnv), zaloApi(serverEnv)],
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
