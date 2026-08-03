import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import { handleError } from '../lib/errors.js';

const CONFIG_FILE = path.join(os.homedir(), '.config', 'zea', 'config.json');
function findSkillsLock() {
  const candidates = [
    path.resolve('skills-lock.json'), // cwd (dev)
    path.join(os.homedir(), '.config', 'opencode', 'skills-lock.json'),
  ];
  return candidates;
}

async function hashSkillsLock() {
  try {
    let lockPath;
    let lockData;
    for (const p of findSkillsLock()) {
      try {
        lockData = JSON.parse(await fs.readFile(p, 'utf8'));
        lockPath = p;
        break;
      } catch {}
    }
    if (!lockData) return { updated: 0, total: 0, error: 'skills-lock.json not found' };
    if (!lockData.skills) return { updated: 0, total: 0 };

    let updated = 0;
    const total = Object.keys(lockData.skills).length;

    for (const [name, entry] of Object.entries(lockData.skills)) {
      // Try common skill install directories
      const candidates = [
        path.join(os.homedir(), '.config', 'opencode', 'skills', name, 'SKILL.md'),
        path.join(os.homedir(), '.config', 'zea', 'skills', name, 'SKILL.md'),
        path.join(os.homedir(), '.pi', 'skills', name, 'SKILL.md'),
      ];

      let found = false;
      for (const skillPath of candidates) {
        try {
          const content = await fs.readFile(skillPath, 'utf8');
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          if (entry.computedHash !== hash) {
            entry.computedHash = hash;
            updated++;
          }
          found = true;
          break;
        } catch {}
      }
      if (!found && entry.computedHash === 'pending') {
        // Keep as pending if not found locally
      }
    }

    if (updated > 0) {
      await fs.writeFile(lockPath, JSON.stringify(lockData, null, 2) + '\n');
    }
    return { updated, total };
  } catch {
    return { updated: 0, total: 0, error: 'skills-lock.json not found' };
  }
}

async function load() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function save(config) {
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function register(program) {
  const configCmd = program.command('config').description('Manage ZEA configuration');

  configCmd
    .command('set-env <env>')
    .description('Set standard environment profile (local or prod)')
    .action(async (envName) => {
      try {
        const config = await load();
        if (envName === 'local') {
          config.apiUrl = 'http://auth.zea.localhost:8080';
          config.cerebelumUrl = 'http://cerebelum.zea.localhost:8080';
          config.ventureUrl = 'http://venture.zea.localhost:8080';
          config.sduiUrl = 'http://sdui.zea.localhost:8080';
          config.appsUrl = 'http://apps.zea.localhost:8080';
          config.gliaUrl = 'http://localhost:4002';
          config.gliaWsUrl = 'ws://localhost:4002/socket/websocket';
          config.sensorUrl = 'http://sensor.zea.localhost:8080';
          console.log(chalk.green(`✅ Environment set to LOCAL`));
        } else if (envName === 'prod') {
          config.apiUrl = 'https://auth.zea.cl';
          config.cerebelumUrl = 'https://cerebelum.zea.cl';
          config.ventureUrl = 'https://venture.zea.cl';
          config.sduiUrl = 'https://sdui.zea.cl';
          config.appsUrl = 'https://apps.zea.cl';
          config.gliaUrl = 'https://glia.zea.cl';
          config.gliaWsUrl = 'wss://glia.zea.cl/socket/websocket';
          config.sensorUrl = 'https://sensor.zea.cl';
          console.log(chalk.green(`✅ Environment set to PROD`));
        } else {
          console.log(chalk.red('Unknown environment. Use "local" or "prod".'));
          return;
        }
        await save(config);
      } catch (e) {
        handleError(e);
      }
    });

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key, value) => {
      try {
        const config = await load();
        config[key] = value;
        await save(config);
        console.log(chalk.green(`✅ ${key} = ${value}`));
      } catch (e) {
        handleError(e);
      }
    });

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key) => {
      try {
        const config = await load();
        if (config[key] !== undefined) {
          console.log(config[key]);
        } else {
          console.log(chalk.dim(`(not set: ${key})`));
        }
      } catch (e) {
        handleError(e);
      }
    });

  configCmd
    .command('list')
    .description('List all configuration values')
    .action(async () => {
      try {
        const config = await load();
        const keys = Object.keys(config);

        if (keys.length === 0) {
          console.log(chalk.dim('No configuration set.'));
          console.log(chalk.dim(`Config file: ${CONFIG_FILE}`));
          return;
        }

        console.log(chalk.cyan('ZEA Configuration:'));
        console.log(chalk.dim(`File: ${CONFIG_FILE}\n`));

        const masked = ['token', 'refreshToken', 'deepseek_key', 'deepseekKey'];

        for (const key of keys) {
          const val = masked.includes(key) ? '••••••••' + config[key].slice(-4) : config[key];
          console.log(`  ${chalk.yellow(key)}: ${val}`);
        }
      } catch (e) {
        handleError(e);
      }
    });

  configCmd
    .command('unset <key>')
    .description('Remove a configuration value')
    .action(async (key) => {
      try {
        const config = await load();
        delete config[key];
        await save(config);
        console.log(chalk.green(`✅ ${key} removed`));
      } catch (e) {
        handleError(e);
      }
    });

  configCmd
    .command('path')
    .description('Show config file path')
    .action(() => {
      console.log(CONFIG_FILE);
    });

  configCmd
    .command('lock-skills')
    .description('Recompute SHA256 hashes in skills-lock.json from installed skill files')
    .action(async () => {
      try {
        const result = await hashSkillsLock();
        if (result.error) {
          console.log(chalk.yellow(`⚠️  ${result.error}`));
        } else if (result.updated === 0) {
          console.log(chalk.green(`✅ ${result.total} skills — all hashes up to date`));
        } else {
          console.log(chalk.green(`✅ ${result.updated} of ${result.total} hashes updated`));
        }
      } catch (e) {
        handleError(e);
      }
    });
}
