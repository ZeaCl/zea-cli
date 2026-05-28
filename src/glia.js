#!/usr/bin/env node
import { getClient } from './client.js';
import * as Display from './utils/display.js';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const args = process.argv.slice(2);
const planMode = args.includes('--plan');
const backend = args.includes('--react') ? 'react' : 'opencode';
const message = args.filter(a => !a.startsWith('--')).join(' ');

const SESSION_FILE = path.join(os.homedir(), '.glia', 'session.json');

async function loadSession() {
  try { return JSON.parse(await fs.readFile(SESSION_FILE, 'utf8')); }
  catch { return {}; }
}

async function saveSession(sid) {
  await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await fs.writeFile(SESSION_FILE, JSON.stringify({ session_id: sid, last_used: new Date().toISOString() }));
}

async function main() {
  if (message) return chat(message);
  if (!process.stdin.isTTY) return interactiveSimple();
  return interactiveTUI();
}

// ── One-shot chat ────────────────────────────────────────

async function chat(text) {
  const client = await getClient();

  console.log(chalk.dim(`Glia (${backend})`));
  const resp = await fetch(`${client.gliaUrl}/api/agent/chat`, {
    method: 'POST', headers: client.headers,
    body: JSON.stringify({ text, plan_mode: planMode })
  });
  if (!resp.ok) { Display.errorMsg(`HTTP ${resp.status}`); process.exit(1); }
  await streamSSE(resp);
  process.exit(0);
}

function generateSid() { return 'g' + Math.random().toString(36).slice(2, 10); }

// ── Simple interactive (pipe / test) ─────────────────────

async function interactiveSimple() {
  const client = await getClient();
  const session = await loadSession();
  let pm = planMode, sid = session.session_id || null;

  console.log(chalk.dim(`\nGlia (${backend}) — chat interactivo`));
  console.log(chalk.dim('  /plan  /build  /clear  /new  /exit\n'));

  const rl = (await import('readline')).default
    .createInterface({ input: process.stdin, output: process.stdout, prompt: chalk.cyan('▸ ') });
  rl.prompt();

  const send = async (txt) => {
    const body = { text: txt, plan_mode: pm };
    if (sid) body.session_id = sid;
    const resp = await fetch(`${client.gliaUrl}/api/agent/chat`, {
      method: 'POST', headers: client.headers, body: JSON.stringify(body)
    });
    if (!resp.ok) { Display.errorMsg(`HTTP ${resp.status}`); rl.prompt(); return; }
    await streamSSE(resp);
    rl.prompt();
  };

  rl.on('line', async (line) => {
    const t = line.trim();
    if (t === '/exit') { console.log(chalk.dim('Chau!\n')); rl.close(); return; }
    if (t === '/plan') { pm = true; console.log(chalk.yellow('  [plan]')); rl.prompt(); return; }
    if (t === '/build') { pm = false; console.log(chalk.green('  [build]')); rl.prompt(); return; }
    if (t === '/clear') { console.clear(); rl.prompt(); return; }
    if (t === '/new') { sid = null; console.log(chalk.dim('  [nueva]')); rl.prompt(); return; }
    if (!t) { rl.prompt(); return; }
    await send(t);
  });
}

// ── TUI Interactive ──────────────────────────────────────

let pm = planMode, sid = null, inputBuf = '', currentRequest = null;

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

