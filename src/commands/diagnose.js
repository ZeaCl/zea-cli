import { execSync } from 'child_process';
import chalk from 'chalk';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEYS || '';

async function askAI(question, context) {
  const resp = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Sos un diagnosticador experto de infraestructura ZEA Platform. Respondé en español, directo, sin rodeos.' },
        { role: 'user', content: `Diagnóstico de ZEA Platform:\n\n${context}\n\nPregunta: ${question}` }
      ],
      temperature: 0.3, max_tokens: 2000
    })
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'No response from AI';
}

export function register(program) {
  const diagnoseCmd = program.command('diagnose').description('Diagnose ZEA Platform infrastructure');

  // ─── default ───────────────────────────────────────────
  diagnoseCmd
    .description('Run full platform diagnostic')
    .option('--ai <question>', 'Ask AI to interpret results')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const results = {};

      // 1. Containers
      try {
        const ps = execSync('docker ps --filter name=zea_ --format "{{.Names}} {{.Status}}"', { encoding: 'utf8', timeout: 5000 });
        results.containers = ps.trim().split('\n').filter(l => l).map(l => {
          const [name, ...status] = l.split(' ');
          return { name, status: status.join(' '), running: status[0] === 'Up' };
        });
      } catch (e) { results.containers = { error: e.message }; }

      // 2. Venture API
      try {
        const v = execSync("curl -s --max-time 5 http://venture.zea.localhost/gp/dashboard 2>/dev/null || echo '{}'", { encoding: 'utf8', timeout: 7000 });
        results.venture_api = v.includes('active_funds') ? 'healthy' : 'unhealthy';
      } catch (e) { results.venture_api = 'unreachable'; }

      // 3. ZEA Apps
      try {
        const a = execSync('curl -s --max-time 5 http://apps.zea.localhost/api/apps/sudlich_ventures/manifest 2>/dev/null | head -c 50', { encoding: 'utf8', timeout: 7000 });
        results.zea_apps = a.includes('error') || !a ? 'unhealthy' : 'healthy';
      } catch (e) { results.zea_apps = 'unreachable'; }

      // 4. OpenCode agents
      try {
        const oc = execSync("curl -s --max-time 5 http://localhost:4096/sessions 2>/dev/null | head -c 50", { encoding: 'utf8', timeout: 7000 });
        results.chat_agent = oc ? 'healthy' : 'unreachable';
      } catch (e) { results.chat_agent = 'unreachable'; }

      try {
        const om = execSync("curl -s --max-time 5 http://localhost:4097/sessions 2>/dev/null | head -c 50", { encoding: 'utf8', timeout: 7000 });
        results.maintenance_agent = om ? 'healthy' : 'unreachable';
      } catch (e) { results.maintenance_agent = 'unreachable'; }

      // 5. Error patterns
      try {
        const ep = execSync('cat ~/.zea/memory/maintenance/error_patterns.json 2>/dev/null || echo "{}"', { encoding: 'utf8', timeout: 5000 });
        const patterns = JSON.parse(ep);
        results.error_patterns = Object.keys(patterns).length;
        results.auto_fix_patterns = Object.values(patterns).filter(p => p.auto_fix).length;
      } catch (e) { results.error_patterns = 0; }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      // Pretty print
      console.log(chalk.bold('\nZEA Platform Diagnóstico\n'));

      console.log(chalk.cyan('Containers:'));
      if (Array.isArray(results.containers)) {
        results.containers.forEach(c => {
          const icon = c.running ? '✅' : '❌';
          console.log(`  ${icon} ${c.name}`);
        });
      }

      console.log(chalk.cyan('\nServices:'));
      console.log(`  Venture API: ${results.venture_api === 'healthy' ? '✅' : '❌'} ${results.venture_api}`);
      console.log(`  ZEA Apps:    ${results.zea_apps === 'healthy' ? '✅' : '❌'} ${results.zea_apps}`);
      console.log(`  Chat Agent:  ${results.chat_agent === 'healthy' ? '✅' : '❌'} ${results.chat_agent}`);
      console.log(`  Maint Agent: ${results.maintenance_agent === 'healthy' ? '✅' : '❌'} ${results.maintenance_agent}`);

      console.log(chalk.cyan('\nError Patterns:'));
      console.log(`  Total: ${results.error_patterns} | Auto-fix: ${results.auto_fix_patterns}`);

      // AI diagnosis
      if (opts.ai) {
        console.log(chalk.cyan(`\nAI Analysis:\n`));
        const context = JSON.stringify(results, null, 2);
        const answer = await askAI(opts.ai, context);
        console.log(answer);
      }
    });
}
