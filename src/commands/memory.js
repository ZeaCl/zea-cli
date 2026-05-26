import { getClient, loadConfig } from '../client.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const MEMORY_DIR = path.join(os.homedir(), '.zea', 'memory');

function appPath(appId) {
  return path.join(MEMORY_DIR, 'apps', appId);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export function register(program) {
  const memoryCmd = program.command('memory').description('Agent memory management');

  memoryCmd.command('get')
    .description('Get memory key for an app')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--key <path>', 'Memory key path (e.g. stitch.screen_mappings)')
    .action(async (opts) => {
      try {
        const dir = appPath(opts.app);
        const parts = opts.key.split('.');
        const file = parts[0] + '.json';
        const fp = path.join(dir, file);
        const data = JSON.parse(await fs.readFile(fp, 'utf8'));
        const value = parts.slice(1).reduce((o, k) => o?.[k], data);
        console.log(JSON.stringify(value, null, 2));
      } catch (e) {
        if (e.code === 'ENOENT') {
          console.log('null');
        } else {
          console.error('Error:', e.message);
        }
      }
    });

  memoryCmd.command('set')
    .description('Set memory key for an app')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--key <path>', 'Memory key path')
    .requiredOption('--value <json>', 'JSON value')
    .option('--merge', 'Merge into existing object')
    .action(async (opts) => {
      try {
        const dir = appPath(opts.app);
        await ensureDir(dir);
        const parts = opts.key.split('.');
        const file = parts[0] + '.json';
        const fp = path.join(dir, file);

        let data = {};
        try { data = JSON.parse(await fs.readFile(fp, 'utf8')); } catch {}

        const value = JSON.parse(opts.value);
        if (parts.length === 1) {
          data = opts.merge ? { ...data, ...value } : value;
        } else {
          let node = data;
          for (let i = 1; i < parts.length - 1; i++) {
            if (!node[parts[i]]) node[parts[i]] = {};
            node = node[parts[i]];
          }
          node[parts[parts.length - 1]] = value;
        }

        await fs.writeFile(fp, JSON.stringify(data, null, 2));
        console.log(`Memory updated: ${opts.app}/${opts.key}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  memoryCmd.command('list')
    .description('List all memory for an app')
    .requiredOption('--app <id>', 'App ID')
    .action(async (opts) => {
      try {
        const dir = appPath(opts.app);
        const files = await fs.readdir(dir);
        const result = {};
        for (const f of files) {
          if (f.endsWith('.json')) {
            const key = f.replace('.json', '');
            result[key] = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
          }
        }
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        if (e.code === 'ENOENT') {
          console.log('{}');
        } else {
          console.error('Error:', e.message);
        }
      }
    });

  memoryCmd.command('init')
    .description('Initialize memory for an app')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--stitch-project <id>', 'Stitch project ID')
    .action(async (opts) => {
      try {
        const dir = appPath(opts.app);
        await ensureDir(dir);

        await fs.writeFile(path.join(dir, 'stitch.json'), JSON.stringify({
          project_id: opts.stitchProject,
          screen_mappings: {},
          last_sync: new Date().toISOString()
        }, null, 2));

        await fs.writeFile(path.join(dir, 'endpoints.json'), JSON.stringify({}, null, 2));
        await fs.writeFile(path.join(dir, 'context.json'), JSON.stringify({
          created: new Date().toISOString(),
          preferences: {}
        }, null, 2));
        await fs.writeFile(path.join(dir, 'history.json'), JSON.stringify([], null, 2));

        console.log(`Memory initialized for ${opts.app}`);
        console.log(`  Stitch project: ${opts.stitchProject}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
