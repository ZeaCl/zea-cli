#!/usr/bin/env node
import { getClient } from './client.js';
import * as Display from './utils/display.js';
import chalk from 'chalk';

// Parse: glia [--plan] [--react] [mensaje...]
const args = process.argv.slice(2);
const planMode = args.includes('--plan');
const backend = args.includes('--react') ? 'react' : 'opencode';
const message = args.filter(a => !a.startsWith('--')).join(' ');

async function main() {
  if (message) {
    await chat(message);
  } else {
    await interactive();
  }
}

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

async function interactive() {
  const client = await getClient();
  let pm = planMode;
  let sid = null;

  console.log(chalk.dim(`\nGlia (${backend}) — chat interactivo`));
  console.log(chalk.dim('  /plan  /build  /clear  /new  /exit\n'));

  const readline = (await import('readline')).default;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: chalk.cyan('▸ ') });
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
    const input = line.trim();
    if (input === '/exit') { console.log(chalk.dim('Chau!\n')); rl.close(); return; }
    if (input === '/plan') { pm = true; console.log(chalk.yellow('  [plan mode]\n')); rl.prompt(); return; }
    if (input === '/build') { pm = false; console.log(chalk.green('  [build mode]\n')); rl.prompt(); return; }
    if (input === '/clear') { console.clear(); rl.prompt(); return; }
    if (input === '/new') { sid = null; console.log(chalk.dim('  [nueva sesión]\n')); rl.prompt(); return; }
    if (!input) { rl.prompt(); return; }
    await send(input);
  });
}

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
