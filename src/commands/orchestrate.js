import chalk from 'chalk';
import { execSync } from 'child_process';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEYS || '';
const OPENCODE = 'http://opencode:4096';

const ALLOWLISTS = {
  db: [/^zea db\b/, /^zea venture data\b/],
  api: [/^zea venture api\b/],
  screen: [/^zea screen\b/, /^zea design\b/, /^zea validate\b/],
  infra: [/^zea diagnose\b/, /^zea verify\b/, /^docker\b/],
  builder: [/^git\b/, /^npm\b/, /^node\b/, /^mkdir\b/, /^echo\b/],
};

function validateCommand(expert, command) {
  const allowlist = ALLOWLISTS[expert];
  if (!allowlist) return false;
  return allowlist.some(pattern => pattern.test(command));
}

async function askOrchestrator(message) {
  // Read system prompt from file
  let system;
  try {
    system = execSync('cat ~/.zea/experts/orchestrator/SYSTEM.md', { encoding: 'utf8' });
  } catch {
    system = 'Sos el orquestador de ZEA Platform. Generá un plan JSON.';
  }

  // Inject current platform state
  try {
    const verifyRaw = execSync('docker exec zea_opencode_local sh -c "cd /workspace/zea-cli && node src/index.js verify --app sudlich_ventures --json 2>&1"', { encoding: 'utf8', timeout: 15000 });
    const verify = JSON.parse(verifyRaw.trim());
    const checks = verify.checks || {};
    
    const designRaw = execSync('docker exec zea_opencode_local sh -c "cd /workspace/zea-cli && node src/index.js design status --app sudlich_ventures 2>&1"', { encoding: 'utf8', timeout: 10000 });
    
    const state = {
      apis: {
        dashboard: checks.dashboard === 'ok' ? '✅ YA EXISTE' : '❌ FALTA',
        funds: checks.funds === 'ok' ? '✅ YA EXISTE' : '❌ FALTA',
        investors: checks.investors === 'ok' ? '✅ YA EXISTE' : '❌ FALTA'
      },
      screens: designRaw.trim().slice(0, 500),
      active_funds: 'verificar con curl /gp/dashboard',
      NOTA: 'SI una API dice "YA EXISTE", NO la crees de nuevo. Solo functionalizá pantallas o diagnosticá problemas.'
    };
    
    system = system.replace('{{PLATFORM_STATE}}', JSON.stringify(state, null, 2));
  } catch {
    system = system.replace('{{PLATFORM_STATE}}', '(estado no disponible)');
  }

  const resp = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message }
      ],
      temperature: 0.1, max_tokens: 2000,
      response_format: { type: 'json_object' }
    })
  });
  const data = await resp.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

async function executePlan(plan) {
  const context = {};
  const results = [];

  for (let i = 0; i < plan.plan.length; i++) {
    const step = plan.plan[i];
    const { expert, command } = step;

    // Validate command against allowlist
    if (expert !== 'builder' && !validateCommand(expert, command)) {
      return { error: `Comando "${command}" no permitido para ${expert}-expert. Allowlist: ${ALLOWLISTS[expert]?.map(r => r.source).join(', ') || 'none'}` };
    }

    // Inject context from previous steps
    let cmdWithContext = command;
    if (context) {
      for (const [key, val] of Object.entries(context)) {
        cmdWithContext = cmdWithContext.replace(`{${key}}`, val);
      }
    }

    console.log(chalk.cyan(`\n[${i+1}/${plan.plan.length}] ${expert}-expert:`));
    console.log(chalk.dim(`  ${cmdWithContext}`));

    try {
      // Execute via opencode container
      const result = execSync(
        `docker exec -i zea_opencode_local opencode run /workspace --model deepseek/deepseek-v4-pro --pure --prompt "${cmdWithContext.replace(/"/g, '\\"')}" 2>&1`,
        { encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
      );

      const lastLines = result.split('\n').slice(-3).join(' | ');
      console.log(chalk.green(`  ✅ ${lastLines.slice(0, 100)}`));

      context[`step${i+1}_result`] = 'ok';
      results.push({ step: i+1, expert, command: cmdWithContext, status: 'ok' });

    } catch (e) {
      console.log(chalk.red(`  ❌ ${e.message?.slice(0, 100)}`));
      results.push({ step: i+1, expert, command: cmdWithContext, status: 'fail', error: e.message });

      // If fails, delegate to infra-expert
      if (i < 2) { // retry up to 2 times
        try {
          console.log(chalk.yellow(`  → Delegando a infra-expert...`));
          execSync(
            `docker exec -i zea_opencode_local opencode run /workspace --model deepseek/deepseek-v4-pro --pure --prompt "ERROR: ${cmdWithContext} failed. ${e.message?.slice(0, 200)}. Diagnose and fix." 2>&1`,
            { encoding: 'utf8', timeout: 120000 }
          );
          // Retry original step
          const retry = execSync(
            `docker exec -i zea_opencode_local opencode run /workspace --model deepseek/deepseek-v4-pro --pure --prompt "${cmdWithContext.replace(/"/g, '\\"')}" 2>&1`,
            { encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
          );
          console.log(chalk.green(`  ✅ Retry OK`));
        } catch (e2) {
          // Give up after retry
        }
      }
    }
  }

  return { results, context };
}

export function register(program) {
  program.command('orchestrate')
    .description('Orchestrate a client request across expert sessions')
    .argument('<message>', 'Client request')
    .option('--dry-run', 'Only plan, do not execute')
    .action(async (message, opts) => {
      try {
        console.log(chalk.bold(`\n═══ Orchestrating: "${message.slice(0, 80)}" ═══`));

        // Step 1: Ask orchestrator for plan
        console.log(chalk.dim('\nAsking orchestrator...'));
        const plan = await askOrchestrator(message);

        if (plan.error) {
          console.log(chalk.yellow(`\n${plan.error}`));
          if (plan.suggestions) console.log(`Suggestions: ${plan.suggestions.join(', ')}`);
          return;
        }

        console.log(chalk.cyan(`\nAnalysis: ${plan.analysis}`));
        console.log(chalk.cyan(`Plan: ${plan.plan.length} steps`));
        plan.plan.forEach((s, i) => console.log(`  ${i+1}. [${s.expert}] ${s.command?.slice(0, 80)}`));

        if (opts.dryRun) {
          console.log(chalk.yellow('\n[DRY RUN] Plan ready. Execute without --dry-run.'));
          return;
        }

        // Step 2: Execute plan
        console.log(chalk.dim('\nExecuting plan...'));
        const result = await executePlan(plan);

        // Step 3: Report
        const ok = result.results?.filter(r => r.status === 'ok').length || 0;
        const fail = result.results?.filter(r => r.status === 'fail').length || 0;
        console.log(chalk.bold(`\n═══ Result: ${ok}✅ ${fail}❌ ═══`));
        console.log(chalk.green(`\nResponse: ${plan.response || 'Done.'}`));

      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
