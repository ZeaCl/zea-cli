import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';

const ZEA_DIR = path.join(os.homedir(), '.zea');
const BRANCHES_DIR = path.join(ZEA_DIR, 'branches');
const PLATFORM_DIR = path.join(ZEA_DIR, 'platform');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export function register(program) {
  const branchCmd = program.command('branch').description('GitFlow branching for ZEA development');

  // ─── create ────────────────────────────────────────────
  branchCmd.command('create')
    .description('Create a new feature branch with isolated DB/API context')
    .requiredOption('--name <name>', 'Branch name (e.g. feat-pending-tasks)')
    .option('--yes', 'Skip confirmation')
    .action(async (opts) => {
      try {
        const branchDir = path.join(BRANCHES_DIR, opts.name);
        const dbDir = path.join(branchDir, 'db');
        const apiDir = path.join(branchDir, 'api');

        await ensureDir(dbDir);
        await ensureDir(apiDir);

        // Copy current DB schema as starting point
        const initSql = path.join(PLATFORM_DIR, 'code', 'init-venture.sql');
        try {
          const sql = await fs.readFile(initSql, 'utf8');
          await fs.writeFile(path.join(dbDir, 'init-venture.sql'), sql);
        } catch { /* no schema yet */ }

        // Copy current API stubs as starting point
        const apiStub = path.join(PLATFORM_DIR, 'api', 'gp_controller.ex');
        try {
          const api = await fs.readFile(apiStub, 'utf8');
          await fs.writeFile(path.join(apiDir, 'gp_controller.ex'), api);
        } catch { /* no stubs yet */ }

        // Status
        const status = {
          name: opts.name,
          created: new Date().toISOString(),
          status: 'active',
          db_changes: 0,
          api_changes: 0,
          experiment: null
        };
        await fs.writeFile(path.join(branchDir, 'status.json'), JSON.stringify(status, null, 2));

        console.log(chalk.green(`✅ Branch '${opts.name}' created`));
        console.log(`   DB context:  ${dbDir}/init-venture.sql`);
        console.log(`   API context: ${apiDir}/gp_controller.ex`);
        console.log(`\nNext: zea db session start --branch ${opts.name}`);
        console.log(`      zea api session start --branch ${opts.name}`);

        if (!opts.yes) {
          console.log(`\n${chalk.yellow('Tip:')} Use --yes to skip confirmation prompts in automation`);
        }

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── status ────────────────────────────────────────────
  branchCmd.command('status')
    .description('Show status of all branches')
    .option('--name <name>', 'Show a specific branch')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        await ensureDir(BRANCHES_DIR);
        const dirs = await fs.readdir(BRANCHES_DIR);
        const branches = [];

        for (const d of dirs) {
          if (opts.name && d !== opts.name) continue;
          const statusPath = path.join(BRANCHES_DIR, d, 'status.json');
          try {
            const status = JSON.parse(await fs.readFile(statusPath, 'utf8'));
            branches.push(status);
          } catch { /* skip */ }
        }

        if (opts.json) {
          console.log(JSON.stringify(branches, null, 2));
          return;
        }

        if (branches.length === 0) {
          console.log('No branches. Create one: zea branch create --name feat-<name>');
          return;
        }

        console.log(chalk.bold('Branches:\n'));
        for (const b of branches) {
          const icon = b.status === 'merged' ? '✅' : b.status === 'active' ? '🟢' : '🔴';
          console.log(`  ${icon} ${b.name}`);
          console.log(`     Status: ${b.status} | DB: ${b.db_changes} | API: ${b.api_changes}`);
          console.log(`     Created: ${new Date(b.created).toLocaleDateString()}`);
          console.log('');
        }

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── diff ──────────────────────────────────────────────
  branchCmd.command('diff')
    .description('Show diff between branch and main')
    .requiredOption('--name <name>', 'Branch name')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const branchDir = path.join(BRANCHES_DIR, opts.name);

        // DB diff
        const branchSql = path.join(branchDir, 'db', 'init-venture.sql');
        const mainSql = path.join(PLATFORM_DIR, 'code', 'init-venture.sql');
        let dbDiff = null;
        try {
          const branchContent = await fs.readFile(branchSql, 'utf8');
          const mainContent = await fs.readFile(mainSql, 'utf8');
          if (branchContent !== mainContent) {
            const branchLines = branchContent.split('\n');
            const mainLines = mainContent.split('\n');
            const added = branchLines.filter(l => !mainContent.includes(l.trim()) && l.trim().length > 0);
            dbDiff = { type: 'db', added_lines: added.length, changes: added.slice(0, 20) };
          }
        } catch { /* no diff */ }

        // API diff
        const branchApi = path.join(branchDir, 'api', 'gp_controller.ex');
        const mainApi = path.join(PLATFORM_DIR, 'api', 'gp_controller.ex');
        let apiDiff = null;
        try {
          const branchContent = await fs.readFile(branchApi, 'utf8');
          const mainContent = await fs.readFile(mainApi, 'utf8');
          if (branchContent !== mainContent) {
            const added = branchContent.split('\n').filter(l => !mainContent.includes(l.trim()) && l.trim().length > 0);
            apiDiff = { type: 'api', added_lines: added.length, changes: added.slice(0, 20) };
          }
        } catch { /* no diff */ }

        if (opts.json) {
          console.log(JSON.stringify({ db: dbDiff, api: apiDiff }, null, 2));
          return;
        }

        if (!dbDiff && !apiDiff) {
          console.log('No changes detected.');
          return;
        }

        if (dbDiff) {
          console.log(chalk.cyan('DB Changes:'));
          dbDiff.changes.forEach(c => console.log(`  + ${c.trim().slice(0, 80)}`));
        }
        if (apiDiff) {
          console.log(chalk.cyan('\nAPI Changes:'));
          apiDiff.changes.forEach(c => console.log(`  + ${c.trim().slice(0, 80)}`));
        }

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── merge ─────────────────────────────────────────────
  branchCmd.command('merge')
    .description('Merge branch into main (applies DB + API changes)')
    .requiredOption('--name <name>', 'Branch name')
    .option('--yes', 'Skip confirmation')
    .option('--dry-run', 'Preview merge without applying')
    .action(async (opts) => {
      try {
        const branchDir = path.join(BRANCHES_DIR, opts.name);
        const statusPath = path.join(branchDir, 'status.json');

        let status;
        try { status = JSON.parse(await fs.readFile(statusPath, 'utf8')); }
        catch { throw new Error(`Branch '${opts.name}' not found`); }

        if (status.status === 'merged') {
          console.log(`Branch '${opts.name}' already merged.`);
          return;
        }

        if (opts.dryRun) {
          console.log(chalk.yellow('[DRY RUN] Would merge:'));
          console.log(`  DB: ${status.db_changes} changes`);
          console.log(`  API: ${status.api_changes} changes`);
          return;
        }

        // Apply DB changes
        const branchSql = path.join(branchDir, 'db', 'init-venture.sql');
        const mainSql = path.join(PLATFORM_DIR, 'code', 'init-venture.sql');
        try {
          await fs.mkdir(path.join(PLATFORM_DIR, 'code'), { recursive: true });
          const sql = await fs.readFile(branchSql, 'utf8');
          await fs.copyFile(branchSql, mainSql + '.backup'); // backup
          await fs.writeFile(mainSql, sql);
          console.log('✅ DB merged to main');
        } catch { /* no DB changes */ }

        // Apply API changes
        const branchApi = path.join(branchDir, 'api', 'gp_controller.ex');
        const mainApi = path.join(PLATFORM_DIR, 'api', 'gp_controller.ex');
        try {
          await fs.mkdir(path.join(PLATFORM_DIR, 'api'), { recursive: true });
          const api = await fs.readFile(branchApi, 'utf8');
          await fs.copyFile(branchApi, mainApi + '.backup');
          await fs.writeFile(mainApi, api);
          console.log('✅ API merged to main');
        } catch { /* no API changes */ }

        // Update status
        status.status = 'merged';
        status.merged_at = new Date().toISOString();
        await fs.writeFile(statusPath, JSON.stringify(status, null, 2));

        console.log(chalk.green(`\n✅ Branch '${opts.name}' merged to main`));

        // Suggest rebuild
        console.log(`\nNext: docker compose build venture-api`);
        console.log(`      docker compose up -d venture-api`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── reset ─────────────────────────────────────────────
  branchCmd.command('reset')
    .description('Discard a branch (delete without merging)')
    .requiredOption('--name <name>', 'Branch name')
    .option('--yes', 'Skip confirmation')
    .action(async (opts) => {
      try {
        const branchDir = path.join(BRANCHES_DIR, opts.name);
        await fs.rm(branchDir, { recursive: true, force: true });
        console.log(`✅ Branch '${opts.name}' deleted`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
