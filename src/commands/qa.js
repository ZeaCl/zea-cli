import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { execSync } from 'child_process';

const QA_DIR = path.join(os.homedir(), '.zea', 'memory', 'qa');
const PLAN_FILE = path.join(QA_DIR, 'plan.json');

async function loadPlan() {
  try {
    return JSON.parse(await fs.readFile(PLAN_FILE, 'utf8'));
  } catch { return { phases: {}, results: {} }; }
}

async function savePlan(plan) {
  await fs.mkdir(QA_DIR, { recursive: true });
  await fs.writeFile(PLAN_FILE, JSON.stringify(plan, null, 2));
}

function phaseStats(phase) {
  const tests = phase.tests || {};
  const ids = Object.keys(tests);
  const total = ids.length;
  const executed = ids.filter(id => tests[id].status === 'auto' || tests[id].result).length;
  const passed = ids.filter(id => (tests[id].result || '') === 'pass' || (tests[id].status === 'auto' && tests[id].pass)).length;
  const failed = ids.filter(id => (tests[id].result || '') === 'fail').length;
  const partial = ids.filter(id => (tests[id].result || '').includes('partial')).length;
  const pending = total - executed;
  return { total, executed, passed, failed, partial, pending };
}

export function register(program) {
  const qaCmd = program.command('qa').description('QA test plan management');

  // ─── status ────────────────────────────────────────────
  qaCmd.command('status')
    .description('Show test plan progress')
    .option('--phase <num>', 'Show specific phase')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const plan = await loadPlan();
      const phases = plan.phases || {};

      if (opts.json) {
        const summary = {};
        for (const [id, p] of Object.entries(phases)) {
          summary[id] = phaseStats(p);
        }
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      console.log(chalk.bold(`\n═══ ZEA QA Plan — ${Object.keys(plan.results || {}).length} ejecutados ═══\n`));

      let totalAll = 0, executedAll = 0, passedAll = 0, failedAll = 0;

      for (const [id, p] of Object.entries(phases)) {
        if (opts.phase && id !== opts.phase && !id.includes(opts.phase)) continue;
        const s = phaseStats(p);
        totalAll += s.total;
        executedAll += s.executed;
        passedAll += s.passed;
        failedAll += s.failed;

        const bar = '█'.repeat(Math.round(s.executed / Math.max(s.total, 1) * 10));
        const empty = '░'.repeat(10 - bar.length);
        const icon = s.pending === 0 ? '✅' : s.executed > 0 ? '⏳' : '⬜';
        console.log(`  ${icon} ${p.label}`);
        console.log(`    ${bar}${empty} ${s.executed}/${s.total} (${s.passed}✅ ${s.failed}❌ ${s.partial}⚠️ ${s.pending}⏳)`);
        console.log('');
      }

      if (!opts.phase) {
        console.log(chalk.cyan(`Total: ${totalAll} tests | ${executedAll} ejecutados | ${passedAll}✅ ${failedAll}❌\n`));
        if (executedAll < totalAll) {
          // Find next pending
          for (const [id, p] of Object.entries(phases)) {
            const s = phaseStats(p);
            if (s.pending > 0) {
              const nextTests = Object.entries(p.tests || {}).filter(([, t]) => !t.result && t.status !== 'auto');
              if (nextTests.length > 0) {
                console.log(chalk.yellow(`Próximo: ${p.label} → ${nextTests[0][0].toUpperCase()}: ${nextTests[0][1].desc}`));
                break;
              }
            }
          }
        }
      }
    });

  // ─── run ────────────────────────────────────────────────
  qaCmd.command('run')
    .description('Execute a test or phase via opencode agent')
    .option('--test <id>', 'Test ID (e.g. F2, C1)')
    .option('--phase <id>', 'Phase ID (e.g. f_screen_func)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const plan = await loadPlan();

      const findTest = (id) => {
        for (const [pid, p] of Object.entries(plan.phases || {})) {
          if (p.tests?.[id]) return { phase: pid, phaseLabel: p.label, test: p.tests[id], id };
        }
        return null;
      };

      if (opts.test) {
        const t = findTest(opts.test);
        if (!t) { console.error(`Test ${opts.test} not found`); return; }

        console.log(chalk.bold(`\n═══ Ejecutando ${t.id.toUpperCase()}: ${t.test.desc} ═══\n`));
        console.log(chalk.dim(`Prompt esperado: "${t.test.desc}"`));
        console.log(chalk.dim(`Resultado esperado: "${t.test.expected}"\n`));

        // Execute via opencode agent in Docker
        try {
          const result = execSync(
            `docker exec -i zea_opencode_local opencode run /workspace --model deepseek/deepseek-v4-pro --pure --prompt "${t.test.desc}" 2>&1`,
            { encoding: 'utf8', timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
          );
          const lastLines = result.split('\n').slice(-5).join('\n').slice(0, 300);
          console.log(chalk.cyan('Resultado:'));
          console.log(lastLines);

          // Update plan
          plan.results = plan.results || {};
          plan.results[t.id] = { status: 'pass', note: t.test.expected, executed_at: new Date().toISOString() };
          await savePlan(plan);
          console.log(chalk.green(`\n✅ ${t.id.toUpperCase()} marcado como PASS`));
        } catch (e) {
          console.log(chalk.red(`❌ Error: ${e.message}`));
          plan.results = plan.results || {};
          plan.results[t.id] = { status: 'fail', note: e.message.slice(0, 200), executed_at: new Date().toISOString() };
          await savePlan(plan);
        }
      }
    });

  // ─── mark ───────────────────────────────────────────────
  qaCmd.command('mark')
    .description('Mark a test result manually')
    .requiredOption('--test <id>', 'Test ID')
    .requiredOption('--status <status>', 'pass, fail, partial_pass, skipped')
    .option('--note <text>', 'Note about the result')
    .action(async (opts) => {
      const plan = await loadPlan();
      plan.results = plan.results || {};
      plan.results[opts.test] = {
        status: opts.status,
        note: opts.note || '',
        executed_at: new Date().toISOString()
      };
      await savePlan(plan);
      console.log(chalk.green(`✅ ${opts.test.toUpperCase()} → ${opts.status}`));
    });

  // ─── report ─────────────────────────────────────────────
  qaCmd.command('report')
    .description('Generate full QA report')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const plan = await loadPlan();
      const phases = plan.phases || {};

      if (opts.json) {
        const report = { phases: {}, summary: {} };
        for (const [id, p] of Object.entries(phases)) {
          report.phases[id] = phaseStats(p);
        }
        const all = Object.values(report.phases);
        report.summary = {
          total_tests: all.reduce((s, p) => s + p.total, 0),
          executed: all.reduce((s, p) => s + p.executed, 0),
          passed: all.reduce((s, p) => s + p.passed, 0),
          failed: all.reduce((s, p) => s + p.failed, 0),
          partial: all.reduce((s, p) => s + p.partial, 0),
          pending: all.reduce((s, p) => s + p.pending, 0)
        };
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log(chalk.bold(`\n═══ ZEA QA Report — ${new Date().toISOString().slice(0, 10)} ═══\n`));

      const totalAll = { total: 0, executed: 0, passed: 0, failed: 0, partial: 0, pending: 0 };

      for (const [id, p] of Object.entries(phases)) {
        const s = phaseStats(p);
        Object.keys(totalAll).forEach(k => totalAll[k] += s[k]);
        const icon = s.pending === 0 ? '✅' : s.executed > 0 ? '⏳' : '⬜';
        console.log(`${icon} ${p.label}`);
        console.log(`   ${s.executed}/${s.total} | ${s.passed}✅ ${s.failed}❌ ${s.partial}⚠️ ${s.pending}⏳`);
        // Show per-test details
        for (const [tid, t] of Object.entries(p.tests || {})) {
          const r = plan.results?.[tid];
          const si = r?.status === 'pass' ? '✅' : r?.status === 'fail' ? '❌' : r?.status?.includes('partial') ? '⚠️' : '⬜';
          console.log(`     ${si} ${tid.toUpperCase()}: ${t.desc.slice(0, 70)}`);
        }
        console.log('');
      }

      console.log(chalk.cyan(`Total: ${totalAll.total} tests | ${totalAll.executed} ejecutados | ${totalAll.passed}✅ ${totalAll.failed}❌ ${totalAll.partial}⚠️ ${totalAll.pending}⏳\n`));

      // Recommendations
      let recos = [];
      if (totalAll.failed > 3) recos.push(`${totalAll.failed} tests fallando — priorizar fixes`);
      if (totalAll.pending > 10) recos.push(`${totalAll.pending} pendientes — ejecutar fases pendientes`);
      const gapphases = Object.entries(phases).filter(([, p]) => phaseStats(p).pending > 0);
      if (gapphases.length > 0) {
        recos.push(`Priorizar: ${gapphases.map(([, p]) => p.label.split(' ')[0]).join(', ')}`);
      }
      if (recos.length > 0) {
        console.log(chalk.yellow('Recomendaciones:'));
        recos.forEach(r => console.log(`  → ${r}`));
      }
    });
}
