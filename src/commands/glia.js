import { getClient } from '../client.js';
import * as Display from '../utils/display.js';
import chalk from 'chalk';

export function register(program) {
  const gliaCmd = program.command('glia').description('Glia Agent — chat interactivo con IA');

  gliaCmd.command('chat <message>')
    .description('Chat one-shot con Glia (SSE streaming)')
    .option('--plan', 'Plan mode (solo análisis)')
    .option('--backend <name>', 'Backend: opencode (default) o react')
    .action(async (message, options) => {
      try {
        const client = await getClient();
        const backend = options.backend || 'opencode';
        const planMode = options.plan || false;

        console.log(chalk.dim(`Glia (${backend})`));

        const response = await fetch(`${client.gliaUrl}/api/agent/chat`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({ text: message, plan_mode: planMode })
        });

        if (!response.ok) {
          Display.errorMsg(`HTTP ${response.status}`);
          process.exit(1);
        }

        await streamSSE(response, (event, data) => {
          switch (event) {
            case 'reasoning': Display.reasoning(data.text || ''); break;
            case 'tool': Display.tool(data.text || '', data.status); break;
            case 'text': Display.message(data.text || ''); break;
            case 'question': Display.question(data.text || ''); break;
            case 'error': Display.errorMsg(data.message || data.text || ''); break;
            case 'done': Display.done(); break;
          }
        });
        process.exit(0);
      } catch (e) {
        Display.errorMsg(e.message);
        process.exit(1);
      }
    });

  gliaCmd.command('interactive')
    .description('Chat interactivo con Glia (REPL con /plan, /exit)')
    .option('--backend <name>', 'Backend: opencode (default) o react')
    .action(async (options) => {
      try {
        const client = await getClient();
        const backend = options.backend || 'opencode';
        let planMode = false;
        let sessionId = null;

        console.log(chalk.dim(`\nGlia (${backend}) — chat interactivo`));
        console.log(chalk.dim('  /plan  /build  /clear  /new  /exit\n'));

        const readline = (await import('readline')).default;
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt: chalk.cyan('▸ '),
        });
        rl.prompt();

        const send = async (text) => {
          const body = { text, plan_mode: planMode };
          if (sessionId) body.session_id = sessionId;

          const response = await fetch(`${client.gliaUrl}/api/agent/chat`, {
            method: 'POST',
            headers: client.headers,
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            Display.errorMsg(`HTTP ${response.status}`);
            rl.prompt();
            return;
          }

          let done = false;
          await streamSSE(response, (event, data) => {
            if (event === 'done') { Display.done(); done = true; }
            else switch (event) {
              case 'reasoning': Display.reasoning(data.text || ''); break;
              case 'tool': Display.tool(data.text || '', data.status); break;
              case 'text': Display.message(data.text || ''); break;
              case 'question': Display.question(data.text || ''); break;
              case 'error': Display.errorMsg(data.message || data.text || ''); break;
            }
          });
          if (done) rl.prompt();
        };

        rl.on('line', async (line) => {
          const input = line.trim();
          if (input === '/exit') { console.log(chalk.dim('Chau!\n')); rl.close(); return; }
          if (input === '/plan') { planMode = true; console.log(chalk.yellow('  [plan mode]\n')); rl.prompt(); return; }
          if (input === '/build') { planMode = false; console.log(chalk.green('  [build mode]\n')); rl.prompt(); return; }
          if (input === '/clear') { console.clear(); rl.prompt(); return; }
          if (input === '/new') { sessionId = null; console.log(chalk.dim('  [nueva sesión]\n')); rl.prompt(); return; }
          if (!input) { rl.prompt(); return; }
          await send(input);
        });
      } catch (e) {
        Display.errorMsg(e.message);
        process.exit(1);
      }
    });

  // Default: interactive mode
  gliaCmd.action(async () => {
    const { interactive } = gliaCmd.commands.find(c => c.name() === 'interactive');
    await interactive.parseAsync(['node', 'zea', 'interactive']);
  });
}

// ── SSE Stream Helper ────────────────────────────────────

async function streamSSE(response, callback) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6);
        try {
          const data = JSON.parse(jsonStr);
          callback(eventType, data);
        } catch { /* skip */ }
      }
    }
  }
}
