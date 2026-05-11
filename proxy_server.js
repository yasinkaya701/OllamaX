const http = require('http');

const OLLAMA_HOST = 'localhost';
const OLLAMA_PORT = 11434;

const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const options = {
        hostname: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers
    };
    
    // Remove host header to avoid issues
    delete options.headers.host;
    delete options.headers.origin;
    delete options.headers.referer;

    const proxy = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    req.pipe(proxy, { end: true });

    proxy.on('error', (e) => {
        res.writeHead(500);
        res.end(e.message);
    });
});

console.log('Ollama CORS proxy (localhost only) on 127.0.0.1:11435 → Ollama :11434');
server.listen(11435, '127.0.0.1');
