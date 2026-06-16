#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { spawnSync } from 'child_process';
import { env } from 'process';

import { register as registerAuth } from './commands/auth.js';
import { register as registerOrg } from './commands/org.js';
import { register as registerToken } from './commands/token.js';
import { register as registerConfig } from './commands/config.js';
import { register as registerSession } from './commands/session.js';
import { register as registerShell } from './commands/shell.js';

const program = new Command();

program
  .name('zea')
  .description('ZEA Core Platform CLI')
  .version('2.0.0');

// 1. Registramos comandos core transversales (Auth)
registerAuth(program);
registerOrg(program);
registerToken(program);
registerConfig(program);
registerSession(program);
registerShell(program);

// 2. Lógica de Delegación Dinámica (Dynamic PATH Discovery)
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
      .description(`External ZEA command (delegates to zea-${cmd})`)
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
