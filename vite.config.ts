import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
});
