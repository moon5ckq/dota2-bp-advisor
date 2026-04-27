const http = require('http');
const httpProxy = require('http-proxy');
const handler = require('serve-handler');

const proxy = httpProxy.createProxyServer({ target: 'http://127.0.0.1:8082' });

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    proxy.web(req, res);
  } else {
    handler(req, res, {
      public: 'dist',
      rewrites: [{ source: '**', destination: '/index.html' }]
    });
  }
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  res.writeHead(502);
  res.end('Backend unavailable');
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Frontend+proxy running on http://0.0.0.0:3000');
});
