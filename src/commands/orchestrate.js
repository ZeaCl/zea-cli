import chalk from 'chalk';
import { execSync } from 'child_process';
import { WebSocket } from 'ws';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEYS || '';
const OPENCODE = process.env.OPENCODE_URL || 'http://localhost:4096';
const WS_URL = process.env.WS_URL || 'ws://localhost:4091';

let ws = null;
function wsEmit(event, data) {
  if (!ws || ws.readyState !== 1) return;
  try { ws.send(JSON.stringify({ event, data })); } catch {}
}

const expertDirs = {
  db: 'db', api: 'api', screen: 'screen', infra: 'infra', builder: 'builder', 'data-import': 'data-import'
};
function systemPromptFor(expert) {
  const dir = expertDirs[expert] || expert;
  const paths = [
    `experts/${dir}/SYSTEM.md`,
    `${os.homedir()}/.zea/experts/${dir}/SYSTEM.md`
  ];
  for (const p of paths) {
    try { return fs.readFileSync(p, 'utf8').trim(); } catch {}
  }
  return '';
}

const ALLOWLISTS = {
  db: [/^zea db\b/, /^zea venture data\b/],
  api: [/^zea venture api\b/, /^curl\b/],
  screen: [/^zea screen\b/, /^zea design\b/, /^zea validate\b/],
  infra: [/^zea diagnose\b/, /^zea verify\b/, /^docker\b/, /^curl\b/],
  builder: [/^git\b/, /^npm\b/, /^node\b/, /^mkdir\b/, /^echo\b/],
  'data-import': [/^python3\b/, /^zea venture data import\b/, /^zea screen analyze-file\b/],
};

function validateCommand(expert, command) {
  const allowlist = ALLOWLISTS[expert];
  if (!allowlist) return false;
  return allowlist.some(pattern => pattern.test(command));
}

