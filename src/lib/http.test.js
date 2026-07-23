import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { ZeaError, zeaFetch } from '../lib/http.js';

let server;
let baseUrl;

before(() => {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        // Route: /api/health → JSON success
        if (req.url === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
          return;
        }

        // Route: /api/echo → echo back body + method
        if (req.url === '/api/echo') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ method: req.method, body: body || null }));
          return;
        }

        // Route: /api/text → plain text response
        if (req.url === '/api/text') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('plain text response');
          return;
        }

        // Route: /api/forbidden → 403
        if (req.url === '/api/forbidden') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }

        // Route: /api/server-error → 500
        if (req.url === '/api/server-error') {
          res.writeHead(500);
          res.end('Internal Server Error');
          return;
        }

        // Route: /api/host-check → return Host header
        if (req.url === '/api/host-check') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ host: req.headers.host }));
          return;
        }

        // Default: 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });
    });

    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
});

// ── ZeaError ─────────────────────────────────────────

describe('ZeaError', () => {
  it('creates a basic error with message', () => {
    const err = new ZeaError('Something went wrong');
    assert.equal(err.message, 'Something went wrong');
    assert.equal(err.name, 'ZeaError');
  });

  it('stores status, code, and url metadata', () => {
    const err = new ZeaError('Not found', { status: 404, code: 'NOT_FOUND', url: 'http://example.com' });
    assert.equal(err.status, 404);
    assert.equal(err.code, 'NOT_FOUND');
    assert.equal(err.url, 'http://example.com');
  });

  it('is an instance of Error', () => {
    const err = new ZeaError('test');
    assert.ok(err instanceof Error);
  });

  it('handles missing metadata', () => {
    const err = new ZeaError('test');
    assert.equal(err.status, undefined);
    assert.equal(err.code, undefined);
    assert.equal(err.url, undefined);
  });
});

// ── zeaFetch: success paths ──────────────────────────

describe('zeaFetch success', () => {
  it('fetches JSON successfully', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/health`);
    assert.equal(resp.ok, true);
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.version, '1.0.0');
  });

  it('returns text response', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/text`);
    assert.equal(resp.ok, true);
    const text = await resp.text();
    assert.equal(text, 'plain text response');
  });

  it('handles non-200 status (4xx)', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/forbidden`);
    assert.equal(resp.ok, false);
    assert.equal(resp.status, 403);
    const data = await resp.json();
    assert.equal(data.error, 'Forbidden');
  });

  it('handles non-200 status (5xx)', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/server-error`);
    assert.equal(resp.ok, false);
    assert.equal(resp.status, 500);
  });

  it('throws on invalid JSON', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/server-error`); // text/plain 500
    await assert.rejects(() => resp.json(), /Invalid JSON/);
  });

  it('sends POST with string body', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/echo`, {
      method: 'POST',
      body: 'hello=world',
    });
    const data = await resp.json();
    assert.equal(data.method, 'POST');
    assert.equal(data.body, 'hello=world');
  });

  it('sends POST with object body (auto-JSON)', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/echo`, {
      method: 'POST',
      body: { key: 'value', num: 42 },
    });
    const data = await resp.json();
    assert.equal(data.method, 'POST');
    const parsed = JSON.parse(data.body);
    assert.equal(parsed.key, 'value');
    assert.equal(parsed.num, 42);
  });

  it('sends POST with Buffer body', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/echo`, {
      method: 'POST',
      body: Buffer.from('binary data'),
    });
    const data = await resp.json();
    assert.equal(data.method, 'POST');
    assert.equal(data.body, 'binary data');
  });

  it('sends custom headers', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/host-check`, {
      headers: { 'X-Custom': 'custom-value' },
    });
    const data = await resp.json();
    assert.ok(data.host.includes('127.0.0.1'));
  });
});

// ── zeaFetch: error paths ────────────────────────────

describe('zeaFetch errors', () => {
  it('rejects with ZeaError on invalid host', async () => {
    await assert.rejects(zeaFetch('http://invalid.invalid.zzz:9999/', { timeout: 2000 }), (err) => {
      assert.ok(err instanceof ZeaError);
      return true;
    });
  });

  it('rejects with ZeaError on connection refused', async () => {
    await assert.rejects(zeaFetch('http://127.0.0.1:19999/test', { timeout: 2000 }), (err) => {
      assert.ok(err instanceof ZeaError);
      assert.equal(err.url, 'http://127.0.0.1:19999/test');
      return true;
    });
  });

  it('rejects with ETIMEDOUT on timeout', async () => {
    // Use an unroutable IP that will hang until timeout
    await assert.rejects(zeaFetch('http://10.255.255.1:9999/test', { timeout: 100 }), (err) => {
      assert.ok(err instanceof ZeaError);
      assert.equal(err.code, 'ETIMEDOUT');
      return true;
    });
  });
});

// ── zeaFetch: .localhost resolution ──────────────────

describe('zeaFetch localhost resolution', () => {
  it('sends Host header when resolving .zea.localhost', async () => {
    const resp = await zeaFetch(`http://test.zea.localhost:${new URL(baseUrl).port}/api/host-check`);
    const data = await resp.json();
    // Should preserve original hostname
    assert.ok(data.host.includes('test.zea.localhost'));
  });
});

