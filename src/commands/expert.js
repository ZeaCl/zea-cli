/**
 * zea expert execute --name <expert> --task "..."
 * 
 * Executes a task using a ZEA expert's SYSTEM.md as system prompt.
 * The expert generates a command, which is executed via execSync.
 * This is the CLI equivalent of the bot's executeExpertStep.
 * 
 * Usage:
 *   zea expert execute --name data-import --task "importar fondos del Excel X"
 *   zea expert execute --name db --task "crear tabla test_scores"
 *   zea expert execute --name api --task "crear endpoint GET /gp/metrics"
 *   zea expert execute --name infra --task "diagnostica error 500 en capital_calls"
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import zeaFetch from '../lib/http.js';

const EXPERTS_DIR = path.join(os.homedir(), '.zea', 'experts');
const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

// Allowlists: what commands each expert can execute
const ALLOWLISTS = {
  'db':             ['zea db', 'zea venture data'],
  'api':            ['zea venture fund', 'zea venture investor', 'zea verify'],
  'screen':         ['zea screen', 'zea design', 'zea validate'],
  'infra':          ['zea diagnose', 'zea verify', 'docker', 'curl', 'git'],
  'builder':        ['git', 'npm', 'node', 'mkdir', 'touch'],
  'data-import':    ['zea venture data import', 'zea xlsx', 'zea verify', 'python3'],
  'orchestrator':   ['*'],
  'value-proposition': ['*'],
  'open-spec':      ['*'],
  'workflow':       ['*'],
};

async function deepseek(systemPrompt, userMessage) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });

  // Use zeaFetch for HTTPS (OS-level DNS)
  const https = await import('https');
  return new Promise((resolve, reject) => {
    const req = https.request(DEEPSEEK_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      timeout: 90000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices?.[0]?.message?.content || '');
        } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function isAllowed(expertName, command) {
  const allowed = ALLOWLISTS[expertName] || [];
  if (allowed.includes('*')) return true;
  return allowed.some(prefix => command.trim().startsWith(prefix));
}

export function register(program) {
  const expertCmd = program.command('expert').description('Expert execution commands');

  expertCmd.command('execute')
    .description('Execute a task using an expert system prompt')
    .requiredOption('--name <name>', 'Expert name (db, api, screen, infra, builder, data-import)')
    .requiredOption('--task <text>', 'Task description')
    .option('--no-exec', 'Only generate command, do not execute')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const { name, task } = opts;

        // 1. Load expert SYSTEM.md
        const systemPath = path.join(EXPERTS_DIR, name, 'SYSTEM.md');
        if (!fs.existsSync(systemPath)) {
          console.error(`❌ Expert "${name}" not found. Available: ${fs.readdirSync(EXPERTS_DIR).join(', ')}`);
          process.exit(1);
        }
        const systemPrompt = fs.readFileSync(systemPath, 'utf8');

        // 2. Call DeepSeek
        const fullTask = `${task}\n\nResponde en formato: ✅ [COMPLETADO] resumen | evidencia: métrica\nO ❌ [FALLÓ] razón | diagnóstico: detalle\nSi puedes ejecutar algo, incluye el comando CLI exacto entre ---CMD--- y ---END---.`;
        
        console.error(`⏳ ${name}-expert: ${task.slice(0, 80)}...`);
        const response = await deepseek(systemPrompt, fullTask);

        // 3. Extract command
        const cmdMatch = response.match(/---CMD---\s*\n?(.+?)\n?\s*---END---/s);
        const command = cmdMatch?.[1]?.trim();

        // 4. Output
        if (opts.json) {
          console.log(JSON.stringify({ expert: name, response, command: command || null, executed: false }));
        } else {
          console.log(response);
        }

        // 5. Execute if command found
        if (command && opts.exec !== false) {
          if (!isAllowed(name, command)) {
            console.log(`\n⚠️  Comando bloqueado por allowlist: ${command}`);
            return;
          }
          console.error(`\n🔧 Ejecutando: ${command}`);
          try {
            const result = execSync(command, { encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
            console.log(result);
          } catch (e) {
            console.error(`❌ Error: ${e.message?.slice(0, 300)}`);
            console.error(e.stdout?.toString()?.slice(0, 500) || '');
          }
        }
      } catch (e) {
        console.error(`❌ ${e.message}`);
        process.exit(1);
      }
    });

  expertCmd.command('list')
    .description('List available experts')
    .action(() => {
      if (!fs.existsSync(EXPERTS_DIR)) {
        console.log('No experts found.');
        return;
      }
      const experts = fs.readdirSync(EXPERTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(EXPERTS_DIR, d.name, 'SYSTEM.md')))
        .map(d => d.name);
      console.log('Available experts:');
      for (const e of experts) {
        const lines = fs.readFileSync(path.join(EXPERTS_DIR, e, 'SYSTEM.md'), 'utf8').split('\n');
        const role = lines.find(l => l.startsWith('## Rol'))?.replace('## Rol', '').trim() || '';
        console.log(`  ${e.padEnd(20)} ${role}`);
      }
    });
}
