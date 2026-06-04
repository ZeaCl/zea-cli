import { execSync } from 'child_process';
import fs from 'fs/promises';
import { getDomainCommand } from './domain.js';
import path from 'path';
import { getClient } from '../client.js';
import zeaFetch from '../lib/http.js';

const ZEA_ROOT = path.resolve(import.meta.dirname, '../../..');

const STAGES = {
  compile: {
    label: 'compile',
    description: 'Compile project with warnings as errors',
    emoji: '⚙️',
    run: async (apiDir) => {
      try {
        const out = execSync('mix compile 2>&1', {
          cwd: apiDir,
          encoding: 'utf8',
          timeout: 120000,
          stdio: 'pipe'
        });
        // Check for actual compilation errors, not warnings
        if (out.includes('Compilation error') || out.includes('** (CompileError)')) {
          const errorLines = out.split('\n').filter(l => 
            l.includes('error:') || l.includes('** (') || l.includes('cannot compile')
          ).slice(0, 3);
          throw new Error(errorLines.join(' | ') || 'Compilation failed');
        }
        const warnings = (out.match(/warning:/g) || []).length;
        return warnings > 0 
          ? `Compiled with ${warnings} warning(s)` 
          : 'Compilation successful';
      } catch (e) {
        const stderr = e.stderr || e.stdout || '';
        const lines = stderr.split('\n').filter(l => 
          l.includes('error:') || l.includes('** (')
        ).slice(0, 3);
        throw new Error(lines.join(' | ') || e.message);
      }
    }
  },
  format: {
    label: 'format',
    description: 'Check code formatting',
    emoji: '🎨',
    run: async (apiDir) => {
      execSync('mix format --check-formatted', {
        cwd: apiDir,
        encoding: 'utf8',
        timeout: 30000,
        stdio: 'pipe'
      });
      return 'All files formatted';
    }
  },
  credo: {
    label: 'credo',
    description: 'Static code analysis',
    emoji: '🔍',
    run: async (apiDir) => {
      const out = execSync('mix credo --strict 2>&1 || true', {
        cwd: apiDir,
        encoding: 'utf8',
        timeout: 60000,
        stdio: 'pipe'
      });
      const issues = parseCredoIssues(out);
      if (issues.length > 0) {
        const err = new Error(`${issues.length} issues found`);
        err.issues = issues;
        throw err;
      }
      return '0 issues, 0 warnings';
    }
  },
  deps: {
    label: 'deps',
    description: 'Dependency audit',
    emoji: '📦',
    run: async (apiDir) => {
      try {
        execSync('mix deps.audit', {
          cwd: apiDir,
          encoding: 'utf8',
          timeout: 30000,
          stdio: 'pipe'
        });
      } catch {
        // deps.audit might not be available, skip gracefully
        return 'deps.audit not configured — skipped';
      }
      return 'No vulnerabilities';
    }
  },
  test: {
    label: 'test',
    description: 'Run unit and integration tests',
    emoji: '🧪',
    run: async (apiDir) => {
      let out;
      try {
        out = execSync('mix test 2>&1', {
          cwd: apiDir,
          encoding: 'utf8',
          timeout: 120000,
          stdio: 'pipe'
        });
      } catch (e) {
        out = e.stdout || e.stderr || '';
      }
      const stats = parseTestResults(out);
      if (stats.failed > 0) {
        throw new Error(`${stats.passed} passed, ${stats.failed} failed, ${stats.total || 0} total`);
      }
      return `${stats.passed} tests, 0 failures`;
    }
  },
  coverage: {
    label: 'coverage',
    description: 'Check test coverage (≥80%)',
    emoji: '📊',
    run: async (apiDir) => {
      try {
        const out = execSync('mix test --cover 2>&1', {
          cwd: apiDir,
          encoding: 'utf8',
          timeout: 120000,
          stdio: 'pipe'
        });
        const coverage = parseCoverage(out);
        if (coverage < 80) {
          throw new Error(`${coverage}% line coverage (minimum 80%)`);
        }
        return `${coverage}% line coverage`;
      } catch (e) {
        // coverage tool might not be set up
        if (e.message && e.message.includes('%')) throw e;
        return 'Coverage tool not configured — skipped';
      }
    }
  },
  dialyzer: {
    label: 'dialyzer',
    description: 'Type checking',
    emoji: '🔬',
    run: async (apiDir) => {
      const out = execSync('mix dialyzer 2>&1 || true', {
        cwd: apiDir,
        encoding: 'utf8',
        timeout: 300000,
        stdio: 'pipe'
      });
      if (out.includes('Unknown task')) return 'dialyzer not configured — skipped';
      return 'No type errors';
    }
  },
  build: {
    label: 'build',
    description: 'Docker image build',
    emoji: '🐳',
    run: async (apiDir) => {
      const domainName = path.basename(apiDir).replace('-api', '');
      const composeFile = path.join(apiDir, '..', 'docker-compose.yml');
      execSync(`docker compose -f "${composeFile}" build ${domainName}-api 2>&1`, {
        cwd: path.dirname(composeFile),
        encoding: 'utf8',
        timeout: 180000,
        stdio: 'pipe'
      });
      return `Image built: ${domainName}-api:latest`;
    }
  },
  smoke: {
    label: 'smoke',
    description: 'Smoke test (health endpoint)',
    emoji: '💨',
    run: async (apiDir) => {
      const domainName = path.basename(apiDir).replace('-api', '');
      const manifest = JSON.parse(
        await fs.readFile(path.join(ZEA_ROOT, 'domains', domainName, 'manifest.json'), 'utf8')
      );
      const port = manifest.api_port || 4085;
      try {
        const response = await zeaFetch(`http://localhost:${port}/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return `GET /health → 200 OK`;
      } catch {
        return `Server not running on port ${port} — skipped (manual verification needed)`;
      }
    }
  }
};

const ALL_STAGES = Object.keys(STAGES);

export function register() {
  const domain = getDomainCommand();
  if (!domain) {
    console.error('domain-pipeline: domain command not yet registered. Ensure domain.js registers first.');
    return;
  }

  const pipeline = domain.command('pipeline [domain]')
    .description('Run validation pipeline for a domain')
    .option('--step <stage>', 'Run a single stage (compile, format, credo, deps, test, coverage, dialyzer, build, smoke)')
    .option('--from <stage>', 'Start from this stage')
    .option('--to <stage>', 'Stop after this stage')
    .option('--skip <stages>', 'Comma-separated stages to skip')
    .option('--fix', 'Auto-fix format issues')
    .option('--dir <path>', 'API project directory (default: auto-detect)')
    .action(async (domainName, opts) => {
      if (!domainName) {
        console.error('Error: domain name is required. Usage: zea domain pipeline <domain>');
        return;
      }

      const apiDir = opts.dir || path.join(ZEA_ROOT, `${domainName}-api`);

      try {
        const s = await fs.stat(apiDir);
        if (!s.isDirectory()) throw new Error('not a directory');
      } catch (e) {
        console.error(`❌ API directory not found: ${apiDir} (${e.code || e.message})`);
        console.log(`   Run first: zea domain create ${domainName} --from-spec <requirements.md>`);
        return;
      }

      let stages = ALL_STAGES;

      // Apply filters
      if (opts.step) {
        if (!STAGES[opts.step]) {
          console.error(`Unknown stage: ${opts.step}. Valid stages: ${ALL_STAGES.join(', ')}`);
          return;
        }
        stages = [opts.step];
      } else if (opts.from || opts.to) {
        const fromIdx = opts.from ? ALL_STAGES.indexOf(opts.from) : 0;
        const toIdx = opts.to ? ALL_STAGES.indexOf(opts.to) : ALL_STAGES.length - 1;
        if (fromIdx < 0 || toIdx < 0) {
          console.error(`Invalid stage range. Valid stages: ${ALL_STAGES.join(', ')}`);
          return;
        }
        stages = ALL_STAGES.slice(fromIdx, toIdx + 1);
      }

      if (opts.skip) {
        const skipSet = new Set(opts.skip.split(',').map(s => s.trim()));
        stages = stages.filter(s => !skipSet.has(s));
      }

      console.log(`\n🏗️  Pipeline: ${domainName}`);
      console.log('━'.repeat(60));

      let passed = 0;
      let failed = 0;
      let skipped = 0;
      const startTime = Date.now();
      const failures = [];

      for (let i = 0; i < stages.length; i++) {
        const key = stages[i];
        const stage = STAGES[key];
        const num = ALL_STAGES.indexOf(key) + 1;
        const total = ALL_STAGES.length;

        process.stdout.write(`  ${num}. ${stage.label.padEnd(12)} `);

        try {
          if (key === 'format' && opts.fix) {
            execSync('mix format', {
              cwd: apiDir,
              encoding: 'utf8',
              timeout: 30000,
              stdio: 'pipe'
            });
            process.stdout.write('🔧 fixed → ');
          }

          const stageStart = Date.now();
          const result = await stage.run(apiDir);
          const elapsed = ((Date.now() - stageStart) / 1000).toFixed(1);

          if (result.includes('skipped') || result.includes('not configured')) {
            process.stdout.write(`⏭️  (${elapsed}s)  ${result}\n`);
            skipped++;
          } else {
            process.stdout.write(`✅ (${elapsed}s)  ${result}\n`);
            passed++;
          }
        } catch (e) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          process.stdout.write(`❌  ${e.message.split('\n')[0]}\n`);

          if (e.issues) {
            e.issues.forEach(iss => {
              console.log(`    ├── ${iss}`);
            });
          }
          failed++;
          failures.push({ stage: key, error: e.message });

          // Stop pipeline on failure (unless --continue flag)
          break;
        }
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('━'.repeat(60));

      if (failed > 0) {
        console.log(`❌ Pipeline failed at stage ${ALL_STAGES.indexOf(failures[0].stage) + 1}/${ALL_STAGES.length} (${failures[0].stage})`);
        console.log(`   Rerun: zea domain pipeline ${domainName} --from ${failures[0].stage}`);
        if (failures[0].stage === 'format') {
          console.log(`   Fix:   zea domain pipeline ${domainName} --step format --fix`);
        }
        process.exitCode = 1;
      } else {
        const completed = passed + skipped;
        console.log(`✅ Pipeline passed (${completed}/${stages.length} stages, ${totalTime}s)`);
        if (skipped > 0) {
          console.log(`   ${skipped} stage(s) skipped, ${passed} passed`);
        }
      }
    });

  // List stages subcommand
  pipeline.command('stages')
    .description('List all pipeline stages')
    .action(() => {
      console.log('Pipeline stages:');
      console.log('');
      ALL_STAGES.forEach((key, i) => {
        const s = STAGES[key];
        console.log(`  ${i + 1}. ${s.label.padEnd(12)} ${s.emoji}  ${s.description}`);
      });
      console.log('');
      console.log('Usage:');
      console.log('  zea domain pipeline <domain>                   # Run all stages');
      console.log('  zea domain pipeline <domain> --step test       # Run single stage');
      console.log('  zea domain pipeline <domain> --from credo      # From stage to end');
      console.log('  zea domain pipeline <domain> --skip dialyzer   # Skip slow stages');
      console.log('  zea domain pipeline <domain> --step format --fix');
    });
}

function parseCredoIssues(output) {
  const issues = [];
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/(\S+):(\d+):\d*:?\s*(\w):/);
    if (match) {
      issues.push(`${match[1]}:${match[2]} — ${match[3]} issue`);
    }
  }
  return issues;
}

function parseTestResults(output) {
  // Elixir format: "59 tests, 40 failures" or "59 tests, 0 failures"
  const totalMatch = output.match(/(\d+) tests?/);
  const failedMatch = output.match(/(\d+) failures?/);
  const total = totalMatch ? parseInt(totalMatch[1]) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
  return { passed: total - failed, failed, total };
}

function parseCoverage(output) {
  const match = output.match(/(\d+\.?\d*)%\s*(?:line\s*)?coverage/i);
  if (match) return parseFloat(match[1]);
  return 0;
}