// ── zeaFetch: debug mode ──────────────────────────────

describe('zeaFetch debug mode', () => {
  let originalArgv;

  before(() => {
    originalArgv = process.argv;
  });

  after(() => {
    process.argv = originalArgv;
  });

  it('logs request in debug mode (--debug)', async () => {
    process.argv = ['node', 'zea', '--debug'];
    const logs = [];
    const origError = console.error;
    console.error = (msg) => logs.push(msg);
    try {
      await zeaFetch(`${baseUrl}/api/health`);
      assert.ok(
        logs.some((l) => l.includes('[DEBUG]')),
        'should log request',
      );
      assert.ok(
        logs.some((l) => l.includes('200')),
        'should log response with status',
      );
    } finally {
      console.error = origError;
    }
  });

  it('logs request body in debug mode', async () => {
    process.argv = ['node', 'zea', '--debug'];
    const logs = [];
    const origError = console.error;
    console.error = (msg) => logs.push(msg);
    try {
      await zeaFetch(`${baseUrl}/api/echo`, { method: 'POST', body: 'test-body' });
      assert.ok(
        logs.some((l) => l.includes('body:')),
        'should log body',
      );
    } finally {
      console.error = origError;
    }
  });

  it('logs JSON body in debug mode', async () => {
    process.argv = ['node', 'zea', '--debug'];
    const logs = [];
    const origError = console.error;
    console.error = (msg) => logs.push(msg);
    try {
      await zeaFetch(`${baseUrl}/api/echo`, { method: 'POST', body: { key: 'val' } });
      assert.ok(
        logs.some((l) => l.includes('body:')),
        'should log JSON body',
      );
    } finally {
      console.error = origError;
    }
  });

  it('logs errors in debug mode', async () => {
    process.argv = ['node', 'zea', '--debug'];
    const logs = [];
    const origError = console.error;
    console.error = (msg) => logs.push(msg);
    try {
      try {
        await zeaFetch('http://127.0.0.1:19999/test', { timeout: 500 });
      } catch {}
      assert.ok(
        logs.some((l) => l.includes('[DEBUG]')),
        'should have debug output',
      );
    } finally {
      console.error = origError;
    }
  });

  it('logs non-ok responses with error icon in debug', async () => {
    process.argv = ['node', 'zea', '--debug'];
    const logs = [];
    const origError = console.error;
    console.error = (msg) => logs.push(msg);
    try {
      await zeaFetch(`${baseUrl}/api/forbidden`);
      assert.ok(
        logs.some((l) => l.includes('403')),
        'should show 403 status',
      );
    } finally {
      console.error = origError;
    }
  });

  it('detects -d short flag for debug', async () => {
    process.argv = ['node', 'zea', '-d'];
    const logs = [];
    const origError = console.error;
    console.error = (msg) => logs.push(msg);
    try {
      await zeaFetch(`${baseUrl}/api/health`);
      assert.ok(
        logs.some((l) => l.includes('[DEBUG]')),
        'should log with -d flag',
      );
    } finally {
      console.error = origError;
    }
  });
});

// ── zeaFetch: HTTPS ──────────────────────────────────

describe('zeaFetch HTTPS', () => {
  it('defaults to port 443 for HTTPS', async () => {
    await assert.rejects(zeaFetch('https://127.0.0.1/api/health', { timeout: 1000 }), (err) => {
      assert.ok(err instanceof ZeaError);
      return true;
    });
  });
});

// ── zeaFetch: statusText and headers ─────────────────

describe('zeaFetch metadata', () => {
  it('returns statusText', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/health`);
    assert.equal(resp.statusText, 'OK');
  });

  it('returns response headers', async () => {
    const resp = await zeaFetch(`${baseUrl}/api/health`);
    assert.equal(resp.headers['content-type'], 'application/json');
  });
});
