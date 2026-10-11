import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
const HTML_FILE = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tenant-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';

  // API Health Check
  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'LedgerAE Web Portal', port: PORT }));
    return;
  }

  // API Data Endpoints
  if (url === '/api/trial-balance') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalDebitsAed: '97880200.00',
      totalCreditsAed: '97880200.00',
      isBalanced: true,
      varianceFils: 0
    }));
    return;
  }

  // Serve Main UI HTML
  try {
    const html = fs.readFileSync(HTML_FILE, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error loading LedgerAE UI: ' + err.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LedgerAE Web Application running live at: http://localhost:${PORT}`);
});