async function interactiveTUI() {
  const W = () => process.stdout.columns || 80;

  const bar = () => {
    const mode = pm ? chalk.bgYellow.black(' Plan ') : chalk.bgBlue.white(' Build ');
    const indicator = currentRequest ? chalk.blue(' ·') : '';
    const rhs = chalk.dim(' Tab=modo  Esc=cancelar');
    return '\r' + mode + indicator + ' '.repeat(Math.max(0, W() - 7 - indicator.length - rhs.length)) + rhs + '\u001b[K';
  };

  const clearLn = () => process.stdout.write('\u001b[2K\r');
  const prompt = () => chalk.cyan('▸ ') + inputBuf;

  const client = await getClient();

  console.log(chalk.dim(`Glia (${backend})`));
  process.stdout.write('\n');
  process.stdout.write(prompt() + '\n');
  process.stdout.write(bar());

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let lastCtrlC = 0;

  process.stdin.on('data', async (key) => {
    // Ctrl+C — twice to exit, once to cancel
    if (key === '\u0003') {
      if (currentRequest) {
        currentRequest.abort(); currentRequest = null;
        process.stdout.write(chalk.red('\n[cancelado]\n'));
        process.stdout.write(bar());
        return;
      }
      if (Date.now() - lastCtrlC < 800) { cleanup(); return; }
      lastCtrlC = Date.now();
      process.stdout.write(chalk.dim('\nCtrl+C de nuevo para salir\n'));
      process.stdout.write(bar());
      return;
    }

    if (key === '\u0004') { cleanup(); return; }

    // Esc — cancelar
    if (key === '\u001b') {
      if (currentRequest) {
        currentRequest.abort(); currentRequest = null;
        process.stdout.write(chalk.red('\n[cancelado]\n'));
        process.stdout.write(bar());
      }
      return;
    }

    // Tab — toggle plan/build
    if (key === '\t') { pm = !pm; process.stdout.write('\r' + bar()); return; }

    // Enter
    if (key === '\r' || key === '\n') {
      const txt = inputBuf.trim(); inputBuf = '';
      clearLn(); process.stdout.write(chalk.cyan('▸ ') + txt + '\n');

      if (txt === '/exit') { cleanup(); return; }
      if (txt === '/plan') { pm = true; drawPrompt(); process.stdout.write('\n' + bar()); return; }
      if (txt === '/build') { pm = false; drawPrompt(); process.stdout.write('\n' + bar()); return; }
      if (txt === '/clear') { console.clear(); drawPrompt(); process.stdout.write('\n' + bar()); return; }
      if (txt === '/new') { sid = null; drawPrompt(); process.stdout.write('\n' + bar()); return; }
      if (!txt) { drawPrompt(); process.stdout.write('\n' + bar()); return; }

      await sendMessageTUI(client, txt, bar);
      return;
    }

    if (key === '\u007f' || key === '\b') {
      if (inputBuf.length > 0) { inputBuf = inputBuf.slice(0, -1); drawPrompt(); }
      return;
    }

    if (key.length === 1) { inputBuf += key; drawPrompt(); return; }
  });
}

function drawPrompt() {
  process.stdout.write('\u001b[2K\r');
  process.stdout.write(chalk.cyan('▸ ') + inputBuf);
}

async function sendMessageTUI(client, txt, statusBar) {
  const abort = new AbortController();
  currentRequest = abort;
  const body = { text: txt, plan_mode: pm };
  if (sid) body.session_id = sid;

  // Show progress in status bar
  process.stdout.write('\r' + statusBar());

  try {
    const resp = await fetch(`${client.gliaUrl}/api/agent/chat`, {
      method: 'POST', headers: client.headers, body: JSON.stringify(body),
      signal: abort.signal
    });
    if (!resp.ok) Display.errorMsg(`HTTP ${resp.status}`);
    else await streamSSE(resp);
  } catch (e) {
    if (e.name !== 'AbortError') Display.errorMsg(e.message);
  }
  currentRequest = null;
  drawPrompt();
  process.stdout.write('\n' + statusBar());
}

function cleanup() {
  if (spinnerTimer) clearInterval(spinnerTimer);
  process.stdin.setRawMode(false);
  process.stdin.pause();
  console.log(chalk.dim('\nChau!\n'));
  process.exit(0);
}

// ── SSE Stream ────────────────────────────────────────────

async function streamSSE(resp, onEvent) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '', ev = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('event: ')) ev = line.slice(7).trim();
      else if (line.startsWith('data: ')) {
        try {
          const d = JSON.parse(line.slice(6));
          // Notificar al callback si existe (para capturar session_id)
          if (onEvent) onEvent(ev, d);
          switch (ev) {
            case 'reasoning': Display.reasoning(d.text || ''); break;
            case 'tool': Display.tool(d.text || '', d.status); break;
            case 'text': Display.message(d.text || ''); break;
            case 'question': Display.question(d.text || ''); break;
            case 'error': Display.errorMsg(d.message || d.text || ''); break;
            case 'done': Display.done(); break;
          }
        } catch {}
      }
    }
  }
}

main().catch(e => { Display.errorMsg(e.message); process.exit(1); });
