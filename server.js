/**
 * server.js — Servidor HTTP local para Biblioteca Virtual
 * Uso: node server.js
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.pdf':  'application/pdf',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff2':'font/woff2',
    '.woff': 'font/woff',
};

const server = http.createServer((req, res) => {
    // Decode URL
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);

    // Security: ensure we stay within ROOT
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 — Archivo no encontrado: ' + urlPath);
            } else {
                res.writeHead(500); res.end('Error interno');
            }
            return;
        }

        const ext  = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type':  mime,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('\n  ╔══════════════════════════════════════════╗');
    console.log('  ║  Biblioluch — Biblioteca Virtual         ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  http://localhost:${PORT}                   ║`);
    console.log('  ║  Presiona Ctrl+C para detener            ║');
    console.log('  ╚══════════════════════════════════════════╝\n');
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`\n  ⚠️  El puerto ${PORT} ya está en uso.`);
        console.error(`  Abre http://localhost:${PORT} directamente en el navegador.\n`);
    } else {
        console.error('Error:', e.message);
    }
});
