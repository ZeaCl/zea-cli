import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readJSON, regenerateLearnings } from '../utils/learning.js';

const MEMORY_DIR = path.join(os.homedir(), '.zea', 'memory');

export function register(program) {
  const learnCmd = program.command('learn')
    .description('Reinforcement learning — analyze agent performance');

  learnCmd.command('patterns')
    .description('Show learned patterns for an app')
    .requiredOption('--app <id>', 'App ID')
    .action(async (opts) => {
      try {
        const dir = path.join(MEMORY_DIR, 'apps', opts.app);
        const data = await readJSON(path.join(dir, 'learnings.json'));
        if (!data || !data.actions || Object.keys(data.actions).length === 0) {
          console.log('No patterns learned yet. Actions are recorded automatically.');
          console.log(`Total history: ${data?.total_actions || 0} actions`);
          return;
        }

        console.log(`App: ${opts.app}`);
        console.log(`Actions analyzed: ${data.total_actions}`);
        console.log('');

        const sorted = Object.entries(data.actions)
          .sort(([, a], [, b]) => b.total_calls - a.total_calls);

        for (const [name, stats] of sorted) {
          const icon = stats.confidence >= 0.85 ? '🟢' : stats.confidence >= 0.5 ? '🟡' : '🔴';
          console.log(`${icon} ${name}`);
          console.log(`   Success: ${stats.success_rate * 100}% (${stats.total_calls} calls, ${stats.avg_time_ms}ms avg)`);
          console.log(`   Status: ${stats.status} | Confidence: ${stats.confidence}`);

          if (stats.common_errors?.length > 0) {
            console.log(`   ⚠️  Errors: ${stats.common_errors.map(e => e.error).join(', ')}`);
          }
          if (stats.regression) {
            console.log(`   📈 Fixed: ${stats.regression.pre_fix_rate}% → ${stats.regression.post_fix_rate}%`);
          }
          console.log('');
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  learnCmd.command('suggest')
    .description('Suggest optimal approach for an action')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--action <name>', 'Action name (e.g. design.import-screen)')
    .action(async (opts) => {
      try {
        const dir = path.join(MEMORY_DIR, 'apps', opts.app);
        const data = await readJSON(path.join(dir, 'learnings.json'));
        const history = await readJSON(path.join(dir, 'history.json')) || [];

        if (!data?.actions) {
          console.log('No patterns yet. Run some commands first.');
          return;
        }

        const action = data.actions[opts.action];
        const confidence = await readJSON(path.join(dir, 'confidence.json')) || {};

        if (action) {
          console.log(`Action: ${opts.action}`);
          console.log(`Success rate: ${action.success_rate * 100}% (${action.total_calls} calls)`);
          console.log(`Confidence: ${action.confidence} — ${action.status}`);
          console.log('');

          if (action.confidence < 0.5) {
            console.log('⚠️  LOW CONFIDENCE — ask user for confirmation');
            console.log(`   Recent failures: ${action.common_errors?.length || 0} error patterns`);
          } else if (action.confidence >= 0.85) {
            console.log('✅ HIGH CONFIDENCE — safe to execute automatically');
          }
        } else {
          console.log(`Action "${opts.action}" has no history yet.`);
        }

        // Find relevant sequences
        if (data.sequences) {
          const relevant = data.sequences.filter(s =>
            s.steps.some(step => step.includes(opts.action))
          );
          if (relevant.length > 0) {
            console.log('\nRelevant sequences:');
            for (const seq of relevant) {
              console.log(`  ${seq.steps.join(' → ')}`);
              console.log(`  Success: ${seq.success_rate * 100}% (${seq.count}x)`);
            }
          }
        }

        // Check global rules
        if (data.global_rules) {
          const relevantRules = data.global_rules.filter(r =>
            r.rule.includes(opts.action.replace(/\./g, '_'))
          );
          if (relevantRules.length > 0) {
            console.log('\nLearned rules:');
            for (const rule of relevantRules) {
              console.log(`  📋 ${rule.rule} (confidence: ${rule.confidence})`);
              if (rule.errors) console.log(`     Errors: ${rule.errors.join(', ')}`);
            }
          }
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  learnCmd.command('analyze')
    .description('Regenerate learnings from action history')
    .requiredOption('--app <id>', 'App ID')
    .action(async (opts) => {
      try {
        const result = await regenerateLearnings(opts.app);
        console.log(`✅ Learnings regenerated for ${opts.app}`);
        console.log(`   Actions analyzed: ${result.total_actions}`);
        console.log(`   Patterns found: ${Object.keys(result.actions || {}).length}`);
        console.log(`   Sequences: ${result.sequences?.length || 0}`);
        console.log(`   Global rules: ${result.global_rules?.length || 0}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  learnCmd.command('progress')
    .description('Show learning progress over time')
    .requiredOption('--app <id>', 'App ID')
    .action(async (opts) => {
      try {
        const dir = path.join(MEMORY_DIR, 'apps', opts.app);
        const history = await readJSON(path.join(dir, 'history.json')) || [];

        if (history.length === 0) {
          console.log('No history yet.');
          return;
        }

        // Group by day
        const byDay = {};
        for (const entry of history) {
          const day = entry.ts?.substring(0, 10);
          if (!byDay[day]) byDay[day] = { success: 0, failure: 0, actions: [] };
          byDay[day][entry.result === 'success' ? 'success' : 'failure'] += 1;
          if (!byDay[day].actions.includes(entry.action)) byDay[day].actions.push(entry.action);
        }

        console.log(`Progress for ${opts.app}:`);
        console.log('');
        console.log('  Day        │ Success │ Fail  │ Rate  │ Unique actions');
        console.log('  ───────────┼─────────┼───────┼───────┼───────────────');

        for (const [day, stats] of Object.entries(byDay).sort()) {
          const total = stats.success + stats.failure;
          const rate = total > 0 ? Math.round((stats.success / total) * 100) : 0;
          const bar = '█'.repeat(Math.round(rate / 10)) + '░'.repeat(10 - Math.round(rate / 10));
          console.log(`  ${day} │ ${String(stats.success).padStart(6)}  │ ${String(stats.failure).padStart(4)}  │ ${String(rate + '%').padStart(4)}  │ ${bar} │ ${stats.actions.length} actions`);
        }

        // Overall trend
        const totalSuccess = history.filter(e => e.result === 'success').length;
        const totalRate = Math.round((totalSuccess / history.length) * 100);
        const learnings = await readJSON(path.join(dir, 'learnings.json'));

        console.log('');
        console.log(`Overall: ${totalRate}% success (${history.length} total actions)`);
        console.log(`Patterns learned: ${Object.keys(learnings?.actions || {}).length}`);
        console.log(`Sequences detected: ${learnings?.sequences?.length || 0}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
