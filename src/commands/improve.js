import zeaFetch from '../lib/http.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEYS || '';
const LEARNINGS_FILE = path.join(os.homedir(), '.zea', 'memory', 'learnings.json');
const SKILLS_DIR = path.join(os.homedir(), '.glia', 'skills');
const QA_PLAN = path.join(os.homedir(), '.zea', 'memory', 'qa', 'plan.json');

async function loadLearnings() {
  try { return JSON.parse(await fs.readFile(LEARNINGS_FILE, 'utf8')); }
  catch { return []; }
}

async function saveLearnings(learnings) {
  await fs.mkdir(path.dirname(LEARNINGS_FILE), { recursive: true });
  await fs.writeFile(LEARNINGS_FILE, JSON.stringify(learnings, null, 2));
}

async function askAI(prompt) {
  const resp = await zeaFetch(DEEPSEEK_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5, max_tokens: 3000
    })
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractScore(output) {
  const match = output.match(/Score:?\s*(\d+)/i) || output.match(/(\d+)\/100/) || output.match(/(\d+)%/);
  return match ? parseInt(match[1]) : null;
}

function extractBindingsCount(output) {
  const match = output.match(/Bindings?:?\s*(\d+)/i);
  return match ? parseInt(match[1]) : 0;
}

export function register(program) {
  const improveCmd = program.command('improve')
    .description('Iteratively improve a skill by measuring, analyzing, adjusting, and retrying');

  improveCmd
    .requiredOption('--skill <name>', 'Skill name (e.g. screen-functionalizer)')
    .option('--test <id>', 'Test ID to measure improvement (e.g. F2)')
    .option('--max-iterations <n>', 'Max iterations', '3')
    .option('--dry-run', 'Analyze only, do not modify files')
    .action(async (opts) => {
      const skillPath = path.join(SKILLS_DIR, opts.skill, 'SKILL.md');
      let skillContent;

      try { skillContent = await fs.readFile(skillPath, 'utf8'); }
      catch { console.error(`Skill '${opts.skill}' not found at ${skillPath}`); return; }

      const maxIter = parseInt(opts.maxIterations);
      const learnings = await loadLearnings();
      let baselineScore = null;

      // ── Measure baseline ──────────────────────────────
      console.log(chalk.bold(`\n═══ Improve: ${opts.skill} ═══`));
      console.log(chalk.dim(`Max iterations: ${maxIter} | Dry run: ${opts.dryRun}\n`));

      if (opts.test) {
        console.log(chalk.cyan(`Measure baseline: ${opts.test}`));
        try {
          const result = execSync(
            `docker exec zea_opencode_local sh -c "cd /workspace/zea-cli && node src/index.js screen functionalize --app sudlich_ventures --screen dashboard --llm" 2>&1`,
            { encoding: 'utf8', timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
          );
          baselineScore = extractBindingsCount(result);
          console.log(`   Baseline: ${baselineScore} bindings\n`);
        } catch (e) {
          baselineScore = 0;
          console.log(`   ❌ Measurement failed: ${e.message}\n`);
        }
      }

      // ── Iterate ────────────────────────────────────────
      for (let i = 1; i <= maxIter; i++) {
        console.log(chalk.cyan(`─── Iteration ${i}/${maxIter} ───`));

        // Analyze
        console.log(`   Analyze: asking LLM what to improve...`);
        const analysis = await askAI(
          `Este es el SKILL.md actual del skill '${opts.skill}' de ZEA Platform:

${skillContent.slice(0, 5000)}

Resultado actual del test: ${baselineScore} bindings.
Quiero mejorar la precisión de este skill.
¿Qué ajuste específico al prompt o a las instrucciones mejoraría el resultado?
Respondé en español, directo, con el texto EXACTO que debería cambiarse y por qué.`
        );

        const adjustment = analysis.split('\n').filter(l => l.trim()).slice(0, 5).join('\n');
        console.log(`   Suggestion: ${adjustment.slice(0, 200)}...`);

        if (opts.dryRun) {
          console.log(chalk.yellow(`   [DRY RUN] Would modify: ${skillPath}`));
          continue;
        }

        // Backup
        const backup = skillContent;
        const backupPath = skillPath + `.backup-${Date.now()}`;
        await fs.writeFile(backupPath, backup);

        // Adjust
        const newContent = skillContent + `\n\n<!-- Improvement iteration ${i} -->\n${adjustment}\n`;
        await fs.writeFile(skillPath, newContent);

        // Retry
        console.log(`   Retry: running test...`);
        await new Promise(r => setTimeout(r, 3000)); // wait for file sync

        try {
          const result = execSync(
            `docker exec zea_opencode_local sh -c "cd /workspace/zea-cli && node src/index.js screen functionalize --app sudlich_ventures --screen dashboard --llm" 2>&1`,
            { encoding: 'utf8', timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
          );
          const newScore = extractBindingsCount(result);

          // Compare
          if (newScore > baselineScore) {
            console.log(chalk.green(`   ✅ Improved: ${baselineScore} → ${newScore} bindings`));
            baselineScore = newScore;
            skillContent = newContent;

            learnings.push({
              skill: opts.skill,
              iteration: i,
              before: baselineScore,
              after: newScore,
              change: adjustment.slice(0, 300),
              timestamp: new Date().toISOString(),
              result: 'improved'
            });
            await saveLearnings(learnings);

            if (newScore >= 20) {
              console.log(chalk.green(`   Converged at ${newScore} bindings`));
              break;
            }
          } else {
            // Revert
            console.log(chalk.red(`   ❌ No improvement: ${baselineScore} → ${newScore}. Reverting.`));
            await fs.writeFile(skillPath, backup);

            learnings.push({
              skill: opts.skill,
              iteration: i,
              before: baselineScore,
              after: newScore,
              change: adjustment.slice(0, 300),
              timestamp: new Date().toISOString(),
              result: 'reverted'
            });
            await saveLearnings(learnings);
          }
        } catch (e) {
          console.log(chalk.red(`   ❌ Error: ${e.message}. Reverting.`));
          await fs.writeFile(skillPath, backup);
        }
      }

      // ── Summary ────────────────────────────────────────
      console.log(chalk.bold(`\n═══ Improve Complete ═══`));
      console.log(`   Skill: ${opts.skill}`);
      console.log(`   Final bindings: ${baselineScore}`);
      console.log(`   Learnings saved: ${LEARNINGS_FILE}`);

      const recentLearnings = learnings.filter(l => l.skill === opts.skill).slice(-3);
      if (recentLearnings.length > 0) {
        console.log(`\n   Recent improvements:`);
        recentLearnings.forEach(l => {
          const icon = l.result === 'improved' ? '✅' : '❌';
          console.log(`     ${icon} Iter ${l.iteration}: ${l.before} → ${l.after} (${l.result})`);
        });
      }
    });
}
