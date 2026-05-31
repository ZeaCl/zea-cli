import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const CONFIG_FILE = path.join(os.homedir(), '.config', 'zea', 'config.json');

async function load() {
  try { return JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

async function save(config) {
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function register(program) {
  const configCmd = program.command('config').description('Manage ZEA configuration');

  configCmd.command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key, value) => {
      try {
        const config = await load();
        config[key] = value;
        await save(config);
        console.log(chalk.green(`✅ ${key} = ${value}`));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  configCmd.command('get <key>')
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
        console.error('Error:', e.message);
      }
    });

  configCmd.command('list')
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
          const val = masked.includes(key)
            ? '••••••••' + config[key].slice(-4)
            : config[key];
          console.log(`  ${chalk.yellow(key)}: ${val}`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  configCmd.command('unset <key>')
    .description('Remove a configuration value')
    .action(async (key) => {
      try {
        const config = await load();
        delete config[key];
        await save(config);
        console.log(chalk.green(`✅ ${key} removed`));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  configCmd.command('path')
    .description('Show config file path')
    .action(() => {
      console.log(CONFIG_FILE);
    });
}
