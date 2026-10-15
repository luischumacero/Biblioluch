/**
 * server.js — Servidor HTTP local para Biblioteca Virtual
 * Uso: node server.js
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DEFAULT_PORT = Number(process.env.PORT) || 8080;
const MAX_PORT_ATTEMPTS = 20;
let PORT = DEFAULT_PORT;
const ROOT = __dirname;
const BOOKS_DIR = path.join(ROOT, 'LIBROS PDF');
const MAX_PDF_SIZE = 100 * 1024 * 1024;

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

function sendJson(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function readRequestBody(req, maxSize) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let exceededLimit = false;
        req.on('data', chunk => {
            if (exceededLimit) return;
            size += chunk.length;
            if (size > maxSize) {
                exceededLimit = true;
                chunks.length = 0;
            } else {
                chunks.push(chunk);
            }
        });
        req.on('end', () => {
            if (exceededLimit) {
                reject(Object.assign(new Error('El archivo supera el límite permitido.'), { status: 413 }));
            } else {
                resolve(Buffer.concat(chunks));
            }
        });
        req.on('error', reject);
    });
}

function safeBookName(value) {
    const name = path.basename(String(value || ''))
        .replace(/\.pdf$/i, '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .replace(/[. ]+$/g, '')
        .trim();
    return name.slice(0, 100);
}

async function uniqueBookPath(name, excludedPath = null) {
    let candidateName = `${name}.pdf`;
    let index = 2;
    while (true) {
        const candidate = path.join(BOOKS_DIR, candidateName);
        if (candidate === excludedPath) return candidate;
        try {
            await fs.promises.access(candidate);
            candidateName = `${name} (${index++}).pdf`;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            return candidate;
        }
    }
}

async function handleBooksApi(req, res, urlPath) {
    if (urlPath !== '/api/books' && !urlPath.startsWith('/api/books/')) return false;
    await fs.promises.mkdir(BOOKS_DIR, { recursive: true });

    if (urlPath === '/api/books' && req.method === 'GET') {
        const entries = await fs.promises.readdir(BOOKS_DIR, { withFileTypes: true });
        const books = entries
            .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf')
            .map(entry => ({
                filename: entry.name,
                name: path.basename(entry.name, path.extname(entry.name)),
                url: `/LIBROS%20PDF/${encodeURIComponent(entry.name)}`
            }));
        sendJson(res, 200, books);
        return true;
    }

    if (urlPath === '/api/books' && req.method === 'POST') {
        const body = await readRequestBody(req, MAX_PDF_SIZE);
        if (body.length < 5 || body.subarray(0, 5).toString('ascii') !== '%PDF-') {
            sendJson(res, 400, { error: 'El archivo seleccionado no parece ser un PDF válido.' });
            return true;
        }
        const name = safeBookName(new URL(req.url, `http://127.0.0.1:${PORT}`).searchParams.get('name'));
        if (!name) {
            sendJson(res, 400, { error: 'Escribe un nombre válido para el libro.' });
            return true;
        }
        const destination = await uniqueBookPath(name);
        await fs.promises.writeFile(destination, body, { flag: 'wx' });
        const filename = path.basename(destination);
        sendJson(res, 201, {
            filename,
            name: path.basename(filename, '.pdf'),
            url: `/LIBROS%20PDF/${encodeURIComponent(filename)}`
        });
        return true;
    }

    if (urlPath === '/api/books' && req.method !== 'GET') {
        sendJson(res, 405, { error: 'Método no permitido para la biblioteca de libros.' });
        return true;
    }

    const match = urlPath.match(/^\/api\/books\/([^/]+)$/);
    if (match && req.method === 'PATCH') {
        const filename = path.basename(match[1]);
        if (path.extname(filename).toLowerCase() !== '.pdf') {
            sendJson(res, 400, { error: 'El archivo solicitado no es un PDF.' });
            return true;
        }
        const source = path.join(BOOKS_DIR, filename);
        const body = await readRequestBody(req, 4096);
        let payload;
        try {
            payload = JSON.parse(body.toString('utf8'));
        } catch (_) {
            sendJson(res, 400, { error: 'La solicitud para cambiar el nombre no es válida.' });
            return true;
        }
        const name = safeBookName(payload.name);
        if (!name) {
            sendJson(res, 400, { error: 'Escribe un nombre válido para el libro.' });
            return true;
        }
        const destination = await uniqueBookPath(name, source);
        try {
            await fs.promises.rename(source, destination);
        } catch (error) {
            if (error.code === 'ENOENT') {
                sendJson(res, 404, { error: 'No se encontró el libro que quieres renombrar.' });
                return true;
            }
            throw error;
        }
        const renamed = path.basename(destination);
        sendJson(res, 200, {
            filename: renamed,
            name: path.basename(renamed, '.pdf'),
            url: `/LIBROS%20PDF/${encodeURIComponent(renamed)}`
        });
        return true;
    }

    if (match && req.method === 'DELETE') {
        const filename = path.basename(match[1]);
        if (path.extname(filename).toLowerCase() !== '.pdf') {
            sendJson(res, 400, { error: 'El archivo solicitado no es un PDF.' });
            return true;
        }
        try {
            await fs.promises.unlink(path.join(BOOKS_DIR, filename));
        } catch (error) {
            if (error.code === 'ENOENT') {
                sendJson(res, 404, { error: 'No se encontró el libro que quieres eliminar.' });
                return true;
            }
            throw error;
        }
        sendJson(res, 200, { filename, deleted: true });
        return true;
    }

    if (urlPath.startsWith('/api/books/')) {
        sendJson(res, 404, { error: 'No se encontró la operación o el libro solicitado.' });
        return true;
    }

    return false;
}

const server = http.createServer((req, res) => {
    let urlPath;
    try {
        urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
    } catch (_) {
        sendJson(res, 400, { error: 'La dirección solicitada no es válida.' });
        return;
    }

    handleBooksApi(req, res, urlPath).then(handled => {
        if (handled) return;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { 'Allow': 'GET, HEAD' });
            res.end('Método no permitido');
            return;
        }

        const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^[/\\]+/, '');
        const filePath = path.resolve(ROOT, relativePath);
        const relative = path.relative(ROOT, filePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            res.writeHead(403); res.end('Forbidden'); return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
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
            if (req.method === 'HEAD') res.end();
            else res.end(data);
        });
    }).catch(error => {
        if (!res.headersSent) {
            sendJson(res, error.status || 500, {
                error: error.status ? error.message : 'No se pudo completar la operación con el libro.'
            });
        }
    });
});

function listenOnAvailablePort(attempt = 0) {
    if (attempt >= MAX_PORT_ATTEMPTS) {
        console.error(`\nNo hay puertos disponibles entre ${DEFAULT_PORT} y ${DEFAULT_PORT + MAX_PORT_ATTEMPTS - 1}.`);
        process.exitCode = 1;
        return;
    }

    PORT = DEFAULT_PORT + attempt;
    server.listen(PORT, '127.0.0.1', () => {
        const url = `http://localhost:${PORT}`;
        console.log('\n  ╔══════════════════════════════════════════╗');
        console.log('  ║  Biblioluch — Biblioteca Virtual         ║');
        console.log('  ╠══════════════════════════════════════════╣');
        console.log(`  ║  ${url}${' '.repeat(Math.max(1, 40 - url.length))}║`);
        if (PORT !== DEFAULT_PORT) {
            console.log(`  ║  El puerto ${DEFAULT_PORT} estaba ocupado; se usará ${PORT}.      ║`);
        }
        console.log('  ║  Presiona Ctrl+C para detener            ║');
        console.log('  ╚══════════════════════════════════════════╝\n');

        if (process.env.BIBLIOLUCH_OPEN_BROWSER === '1') {
            exec(`start "" "${url}"`, error => {
                if (error) console.error('No se pudo abrir el navegador automáticamente:', error.message);
            });
        }
    });
}

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        server.close(() => listenOnAvailablePort(PORT - DEFAULT_PORT + 1));
    } else {
        console.error('Error:', e.message);
    }
});

listenOnAvailablePort();
