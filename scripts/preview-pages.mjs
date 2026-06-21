import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubPagesBase } from './base-path.mjs';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const port = Number(process.env.PORT || process.argv[2] || 4173);
const basePath = githubPagesBase();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendFile(response, filePath) {
  const extension = extname(filePath);
  response.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
}

function fileForRequest(url) {
  if (url === '/') {
    return { redirect: basePath };
  }
  if (!url.startsWith(basePath)) {
    return null;
  }

  const relativePath = decodeURIComponent(url.slice(basePath.length).split('?')[0]) || 'index.html';
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(root, safePath);

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return { filePath: candidate };
  }
  return null;
}

const server = createServer((request, response) => {
  const result = fileForRequest(request.url || '/');
  if (result?.redirect) {
    response.writeHead(302, { Location: result.redirect });
    response.end();
    return;
  }
  if (result?.filePath) {
    sendFile(response, result.filePath);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(`Not found. Open http://127.0.0.1:${port}${basePath}`);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`GitHub Pages preview: http://127.0.0.1:${port}${basePath}`);
});
