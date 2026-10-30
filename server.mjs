import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const pythonPath = resolve(root, '.venv', 'Scripts', 'python.exe');
let easyOcrProcess = null;
let easyOcrAvailable = false;
let easyOcrStartError = '';

if (existsSync(pythonPath)) {
  easyOcrProcess = spawn(pythonPath, [resolve(root, 'ocr_server.py')], {
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
  easyOcrAvailable = true;
  easyOcrProcess.on('error', error => {
    easyOcrAvailable = false;
    easyOcrStartError = error.message;
    console.error(`EasyOCR could not start: ${error.message}`);
  });
  easyOcrProcess.on('exit', code => {
    easyOcrAvailable = false;
    if (code !== 0 && code !== null) console.error(`EasyOCR stopped with exit code ${code}`);
  });
} else {
  console.log('EasyOCR is not installed yet. Run ติดตั้ง-EasyOCR.bat to enable it; browser OCR remains available.');
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    if (pathname === '/api/easyocr/status') {
      const body = JSON.stringify({ available: easyOcrAvailable, error: easyOcrStartError });
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
      response.end(body);
      return;
    }
    const fullPath = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (fullPath !== root && !fullPath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(fullPath);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': types[extname(fullPath).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : await readFile(fullPath));
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`OCRScan เปิดที่ http://127.0.0.1:${port}`);
  console.log('ปิดหน้าต่างนี้เพื่อหยุดแอป');
});

function shutdown() {
  easyOcrProcess?.kill();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
