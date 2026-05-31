import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import * as Display from '../utils/display.js';
import chalk from 'chalk';
import WebSocket from 'ws';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export function register(program) {
  const gliaCmd = program.command('glia').description('Glia Agent — Multi-Agent ReAct Engine');

  gliaCmd.command('chat [message]')
    .description('Chat one-shot con Glia via WebSocket (streaming en tiempo real)')
    .option('--tools <list>', 'Comma-separated tool names (bash, filesystem, etc.)')
    .action(async (message, options) => {
      const client = await getClient();
      const sessionId = 'cli-' + Date.now();

      if (message) {
        await wsChat(client, sessionId, message, options);
        process.exit(0);
      }

      await wsInteractive(client, sessionId, options);
    });

  gliaCmd.command('console')
    .description('REPL interactivo via WebSocket')
    .option('--tools <list>', 'Comma-separated tool names')
    .action(async (options) => {
      const client = await getClient();
      const sessionId = 'console-' + Date.now();
      await wsInteractive(client, sessionId, options);
    });

  const agentCmd = gliaCmd.command('agent').description('Agent management');

  agentCmd.command('create <id>')
    .description('Create a new agent with capabilities')
    .option('--skills <list>', 'Comma-separated capability names')
    .option('--system-prompt <text>', 'Custom system prompt')
    .action(async (id, options) => {
      const client = await getClient();
      const sessionId = 'admin-' + Date.now();

      await wsAdmin(client, sessionId, async (ws) => {
        const caps = options.skills ? options.skills.split(',').map(s => s.trim()) : [];
        const payload = { id, capabilities: caps };
        if (options.systemPrompt) payload.system_prompt = options.systemPrompt;

        const result = await sendAndWait(ws, 'create_agent', payload, 'agent_created');
        if (result) {
          console.log(chalk.green(`Agent '${result.id}' created`));
          if (result.capabilities?.length) console.log(`  Capabilities: ${result.capabilities.join(', ')}`);
        }
      });
    });

  agentCmd.command('list')
    .description('List running agents')
    .action(async () => {
      const client = await getClient();

      try {
        const response = await zeaFetch(`${client.gliaUrl}/api/agents`, {
          headers: { 'Authorization': `Bearer ${client.token}` }
        });

        if (response.ok) {
          const data = await response.json();
          const agents = data.agents || [];
          if (agents.length === 0) {
            console.log(chalk.dim('No agents running.'));
            return;
          }
          console.log('Active agents:');
          for (const a of agents) {
            const statusIcon = a.status === 'idle' ? '🟢' : a.status === 'busy' ? '🟡' : '⚫';
            console.log(`  ${statusIcon} ${a.id}  [${a.status}]  caps: ${(a.capabilities || []).join(', ')}`);
          }
        } else {
          console.log(chalk.yellow(`Agents endpoint returned ${response.status} — server may not be running.`));
        }
      } catch (e) {
        console.log(chalk.yellow(`Could not reach Glia: ${e.message}`));
      }
    });

  agentCmd.command('stop <id>')
    .description('Stop an agent')
    .action(async (id) => {
      console.log(chalk.dim(`Stop agent '${id}': connect to its session and send stop command.`));
      console.log(chalk.dim('For swarm-orchestrated agents, use: zea glia swarm stop --agent ' + id));
    });

  const swarmCmd = gliaCmd.command('swarm').description('Multi-agent orchestration');

  swarmCmd.command('create <id>')
    .description('Create a specialist agent for swarm')
    .option('--skills <list>', 'Capabilities (comma-separated)')
    .option('--system-prompt <text>', 'Custom system prompt')
    .action(async (id, options) => {
      const client = await getClient();
      const sessionId = 'swarm-' + Date.now();

      await wsAdmin(client, sessionId, async (ws) => {
        const caps = options.skills ? options.skills.split(',').map(s => s.trim()) : [];
        const payload = { id, capabilities: caps };
        if (options.systemPrompt) payload.system_prompt = options.systemPrompt;

        const result = await sendAndWait(ws, 'create_agent', payload, 'agent_created');
        if (result) console.log(chalk.green(`Swarm agent '${result.id}' created`));
      });
    });

  swarmCmd.command('run <message>')
    .description('Execute a task across the swarm')
    .option('--mode <mode>', 'Execution mode: parallel (default), sequential, pipeline')
    .option('--tools <list>', 'Comma-separated tool names')
    .action(async (message, options) => {
      const client = await getClient();
      const sessionId = 'swarm-run-' + Date.now();

      console.log(chalk.dim(`Swarm mode: ${options.mode || 'parallel'}`));
      console.log(chalk.cyan('▸ ') + message + '\n');

      await wsChat(client, sessionId, message, options);
    });

  // Missions (filesystem-based)
  gliaCmd.command('missions')
    .description('List available agent missions from ~/.zea/agents/')
    .action(async () => {
      const missionsDir = path.join(os.homedir(), '.zea', 'agents');
      try {
        const entries = await fs.readdir(missionsDir, { withFileTypes: true });
        const missions = entries.filter(e => e.isDirectory()).map(e => e.name);

        if (missions.length === 0) {
          console.log(chalk.dim('No missions found in ' + missionsDir));
          return;
        }
        console.log('Available missions:');
        for (const m of missions) {
          const soulPath = path.join(missionsDir, m, 'SOUL.md');
          try {
            await fs.access(soulPath);
            console.log(`  📄 ${m}`);
          } catch {
            console.log(`  ⬜ ${m} (no SOUL.md)`);
          }
        }
      } catch {
        console.log(chalk.dim(`Missions directory not found: ${missionsDir}`));
        console.log(chalk.dim('Create it: mkdir -p ~/.zea/agents/<mission>'));
      }
    });

  gliaCmd.command('set-soul <mission> <file>')
    .description('Create or update a mission SOUL.md')
    .action(async (mission, file) => {
      try {
        const content = await fs.readFile(file, 'utf8');
        const missionDir = path.join(os.homedir(), '.zea', 'agents', mission);
        await fs.mkdir(missionDir, { recursive: true });
        await fs.writeFile(path.join(missionDir, 'SOUL.md'), content);
        console.log(chalk.green(`Mission '${mission}' SOUL.md updated (${content.length} bytes)`));
      } catch (e) {
        Display.errorMsg(e.message);
      }
    });

  gliaCmd.action(async () => {
    await gliaCmd.commands.find(c => c.name() === 'console').parseAsync(['node', 'zea', 'console']);
  });
}

