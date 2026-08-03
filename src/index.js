#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { env } from 'process';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const program = new Command();

program
  .name('zea')
  .description('ZEA Platform CLI — thin router for service CLIs')
  .version(pkg.version)
  .option('--output <format>', 'Output format: json, table, text', 'table')
  .option('--debug', 'Show HTTP request/response details', false)
  .option('--dry-run', 'Validate without executing (create/update/delete only)', false)
  .option('--quiet', 'Suppress non-essential output', false)
  .option('--no-color', 'Disable ANSI colors', false);

// ── Built-in commands ──────────────────────────────────
// Core commands that don't belong to any service.
import { register as registerConfig } from './commands/config.js';

registerConfig(program);

// ── Dynamic PATH Discovery ──────────────────────────────
// Scans PATH and node_modules/.bin for zea-<service> binaries and mounts
// them as subcommands. Built-in commands have zero knowledge of any service.

function resolveBinDirs() {
  const dirs = [];
  // PATH directories
  if (env.PATH) dirs.push(...env.PATH.split(path.delimiter));
  // Global npm bin (sibling .bin of the CLI package)
  const selfDir = path.dirname(path.dirname(new URL(import.meta.url).pathname));
  dirs.push(path.join(selfDir, '.bin'));
  // nvm-style global bin (e.g. ~/.nvm/versions/node/<ver>/bin)
  if (process.execPath) {
    dirs.push(path.dirname(process.execPath));
  }
  return dirs;
}

async function getDynamicCommands() {
  const searchDirs = resolveBinDirs();
  const zeaCommands = new Set();

  for (const dir of searchDirs) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.startsWith('zea-') && file !== 'zea-agent-skill' && file !== 'zea-cli') {
          const baseName = file.split('.')[0];
          const commandName = baseName.substring(4); // Strip 'zea-'
          if (commandName) {
            zeaCommands.add(commandName);
          }
        }
      }
    } catch {
      continue;
    }
  }
  return Array.from(zeaCommands);
}

async function main() {
  const dynamicCommands = await getDynamicCommands();

  for (const cmd of dynamicCommands) {
    if (program.commands.some((c) => c.name() === cmd)) continue;

    program
      .command(cmd)
      .allowUnknownOption()
      .description(`ZEA service (delegates to zea-${cmd})`)
      .action((..._args) => {
        const cmdIndex = process.argv.indexOf(cmd);
        const forwardArgs = process.argv.slice(cmdIndex + 1);

        const result = spawnSync(`zea-${cmd}`, forwardArgs, {
          stdio: 'inherit',
          shell: true,
        });

        process.exit(result.status || 0);
      });
  }

  program.parse(process.argv);
}

main().catch(console.error);
