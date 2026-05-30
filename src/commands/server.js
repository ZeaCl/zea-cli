#!/usr/bin/env node
// ZEA API Gateway — exposes orchestrator as HTTP API

import http from 'http';
import { WebSocketServer } from 'ws';
import { execSync } from 'child_process';
import fs from 'fs';
import chalk from 'chalk';

export function register(program) {
  const serverCmd = program.command('server').description('ZEA API Gateway management');

  serverCmd.command('start')
    .description('Start API Gateway on :4000')
    .action(() => {
      startGateway();
    });
}

function startGateway() {
  const PORT = parseInt(process.env.ZEA_PORT || '4000');
  const WS_PORT = parseInt(process.env.WS_PORT || '4091');
  const clients = new Set();

function broadcast(event) {
  const msg = typeof event === 'string' ? event : JSON.stringify(event);
  clients.forEach(c => { try { if (c.readyState === 1) c.send(msg); } catch {} });
}

async function readJSON(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health
  if (url.pathname === '/health' && req.method === 'GET') {
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0', uptime: process.uptime() }));
    return;
  }

  // Orchestrate
  if (url.pathname === '/v1/orchestrate' && req.method === 'POST') {
    const body = await readJSON(req);
    const message = body.message;
    const domain = body.domain || 'venture';

    if (!message) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'message required' }));
      return;
    }

    try {
      const result = execSync(
        `node src/index.js orchestrate "${message.replace(/"/g, '\\"')}" --domain ${domain} --ws 2>&1`,
        { encoding: 'utf8', timeout: 300000, maxBuffer: 20 * 1024 * 1024, cwd: process.cwd() }
      );

      const analysis = result.match(/Analysis:\s*(.+)/)?.[1] || '';
      const steps = [...result.matchAll(/\[\d+\/\d+\]\s+\[(\w+)\]\s+(.+)/g)].map(m => ({ expert: m[1], command: m[2] }));
      const response = result.match(/Response:\s*(.+)/)?.[1] || '';
      const okCount = (result.match(/✅/g) || []).length;

      res.end(JSON.stringify({
        ok: true,
        domain,
        analysis,
        steps,
        response,
        completed: okCount
      }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message?.slice(0, 300) }));
    }
    return;
  }

  // Domain list
  if (url.pathname === '/v1/domains' && req.method === 'GET') {
    const domains = {};
    execSync('ls domains/*/manifest.json 2>/dev/null', { encoding: 'utf8' }).trim().split('\n').filter(Boolean).forEach(f => {
      try {
        const m = JSON.parse(require('fs').readFileSync(f, 'utf8'));
        domains[m.name] = m;
      } catch {}
    });
    res.end(JSON.stringify({ domains }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found', endpoints: ['/health', '/v1/orchestrate', '/v1/domains'] }));
});

// Start HTTP server
server.listen(PORT, () => {
  console.log(chalk.green(`ZEA API Gateway on http://localhost:${PORT}`));
  console.log(chalk.dim(`POST /v1/orchestrate  { message, domain }`));
  console.log(chalk.dim(`GET  /v1/domains`));
  console.log(chalk.dim(`GET  /health`));
});

// Start WebSocket server
const wss = new WebSocketServer({ port: WS_PORT });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.send(JSON.stringify({ event: 'ws:connected', data: { port: WS_PORT } }));
});

console.log(chalk.green(`WebSocket on ws://localhost:${WS_PORT}`));

// Forward WS events from orchestrator
process.on('message', (msg) => {
  try { broadcast(JSON.parse(msg.toString())); } catch {}
});
}