// ── WebSocket Helpers ────────────────────────────────────────

function wsUrl(client) {
  return (client.gliaWsUrl || 'ws://localhost:4002/socket/websocket') +
    `?vsn=2.0.0&token=${encodeURIComponent(client.token)}`;
}

function connectWS(client) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(client));
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 10000);

    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function joinChannel(ws, channel, topic) {
  return new Promise((resolve, reject) => {
    const ref = String(Date.now());
    const msg = [ref, ref, `${channel}:${topic}`, 'phx_join', {}];

    const handler = (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed[1] === ref && parsed[3] === 'phx_reply') {
          ws.removeListener('message', handler);
          if (parsed[4]?.status === 'ok') {
            ws._joinRef = ref;
            resolve();
          } else {
            reject(new Error(`Join failed: ${JSON.stringify(parsed[4])}`));
          }
        }
      } catch {}
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

function sendWS(ws, topic, event, payload) {
  const ref = String(Date.now());
  const joinRef = ws._joinRef || null;
  const msg = [joinRef, ref, topic, event, payload];
  ws.send(JSON.stringify(msg));
  return ref;
}

function sendAndWait(ws, event, payload, expectedReply, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for ' + expectedReply)), timeout);
    const ref = sendWS(ws, 'session:admin', event, payload);

    const handler = (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed[3] === expectedReply) {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(parsed[4]);
        } else if (parsed[1] === ref && parsed[3] === 'phx_reply') {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(parsed[4]?.response || parsed[4]);
        }
      } catch {}
    };

    ws.on('message', handler);
  });
}

// ── Admin WS (connect, do action, disconnect) ──────────────────

async function wsAdmin(client, sessionId, action) {
  let ws;
  try {
    ws = await connectWS(client);
    await joinChannel(ws, 'session', sessionId);
    await action(ws);
  } catch (e) {
    Display.errorMsg(e.message);
  } finally {
    if (ws) ws.close();
  }
}

// ── One-shot Chat ──────────────────────────────────────────────

