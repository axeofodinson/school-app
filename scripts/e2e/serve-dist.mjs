import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const port = Number(process.argv[3] || 8089);
const types = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.json': 'application/json',
};
http
  .createServer((req, res) => {
    let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory())
      p = path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  })
  .listen(port);
