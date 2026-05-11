const http = require('http');

const OLLAMA_HOST = 'localhost';
const OLLAMA_PORT = 11434;

const server = http.createServer((req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
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

console.log("Native CORS Proxy running on port 11435...");
server.listen(11435);