async function wsChat(client, sessionId, message, options) {
  let ws;
  try {
    ws = await connectWS(client);
    await joinChannel(ws, 'session', sessionId);

    const tools = options.tools ? options.tools.split(',').map(s => s.trim()) : [];
    const runPayload = { message, tools };
    if (client.deepseekKey) runPayload.api_key = client.deepseekKey;
    let streamedContent = '';

    const done = await new Promise((resolve) => {
      const handler = (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          const event = parsed[3];
          const payload = parsed[4];

          switch (event) {
            case 'thinking_delta':
              process.stdout.write(chalk.gray(payload.content));
              break;
            case 'message_delta':
              streamedContent += (payload.content || '');
              process.stdout.write(payload.content);
              break;
            case 'tool_call':
              console.log(chalk.blue('\n  ⚙ ' + payload.name));
              break;
            case 'tool_result':
              console.log(chalk.dim('  ✓ ' + (payload.result || '').slice(0, 120)));
              break;
            case 'done':
              ws.removeListener('message', handler);
              if (payload.text && payload.text !== streamedContent) {
                console.log('\n' + chalk.green(payload.text));
              } else if (!streamedContent && payload.text) {
                console.log(chalk.green(payload.text));
              } else {
                console.log('');
              }
              resolve();
              break;
            case 'error':
              ws.removeListener('message', handler);
              Display.errorMsg(payload.message);
              resolve();
              break;
          }
        } catch {}
      };

      ws.on('message', handler);
      sendWS(ws, `session:${sessionId}`, 'run', runPayload);
    });

    await done;
  } catch (e) {
    Display.errorMsg(e.message);
  } finally {
    if (ws) ws.close();
  }
}

// ── Interactive Console ────────────────────────────────────────

async function wsInteractive(client, sessionId, options) {
  let ws;
  try {
    ws = await connectWS(client);
    await joinChannel(ws, 'session', sessionId);

    const tools = options.tools ? options.tools.split(',').map(s => s.trim()) : [];

    console.log(chalk.dim('\nGlia — WebSocket Console'));
    console.log(chalk.dim('  /exit  /history  /reset\n'));

    const readline = (await import('readline')).default;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('▸ '),
    });
    rl.prompt();

    let running = false;
    let handler = null;

    const sendAndStream = (text) => {
      running = true;

      handler = (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          const event = parsed[3];
          const payload = parsed[4];

          switch (event) {
            case 'thinking_delta':
              process.stdout.write(chalk.gray(payload.content));
              break;
            case 'message_delta':
              process.stdout.write(payload.content);
              break;
            case 'tool_call':
              console.log(chalk.blue('\n  ⚙ ' + payload.name));
              break;
            case 'tool_result':
              console.log(chalk.dim('  ✓ ' + (payload.result || '').slice(0, 120)));
              break;
            case 'done':
              ws.removeListener('message', handler);
              running = false;
              console.log('');
              rl.prompt();
              break;
            case 'error':
              ws.removeListener('message', handler);
              running = false;
              Display.errorMsg(payload.message);
              rl.prompt();
              break;
          }
        } catch {}
      };

      ws.on('message', handler);

      const runPayload = { message: text, tools };
      if (client.deepseekKey) runPayload.api_key = client.deepseekKey;
      sendWS(ws, `session:${sessionId}`, 'run', runPayload);
    };

    rl.on('line', (line) => {
      const input = line.trim();

      if (input === '/exit') {
        console.log(chalk.dim('Chau!\n'));
        rl.close();
        return;
      }

      if (input === '/reset') {
        sendWS(ws, `session:${sessionId}`, 'stop', {});
        console.log(chalk.dim('Session reset.\n'));
        rl.prompt();
        return;
      }

      if (!input) {
        rl.prompt();
        return;
      }

      if (running) {
        sendWS(ws, `session:${sessionId}`, 'stop', {});
        running = false;
        if (handler) ws.removeListener('message', handler);
        setTimeout(() => sendAndStream(input), 200);
      } else {
        sendAndStream(input);
      }
    });

    rl.on('close', () => {
      if (ws) ws.close();
      process.exit(0);
    });

  } catch (e) {
    Display.errorMsg(e.message);
    process.exit(1);
  }
}
