#!/usr/bin/env node
import { getClient } from './client.js';
import * as Display from './utils/display.js';
import chalk from 'chalk';

const args = process.argv.slice(2);
const planMode = args.includes('--plan');
const backend = args.includes('--react') ? 'react' : 'opencode';
const message = args.filter(a => !a.startsWith('--')).join(' ');

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

// ── Simple interactive (pipe / test) ─────────────────────

async function interactiveSimple() {
  const client = await getClient();
  let pm = planMode, sid = null;

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

async function interactiveTUI() {
  const W = () => process.stdout.columns || 80;

  const bar = () => {
    const mode = pm ? chalk.bgYellow.black(' Plan ') : chalk.bgBlue.white(' Build ');
    const rhs = chalk.dim('Tab=modo  Esc=cancelar');
    const w = W();
    return '\r' + mode + ' '.repeat(Math.max(0, w - mode.replace(/\u001b\[\d+m/g,'').length - rhs.replace(/\u001b\[\d+m/g,'').length)) + rhs + '\u001b[K';
  };

  const clearLn = () => process.stdout.write('\u001b[2K\r');
  const prompt = () => chalk.cyan('▸ ') + inputBuf;

  function redraw() {
    process.stdout.write('\u001b7');
    process.stdout.write('\u001b[1;1H\u001b[2K');
    process.stdout.write(bar());
    process.stdout.write('\n');
    clearLn();
    process.stdout.write(prompt());
    process.stdout.write('\u001b8');
  }

  const client = await getClient();

  console.log(chalk.dim(`Glia (${backend}) — Tab=modo  Esc=cancelar`));
  process.stdout.write(bar() + '\n');
  clearLn();
  process.stdout.write(prompt());

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (key) => {
    if (key === '\u0003' || key === '\u0004') { cleanup(); return; }

    if (key === '\u001b') {
      if (currentRequest) { currentRequest.abort(); currentRequest = null; console.log(chalk.red('\n[cancelado]')); }
      return;
    }

    if (key === '\t') { pm = !pm; process.stdout.write('\r' + bar()); return; }

    if (key === '\r' || key === '\n') {
      const txt = inputBuf.trim(); inputBuf = '';
      clearLn(); process.stdout.write(chalk.cyan('▸ ') + txt + '\n');
      process.stdout.write(bar() + '\n');

      if (txt === '/exit') { cleanup(); return; }
      if (txt === '/plan') { pm = true; process.stdout.write(bar() + '\n'); drawPrompt(); return; }
      if (txt === '/build') { pm = false; process.stdout.write(bar() + '\n'); drawPrompt(); return; }
      if (txt === '/clear') { console.clear(); process.stdout.write(bar() + '\n'); drawPrompt(); return; }
      if (txt === '/new') { sid = null; process.stdout.write(bar() + '\n'); drawPrompt(); return; }
      if (!txt) { drawPrompt(); return; }

      await sendMessageTUI(client, txt);
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

async function sendMessageTUI(client, txt) {
  const abort = new AbortController();
  currentRequest = abort;
  const body = { text: txt, plan_mode: pm };
  if (sid) body.session_id = sid;

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
  process.stdout.write('\r' + (pm ? chalk.bgYellow.black(' Plan ') : chalk.bgBlue.white(' Build ')) + chalk.dim(' Tab=modo  Esc=cancelar') + '\n');
  drawPrompt();
}

function cleanup() {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  console.log(chalk.dim('\nChau!\n'));
  process.exit(0);
}

// ── SSE Stream ────────────────────────────────────────────

async function streamSSE(resp) {
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
