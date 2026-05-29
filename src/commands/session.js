import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const EXPERTS_DIR = path.join(os.homedir(), '.zea', 'experts');
const OPENCODE_URL = process.env.OPENCODE_URL || 'http://opencode:4096';

const EXPERT_NAMES = ['orchestrator', 'db', 'api', 'screen', 'infra', 'builder'];

export function register(program) {
  const sessionCmd = program.command('session')
    .description('Manage opencode expert sessions');

  sessionCmd.command('create')
    .description('Create an expert session with domain-specific system prompt')
    .requiredOption('--expert <name>', `Expert type: ${EXPERT_NAMES.join(', ')}`)
    .action(async (opts) => {
      try {
        if (!EXPERT_NAMES.includes(opts.expert)) {
          console.error(`Unknown expert '${opts.expert}'. Use: ${EXPERT_NAMES.join(', ')}`);
          return;
        }

        const systemFile = path.join(EXPERTS_DIR, opts.expert, 'SYSTEM.md');
        let systemPrompt;
        try {
          systemPrompt = await fs.readFile(systemFile, 'utf8');
        } catch {
          console.error(`System prompt not found: ${systemFile}`);
          console.log('Create it at: ~/.zea/experts/{name}/SYSTEM.md');
          return;
        }

        // Create opencode session
        const resp = await fetch(`${OPENCODE_URL}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `expert-${opts.expert}`, directory: '/workspace' })
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const sid = data.id;

        // Set system prompt for the session
        await fetch(`${OPENCODE_URL}/session/${sid}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: { providerID: 'deepseek', modelID: 'deepseek-v4-pro' },
            system: systemPrompt,
            parts: [{ type: 'text', text: 'Entendido. Soy el experto. Espero instrucciones.' }]
          })
        });

        console.log(chalk.green(`\n✅ ${opts.expert}-expert session created`));
        console.log(`   Session ID: ${sid}`);
        console.log(`   System: ${systemFile} (${systemPrompt.length} chars)`);
        console.log(`\n   export ZEA_${opts.expert.toUpperCase()}_SESSION=${sid}`);

        // Save session ID for reference
        const sessionsFile = path.join(EXPERTS_DIR, 'sessions.json');
        let sessions = {};
        try { sessions = JSON.parse(await fs.readFile(sessionsFile, 'utf8')); } catch {}
        sessions[opts.expert] = { id: sid, created: new Date().toISOString() };
        await fs.writeFile(sessionsFile, JSON.stringify(sessions, null, 2));
        console.log(`   Saved to ~/.zea/experts/sessions.json`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  sessionCmd.command('list')
    .description('List all expert sessions')
    .action(async () => {
      try {
        const sessionsFile = path.join(EXPERTS_DIR, 'sessions.json');
        let sessions;
        try { sessions = JSON.parse(await fs.readFile(sessionsFile, 'utf8')); } catch {
          console.log('No expert sessions created yet.');
          console.log(`Create one: zea session create --expert ${EXPERT_NAMES[0]}`);
          return;
        }

        console.log(chalk.bold('\nExpert Sessions:\n'));
        for (const [name, info] of Object.entries(sessions)) {
          console.log(`  ${chalk.cyan(name)}: ${info.id}`);
          console.log(`    Created: ${new Date(info.created).toLocaleString()}`);
        }

        // Also check which system prompts exist
        console.log(chalk.bold('\nSystem Prompts:\n'));
        for (const name of EXPERT_NAMES) {
          const f = path.join(EXPERTS_DIR, name, 'SYSTEM.md');
          try {
            const stat = await fs.stat(f);
            const hasSession = sessions[name] ? '✅' : '⬜';
            console.log(`  ${hasSession} ${name}: ${stat.size} bytes`);
          } catch {
            console.log(`  ❌ ${name}: not found`);
          }
        }

      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
