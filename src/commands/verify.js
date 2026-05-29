import { execSync } from 'child_process';
import chalk from 'chalk';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEYS || '';

async function askAI(prompt, context) {
  const resp = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Sos un verificador experto de ZEA Platform. Respondé en español, directo, con evidencias.' },
        { role: 'user', content: `${prompt}\n\nContexto:\n${context}` }
      ],
      temperature: 0.3, max_tokens: 3000
    })
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'No response';
}

export function register(program) {
  const verifyCmd = program.command('verify').description('E2E verification of app functionality');

  verifyCmd
    .description('Run full verification suite for an app')
    .requiredOption('--app <id>', 'App ID')
    .option('--llm', 'Generate AI-powered verification report')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const results = { app: opts.app, checks: {} };

      // 1. Venture API endpoints
      try {
        const dashboard = execSync("curl -s --max-time 5 http://venture-api:4081/gp/dashboard 2>/dev/null", { encoding: 'utf8', timeout: 7000 });
        results.checks.dashboard = dashboard.includes('active_funds') ? 'ok' : 'fail';
      } catch (e) { results.checks.dashboard = 'unreachable'; }

      try {
        const funds = execSync("curl -s --max-time 5 http://venture-api:4081/gp/funds 2>/dev/null", { encoding: 'utf8', timeout: 7000 });
        results.checks.funds = funds.includes('name') ? 'ok' : 'fail';
      } catch (e) { results.checks.funds = 'unreachable'; }

      try {
        const investors = execSync("curl -s --max-time 5 http://venture-api:4081/gp/investors 2>/dev/null", { encoding: 'utf8', timeout: 7000 });
        results.checks.investors = investors.includes('name') ? 'ok' : 'fail';
      } catch (e) { results.checks.investors = 'unreachable'; }

      // 2. Manifest
      try {
        const m = execSync(`curl -s --max-time 5 http://apps.zea.localhost/api/apps/${opts.app}/manifest 2>/dev/null`, { encoding: 'utf8', timeout: 7000 });
        const manifest = JSON.parse(m);
        const states = Object.keys(manifest.states || {});
        const intents = Object.keys(manifest.intent_routing || {});
        results.checks.manifest = { states: states.length, intents: intents.length, screens: states };
      } catch (e) { results.checks.manifest = { error: e.message }; }

      // 3. Bindings per screen
      try {
        const m2 = execSync(`curl -s --max-time 5 http://apps.zea.localhost/api/apps/${opts.app}/manifest 2>/dev/null`, { encoding: 'utf8', timeout: 7000 });
        const manifest2 = JSON.parse(m2);
        results.checks.bindings = {};
        for (const [name, state] of Object.entries(manifest2.states || {})) {
          if (state.type === 'StitchedScreen') {
            const binds = (state.html || '').match(/data-zea-bind="([^"]+)"/g) || [];
            results.checks.bindings[name] = [...new Set(binds.map(b => b.match(/"([^"]+)"/)[1]))];
          }
        }
      } catch (e) { results.checks.bindings = { error: e.message }; }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log(chalk.bold(`\nVerify: ${opts.app}\n`));
      console.log(chalk.cyan('APIs:'));
      for (const [k, v] of Object.entries(results.checks)) {
        if (k === 'bindings' || k === 'manifest') continue;
        console.log(`  ${v === 'ok' ? '✅' : '❌'} ${k}: ${v}`);
      }

      console.log(chalk.cyan('\nManifest:'));
      const m = results.checks.manifest;
      if (m.error) console.log(`  ❌ ${m.error}`);
      else console.log(`  ${m.states} states, ${m.intents} intents`);

      console.log(chalk.cyan('\nBindings:'));
      for (const [screen, binds] of Object.entries(results.checks.bindings || {})) {
        if (Array.isArray(binds)) console.log(`  ${screen}: ${binds.length > 0 ? binds.join(', ') : 'none'}`);
      }

      if (opts.llm) {
        console.log(chalk.cyan('\nAI Report:\n'));
        const answer = await askAI(
          'Generá un reporte de verificación de esta app ZEA. ¿Funciona todo? ¿Qué falta? ¿Qué recomendarías?',
          JSON.stringify(results, null, 2)
        );
        console.log(answer);
      }

    });
}
