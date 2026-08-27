import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';

// Local proxy so the browser can talk to the phone's SMS Gateway without CORS
// grief. The frontend sends every gateway request to /gateway-proxy/<path>
// with an X-Gateway-Target header naming the phone's URL. This middleware
// forwards it, streams the response back, no CORS headers required — because
// as far as the browser knows, we're calling our own origin.
function phoneGatewayProxy() {
  return {
    name: 'phone-gateway-proxy',
    configureServer(server) {
      server.middlewares.use('/gateway-proxy', (req, res) => {
        const target = req.headers['x-gateway-target'];
        if (!target || Array.isArray(target)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing X-Gateway-Target header' }));
          return;
        }
        let targetUrl;
        try {
          const path = req.url || '/';
          targetUrl = new URL(path.replace(/^\/+/, '/'), target);
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: `Bad target URL: ${e.message}` }));
          return;
        }

        const opts = {
          method: req.method,
          hostname: targetUrl.hostname,
          port: targetUrl.port || 80,
          path: targetUrl.pathname + targetUrl.search,
          headers: {
            ...Object.fromEntries(
              Object.entries(req.headers).filter(([k]) =>
                !['host', 'x-gateway-target', 'origin', 'referer'].includes(k.toLowerCase())
              )
            ),
            host: targetUrl.host,
          },
          timeout: 15_000,
        };

        const proxyReq = http.request(opts, (proxyRes) => {
          res.statusCode = proxyRes.statusCode || 500;
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (v !== undefined) res.setHeader(k, v);
          }
          proxyRes.pipe(res);
        });

        proxyReq.on('timeout', () => {
          proxyReq.destroy(new Error('Upstream timeout'));
        });

        proxyReq.on('error', (err) => {
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('content-type', 'application/json');
          }
          res.end(JSON.stringify({ error: `Gateway proxy: ${err.message}` }));
        });

        req.pipe(proxyReq);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), phoneGatewayProxy()],
});
