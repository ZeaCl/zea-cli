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

// ── Dynamic PATH Discovery ──────────────────────────────
// Scans PATH for zea-<service> binaries and mounts them as subcommands.
// Built-in commands have zero knowledge of any service — everything is delegated.

async function getDynamicCommands() {
  const pathDirs = env.PATH ? env.PATH.split(path.delimiter) : [];
  const zeaCommands = new Set();

  for (const dir of pathDirs) {
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
    } catch (e) {
      continue;
    }
  }
  return Array.from(zeaCommands);
}

async function main() {
  const dynamicCommands = await getDynamicCommands();

  for (const cmd of dynamicCommands) {
    if (program.commands.some(c => c.name() === cmd)) continue;

    program.command(cmd)
      .allowUnknownOption()
      .description(`ZEA service (delegates to zea-${cmd})`)
      .action((...args) => {
        const cmdIndex = process.argv.indexOf(cmd);
        const forwardArgs = process.argv.slice(cmdIndex + 1);

        const result = spawnSync(`zea-${cmd}`, forwardArgs, {
          stdio: 'inherit',
          shell: true
        });

        process.exit(result.status || 0);
      });
  }

  program.parse(process.argv);
}

main().catch(console.error);
