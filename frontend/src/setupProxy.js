const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Resilient Webpack Dev Server proxy configuration.
 * Replaces CRA's basic package.json "proxy" string with robust error-handled proxying
 * preventing ECONNRESET drops during Flask server reloads or idle polling.
 */
module.exports = function(app) {
  const backendProxy = createProxyMiddleware({
    target: 'http://127.0.0.1:5000',
    changeOrigin: true,
    secure: false,
    ws: false,
    // Graceful error trap: avoid terminal unhandled socket crash on backend reload
    onError: (err, req, res) => {
      // If client closed connection or backend is restarting, respond cleanly
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'reloading',
            message: 'Backend server is starting or reloading',
            code: err.code || 'ECONNRESET',
          })
        );
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      // Ensure keep-alive headers are consistent
      proxyReq.setHeader('Connection', 'keep-alive');
    },
  });

  app.use(['/api', '/uploads', '/static'], backendProxy);
};

