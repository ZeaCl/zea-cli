#!/usr/bin/env node
// ZEA WebSocket Server — broadcasts orchestrator events to all connected clients.

import { WebSocketServer, WebSocket } from 'ws';
import { execSync } from 'child_process';
import chalk from 'chalk';

const PORT = parseInt(process.env.WS_PORT || '4091');
let server = null;

function startServer() {
  const wss = new WebSocketServer({ port: PORT });
  const clients = new Set();

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`Client connected (${clients.size} total)`);
    ws.on('close', () => { clients.delete(ws); console.log(`Client disconnected (${clients.size} total)`); });
    ws.on('message', (data) => {
      try { const msg = JSON.parse(data.toString()); broadcast(msg); } catch {}
    });
    ws.send(JSON.stringify({ event: 'ws:connected', data: { clients: clients.size, port: PORT } }));
  });

  function broadcast(event) {
    const msg = typeof event === 'string' ? event : JSON.stringify(event);
    clients.forEach(c => { try { if (c.readyState === 1) c.send(msg); } catch {} });
  }

  console.log(chalk.green(`WebSocket server on ws://localhost:${PORT}`));
  return wss;
}

export function register(program) {
  const wsCmd = program.command('ws').description('WebSocket streaming for orchestrator events');

  wsCmd.command('start')
    .description('Start WebSocket server on :4091')
    .action(() => {
      server = startServer();
      console.log(chalk.dim('Waiting for connections... (Ctrl+C to stop)'));
    });

  wsCmd.command('listen')
    .description('Connect to WS server and display events')
    .action(() => {
      console.log(chalk.cyan('Connecting to ws://localhost:' + PORT + '...\n'));
      const ws = new WebSocket('ws://localhost:' + PORT);
      ws.on('open', () => console.log('Connected\n'));
      ws.on('message', (data) => {
        try {
          const { event, data: payload } = JSON.parse(data.toString());
          const icons = { 'plan:ready':'📋', 'step:start':'🔄', 'step:ok':'✅', 'step:fail':'❌', 'step:retry':'🔁', 'delegate':'🔍', 'done':'📊' };
          console.log(`${icons[event]||'📌'} [${event}] ${JSON.stringify(payload).slice(0, 140)}`);
        } catch { console.log('Raw:', data.toString().slice(0, 200)); }
      });
      ws.on('close', () => { console.log('Disconnected'); process.exit(0); });
    });
}
