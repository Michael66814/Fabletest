#!/usr/bin/env node
/* Würfelflug – kleiner lokaler Webserver zum Ausprobieren.
   Aufruf:  node tools/serve.js [Port]     ->  http://localhost:8080 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function createServer() {
  return http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(req.url.split('?')[0]);
    } catch (e) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(root, rel));
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Nicht gefunden');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.argv[2]) || 8080;
  createServer().listen(port, () => {
    console.log('Würfelflug läuft auf http://localhost:' + port + '  (Strg+C beendet)');
  });
}