async function askOrchestrator(systemPrompt, message, sessionName) {
  const system = systemPrompt || 'Sos el orquestador de ZEA Platform. Generá un plan JSON.';

  // Try opencode session for multi-turn context
  if (sessionName) {
    const sid = await ensureOrchSession(sessionName);
    if (sid) {
      try {
        const resp = await fetch(`${OPENCODE}/session/${sid}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: { providerID: 'deepseek', modelID: 'deepseek-v4-pro' },
            parts: [{ type: 'text', text: message }]
          })
        });
        const data = await resp.json();
        const text = (data.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
        if (text) {
          try {
            const jsonMatch = text.match(/\{[\s\S]*"analysis"[\s\S]*"plan"[\s\S]*"response"[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
          } catch {}
        }
      } catch { /* opencode failed, fallback to DeepSeek */ }
    }
  }

  // Fallback: call DeepSeek directly
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
  const dsData = await dsResp.json();
  return JSON.parse(dsData.choices?.[0]?.message?.content || '{}');
}

// Session management — multi-turn context
// Session management — multi-turn context via opencode
let orchidSessions = {};
function getOrCreateOrchSession(sessionName) {
  if (!sessionName) return null;
  if (orchidSessions[sessionName]) return orchidSessions[sessionName];
  return null; // Will create lazily via the message API
}

async function ensureOrchSession(sessionName) {
  if (!sessionName) return null;
  if (orchidSessions[sessionName]) return orchidSessions[sessionName];
  
  try {
    const resp = await fetch(`${OPENCODE}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `orch-${sessionName.slice(0, 30)}`, directory: '/workspace' })
    });
    const data = await resp.json();
    if (data.id) {
      orchidSessions[sessionName] = data.id;
      return data.id;
    }
  } catch (e) { console.error('Session error:', e.message); }
  return null;
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

    wsEmit('step:start', { step: i+1, total: plan.plan.length, expert, command: cmdWithContext });

    try {
      // Execute via opencode HTTP API (avoids shell escaping issues)
      const sidResp = await fetch(`${OPENCODE}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `step-${i+1}-${expert}`, directory: '/workspace' })
      });
      const sidData = await sidResp.json();
      const sid = sidData.id;

      const msgResp = await fetch(`${OPENCODE}/session/${sid}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: { providerID: 'deepseek', modelID: 'deepseek-v4-pro' },
          system: systemPromptFor(expert),
          parts: [{ type: 'text', text: cmdWithContext }]
        })
      });
      const msgData = await msgResp.json();
      const response = (msgData.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n');

      console.log(chalk.green(`  ✅ ${response.slice(0, 100)}`));
      context[`step${i+1}_result`] = 'ok';
      results.push({ step: i+1, expert, command: cmdWithContext, status: 'ok', response });
      wsEmit('step:ok', { step: i+1, expert, result: response.slice(0, 200) });

    } catch (e) {
      console.log(chalk.red(`  ❌ ${e.message?.slice(0, 100)}`));
      results.push({ step: i+1, expert, command: cmdWithContext, status: 'fail', error: e.message });
      wsEmit('step:fail', { step: i+1, error: e.message?.slice(0, 200) });

      // If fails, delegate to infra-expert
      let retryCount = 0;
      if (i < 2) { // retry up to 2 times
        try {
          console.log(chalk.yellow(`  → Delegando a infra-expert...`));
          wsEmit('delegate', { from: expert, to: 'infra', reason: e.message?.slice(0, 100) });
          const infraSidResp = await fetch(`${OPENCODE}/session`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `infra-fix-${i+1}`, directory: '/workspace' })
          });
          const infraSidData = await infraSidResp.json();
          const infraSid = infraSidData.id;

          await fetch(`${OPENCODE}/session/${infraSid}/message`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: { providerID: 'deepseek', modelID: 'deepseek-v4-pro' },
              system: systemPromptFor('infra'),
              parts: [{ type: 'text', text: `ERROR: ${cmdWithContext} failed. ${e.message?.slice(0, 200)}. Diagnose and fix.` }]
            })
          });

          // Retry original step
          const retrySidResp = await fetch(`${OPENCODE}/session`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `retry-${i+1}-${expert}`, directory: '/workspace' })
          });
          const retrySidData = await retrySidResp.json();
          const retrySid = retrySidData.id;

          const retryMsgResp = await fetch(`${OPENCODE}/session/${retrySid}/message`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: { providerID: 'deepseek', modelID: 'deepseek-v4-pro' },
              system: systemPromptFor(expert),
              parts: [{ type: 'text', text: cmdWithContext }]
            })
          });
          const retryData = await retryMsgResp.json();
          retryCount++;
          wsEmit('step:retry', { step: i+1, attempt: retryCount + 1 });
          console.log(chalk.green(`  ✅ Retry OK: ${(retryData.parts || []).filter(p => p.type === 'text').map(p => p.text).join(' ').slice(0, 100)}`));
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
    .option('--ws', 'Stream events to WebSocket (ws://localhost:4091)')
    .option('--domain <name>', 'Domain name (default: venture)')
    .option('--session <name>', 'Session name for multi-turn context (e.g., chat_id)')
    .action(async (message, opts) => {
      try {
        const domain = opts.domain || 'venture';
        
        // Load system prompt for orchestrator
        let system = systemPromptFor('orchestrator');
        
        // Load domain manifest — check package path first, then ~/.zea/
        let manifestPath = `domains/${domain}/manifest.json`;
        if (!fs.existsSync(manifestPath)) {
          manifestPath = `${os.homedir()}/.zea/domains/${domain}/manifest.json`;
        }
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          system = system
            .replace(/{{name}}/g, manifest.name)
            .replace(/{{label}}/g, manifest.label)
            .replace(/{{api_prefix}}/g, manifest.api_prefix)
            .replace(/{{api_port}}/g, String(manifest.api_port))
            .replace(/{{app_id}}/g, manifest.app_id)
            .replace(/{{app_url}}/g, manifest.app_url)
            .replace(/{{entities}}/g, manifest.entities)
            .replace(/{{out_of_scope_suggestions_json}}/g, JSON.stringify(manifest.out_of_scope_suggestions));
        } catch { /* use default system prompt without domain vars */ }

        // Inject platform state
        try {
          const verifyRaw = execSync('docker exec zea_opencode_local sh -c "cd /workspace/zea-cli && node src/index.js verify --app sudlich_ventures --json 2>&1"', { encoding: 'utf8', timeout: 15000 });
          const verify = JSON.parse(verifyRaw.trim());
          const state = { apis: { dashboard: verify.checks?.dashboard, funds: verify.checks?.funds }, domain };
          system = system.replace('{{PLATFORM_STATE}}', JSON.stringify(state, null, 2));
        } catch { system = system.replace('{{PLATFORM_STATE}}', '(estado no disponible)'); }

        // Connect to WebSocket if --ws flag
        if (opts.ws) {
          ws = new WebSocket(WS_URL);
          await new Promise((resolve) => { ws.on('open', resolve); setTimeout(resolve, 3000); });
        }

        console.log(chalk.bold(`\n═══ Orchestrating: "${message.slice(0, 80)}" ═══`));
        console.log(chalk.dim(`Domain: ${domain}`));

        // Step 1: Ask orchestrator for plan
        console.log(chalk.dim('\nAsking orchestrator...'));
        const plan = await askOrchestrator(system, message, opts.session);

        wsEmit('plan:ready', { analysis: plan.analysis, steps: plan.plan?.length || 0 });

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
        wsEmit('done', { ok, fail, response: plan.response });

      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
