import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const ZEA_DIR = path.join(os.homedir(), '.zea');
const PLATFORM_DIR = path.join(ZEA_DIR, 'platform');
const BRANCHES_DIR = path.join(ZEA_DIR, 'branches');

export function register(program) {
  const dbCmd = program.command('db').description('Database schema management');

  // ─── diff ──────────────────────────────────────────────
  dbCmd.command('diff')
    .description('Show SQL diff between branch and current DB')
    .option('--branch <name>', 'Branch name')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const sqlFile = opts.branch
          ? path.join(BRANCHES_DIR, opts.branch, 'db', 'init-venture.sql')
          : path.join(PLATFORM_DIR, 'code', 'init-venture.sql');

        let sql;
        try { sql = await fs.readFile(sqlFile, 'utf8'); }
        catch { throw new Error(`No schema found at ${sqlFile}`); }

        // Get current DB tables
        const dbTables = execSync(
          "docker exec zea_postgres_venture_local psql -U app_user -d venture_prod -t -c \"SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename\" 2>/dev/null || echo ''",
          { encoding: 'utf8', timeout: 10000 }
        ).trim().split('\n').filter(l => l.trim());

        // Extract CREATE TABLE statements from SQL
        const sqlTables = [];
        const re = /CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi;
        let m;
        while ((m = re.exec(sql)) !== null) {
          sqlTables.push(m[1]);
        }

        const missing = sqlTables.filter(t => !dbTables.includes(t));
        const extra = dbTables.filter(t => !sqlTables.includes(t) && t !== 'organizations' && t !== 'users');

        if (opts.json) {
          console.log(JSON.stringify({
            db_tables: dbTables,
            sql_tables: sqlTables,
            to_create: missing,
            to_remove: extra
          }, null, 2));
          return;
        }

        console.log(chalk.cyan(`DB Tables: ${dbTables.length} | SQL Tables: ${sqlTables.length}\n`));
        if (missing.length > 0) {
          console.log(chalk.green('To create:'));
          missing.forEach(t => console.log(`  + ${t}`));
        }
        if (extra.length > 0) {
          console.log(chalk.red('\nIn DB but not in SQL:'));
          extra.forEach(t => console.log(`  - ${t}`));
        }
        if (missing.length === 0 && extra.length === 0) {
          console.log('✅ DB in sync with SQL schema');
        }

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── push ──────────────────────────────────────────────
  dbCmd.command('push')
    .description('Apply SQL schema to the database')
    .option('--branch <name>', 'Branch name')
    .option('--yes', 'Skip confirmation')
    .action(async (opts) => {
      try {
        const sqlFile = opts.branch
          ? path.join(BRANCHES_DIR, opts.branch, 'db', 'init-venture.sql')
          : path.join(PLATFORM_DIR, 'code', 'init-venture.sql');

        let sql;
        try { sql = await fs.readFile(sqlFile, 'utf8'); }
        catch { throw new Error(`No schema found at ${sqlFile}`); }

        if (!opts.yes) {
          console.log(`About to apply: ${sqlFile} (${sql.length} bytes)`);
          console.log('Use --yes to skip confirmation.');
          return;
        }

        // Apply SQL via psql
        const result = execSync(
          `docker exec zea_postgres_venture_local psql -U app_user -d venture_prod -c "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1 || echo ''`,
          { encoding: 'utf8', timeout: 30000 }
        );

        console.log(chalk.green('✅ Schema applied to venture_prod'));
        if (result.trim()) console.log(result.slice(0, 500));

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── reset ─────────────────────────────────────────────
  dbCmd.command('reset')
    .description('Reset database to clean init-venture.sql schema')
    .option('--yes', 'Skip confirmation')
    .action(async (opts) => {
      try {
        if (!opts.yes) {
          console.log(chalk.red('⚠️  This will DELETE ALL DATA. Use --yes to confirm.'));
          return;
        }

        // Drop all tables
        execSync(
          "docker exec zea_postgres_venture_local psql -U app_user -d venture_prod -c \"DO \\$\\$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public') LOOP EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END \\$\\$;\" 2>&1",
          { encoding: 'utf8', timeout: 15000 }
        );

        // Re-apply schema
        const sqlFile = path.join(PLATFORM_DIR, 'code', 'init-venture.sql');
        const sql = await fs.readFile(sqlFile, 'utf8');
        execSync(
          `docker exec zea_postgres_venture_local psql -U app_user -d venture_prod -c "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1`,
          { encoding: 'utf8', timeout: 30000 }
        );

        console.log(chalk.green('✅ DB reset complete'));
        console.log('Next: zea venture seed --org <id> --user <email>');

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── migrations ────────────────────────────────────────
  const migrationsCmd = dbCmd.command('migrations').description('Migration management');

  migrationsCmd.command('new')
    .description('Create a new migration file')
    .requiredOption('--name <name>', 'Migration name (e.g. add-pending-tasks)')
    .action(async (opts) => {
      try {
        const migDir = path.join(PLATFORM_DIR, 'code', 'migrations');
        await fs.mkdir(migDir, { recursive: true });

        const timestamp = Date.now();
        const filename = `${timestamp}_${opts.name}.sql`;
        const filepath = path.join(migDir, filename);

        const template = `-- Migration: ${opts.name}
-- Created: ${new Date().toISOString()}
-- Up:

-- Down:
`;
        await fs.writeFile(filepath, template);
        console.log(chalk.green(`✅ Migration created: ${filename}`));
        console.log(`   ${filepath}`);

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  migrationsCmd.command('up')
    .description('Run pending migrations')
    .option('--all', 'Run all pending migrations')
    .option('--yes', 'Skip confirmation')
    .action(async (opts) => {
      try {
        console.log('Run pending migrations from: ~/.zea/platform/code/migrations/');
        console.log('(Apply manually or via db push for now)');
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  migrationsCmd.command('list')
    .description('List all migrations')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const migDir = path.join(PLATFORM_DIR, 'code', 'migrations');
        let files = [];
        try { files = await fs.readdir(migDir); } catch { /* empty */ }
        files = files.filter(f => f.endsWith('.sql')).sort();

        if (opts.json) {
          console.log(JSON.stringify(files, null, 2));
          return;
        }

        console.log(`Migrations: ${files.length}`);
        files.forEach(f => console.log(`  ${f}`));

      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── session ───────────────────────────────────────────
  dbCmd.command('session')
    .description('Start an isolated opencode session for DB development')
    .option('--branch <name>', 'Branch name')
    .action(async (opts) => {
      const sqlFile = opts.branch
        ? path.join(BRANCHES_DIR, opts.branch, 'db', 'init-venture.sql')
        : path.join(PLATFORM_DIR, 'code', 'init-venture.sql');

      console.log(chalk.cyan('DB Development Session\n'));
      console.log('Context:');
      console.log(`  Schema: ${sqlFile}`);
      console.log('  DB: postgres_venture:5432/venture_prod');
      console.log('  User: app_user');
      console.log('');
      console.log('Available commands:');
      console.log('  zea db diff          — compare schema with DB');
      console.log('  zea db push --yes    — apply schema changes');
      console.log('  zea db reset --yes   — reset DB to clean schema');
      console.log('  zea venture data add-table — create new table');
      console.log('');
      console.log('Start: docker exec -i zea_opencode_local opencode run /workspace --pure --prompt "..."');
    });
}
