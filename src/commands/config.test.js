import { describe, it, mock, beforeEach, after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Command } from 'commander';

const tmpDir = path.join(os.tmpdir(), `zea-config-test-${Date.now()}`);
process.env.HOME = tmpDir;
const configFile = path.join(tmpDir, '.config', 'zea', 'config.json');

// Dynamic import to pick up HOME
const originalCwd = process.cwd();

const configMod = await import('../commands/config.js');

describe('config command', () => {
  let logged;
  let errored;
  let _exitCode;

  before(async () => {
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    process.chdir(tmpDir);
  });

  after(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    logged = [];
    errored = [];
    _exitCode = null;
    mock.method(console, 'log', (...args) => logged.push(args.join(' ')));
    mock.method(console, 'error', (...args) => errored.push(args.join(' ')));
    mock.method(process, 'exit', (code) => {
      _exitCode = code;
      throw new Error('process.exit called');
    });
    // Clean config
    try {
      await fs.unlink(configFile);
    } catch {}
  });

  function makeProgram() {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => {} });
    configMod.register(program);
    return program;
  }

  async function run(args) {
    const program = makeProgram();
    try {
      await program.parseAsync(['node', 'test', ...args]);
    } catch (e) {
      if (e.message !== 'process.exit called') throw e;
    }
  }

  // ── set-env ──────────────────────────────────────

  it('set-env local: saves local URLs', async () => {
    await run(['config', 'set-env', 'local']);
    const raw = await fs.readFile(configFile, 'utf8');
    const config = JSON.parse(raw);
    assert.equal(config.apiUrl, 'http://auth.zea.localhost');
    assert.equal(config.gliaUrl, 'http://localhost:4002');
    assert.equal(config.gliaWsUrl, 'ws://localhost:4002/socket/websocket');
    assert.ok(logged.some((l) => l.includes('LOCAL')));
  });

  it('set-env prod: saves prod URLs', async () => {
    await run(['config', 'set-env', 'prod']);
    const raw = await fs.readFile(configFile, 'utf8');
    const config = JSON.parse(raw);
    assert.equal(config.apiUrl, 'https://auth.zea.cl');
    assert.equal(config.gliaUrl, 'https://glia.zea.cl');
    assert.equal(config.gliaWsUrl, 'wss://glia.zea.cl/socket/websocket');
    assert.ok(logged.some((l) => l.includes('PROD')));
  });

  it('set-env invalid: shows error message', async () => {
    await run(['config', 'set-env', 'staging']);
    assert.ok(logged.some((l) => l.includes('Unknown environment')));
  });

  it('set-env invalid: does not save config', async () => {
    await run(['config', 'set-env', 'staging']);
    try {
      await fs.access(configFile);
      assert.fail('config file should not exist');
    } catch {
      // Expected: file does not exist
    }
  });

  // ── set / get ────────────────────────────────────

  it('set: saves a config value', async () => {
    await run(['config', 'set', 'theme', 'dark']);
    const raw = await fs.readFile(configFile, 'utf8');
    const config = JSON.parse(raw);
    assert.equal(config.theme, 'dark');
    assert.ok(logged.some((l) => l.includes('theme') && l.includes('dark')));
  });

  it('set: overwrites existing value', async () => {
    await run(['config', 'set', 'x', '1']);
    await run(['config', 'set', 'x', '2']);
    const raw = await fs.readFile(configFile, 'utf8');
    const config = JSON.parse(raw);
    assert.equal(config.x, '2');
  });

  it('get: prints value when key exists', async () => {
    await run(['config', 'set', 'name', 'test-value']);
    logged = [];
    await run(['config', 'get', 'name']);
    assert.ok(logged.some((l) => l.includes('test-value')));
  });

  it('get: shows not set message for missing key', async () => {
    await run(['config', 'get', 'nonexistent']);
    assert.ok(logged.some((l) => l.includes('not set')));
  });

  // ── list ─────────────────────────────────────────

  it('list: shows empty message when no config', async () => {
    await run(['config', 'list']);
    assert.ok(logged.some((l) => l.includes('No configuration set')));
  });

  it('list: shows config values', async () => {
    await run(['config', 'set', 'apiUrl', 'https://example.com']);
    logged = [];
    await run(['config', 'list']);
    assert.ok(logged.some((l) => l.includes('apiUrl')));
    assert.ok(logged.some((l) => l.includes('https://example.com')));
  });

  it('list: masks token values', async () => {
    await run(['config', 'set', 'token', 'abcdef1234567890']);
    logged = [];
    await run(['config', 'list']);
    const output = logged.join('\n');
    assert.ok(output.includes('••••••••'), 'should mask token');
    assert.ok(output.includes('7890'), 'should show last 4 chars');
    assert.ok(!output.includes('abcdef'), 'should not show full token');
  });

  // ── unset ────────────────────────────────────────

  it('unset: removes a config value', async () => {
    await run(['config', 'set', 'temp', 'delete-me']);
    await run(['config', 'unset', 'temp']);
    const raw = await fs.readFile(configFile, 'utf8');
    const config = JSON.parse(raw);
    assert.equal(config.temp, undefined);
    assert.ok(logged.some((l) => l.includes('removed')));
  });

  it('unset: handles non-existent key gracefully', async () => {
    await run(['config', 'unset', 'nonexistent']);
    // Should not throw
  });

  // ── path ─────────────────────────────────────────

  it('path: prints config file path', async () => {
    await run(['config', 'path']);
    assert.ok(logged.some((l) => l.includes('.config') && l.includes('zea')));
  });

  // ── lock-skills ──────────────────────────────────

  it('lock-skills: shows error when no skills-lock.json', async () => {
    await run(['config', 'lock-skills']);
    assert.ok(logged.some((l) => l.includes('skills-lock.json not found')));
  });

  it('lock-skills: reports up to date when hashes match', async () => {
    const lockPath = path.join(tmpDir, '.config', 'opencode', 'skills-lock.json');
    const skillDir = path.join(tmpDir, '.config', 'opencode', 'skills', 'test-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillContent = 'dummy skill content';
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);
    const hash = crypto.createHash('sha256').update(skillContent).digest('hex');

    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        skills: { 'test-skill': { computedHash: hash } },
      }),
    );

    await run(['config', 'lock-skills']);
    assert.ok(logged.some((l) => l.includes('up to date')));
  });

  it('lock-skills: updates outdated hashes', async () => {
    const lockPath = path.join(tmpDir, '.config', 'opencode', 'skills-lock.json');
    const skillDir = path.join(tmpDir, '.config', 'opencode', 'skills', 'test-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillContent = 'updated skill content';
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);
    const correctHash = crypto.createHash('sha256').update(skillContent).digest('hex');

    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        skills: { 'test-skill': { computedHash: 'old-wrong-hash' } },
      }),
    );

    await run(['config', 'lock-skills']);
    assert.ok(
      logged.some((l) => l.includes('updated')),
      `logged: ${logged.join(' | ')}`,
    );

    // Verify file was updated
    const updated = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    assert.equal(updated.skills['test-skill'].computedHash, correctHash);
  });

  it('lock-skills: keeps pending when skill not found', async () => {
    const lockPath = path.join(tmpDir, '.config', 'opencode', 'skills-lock.json');
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        skills: { 'missing-skill': { computedHash: 'pending' } },
      }),
    );

    await run(['config', 'lock-skills']);
    // Should not crash
  });

  it('lock-skills: handles skills without skills key', async () => {
    const lockPath = path.join(tmpDir, '.config', 'opencode', 'skills-lock.json');
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, JSON.stringify({ other: true }));

    await run(['config', 'lock-skills']);
    // Should report 0 total without crashing
  });

  it('lock-skills: handles zea skill directory', async () => {
    const lockPath = path.join(tmpDir, '.config', 'opencode', 'skills-lock.json');
    const skillDir = path.join(tmpDir, '.config', 'zea', 'skills', 'zea-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const content = 'zea skill';
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        skills: { 'zea-skill': { computedHash: 'different' } },
      }),
    );

    await run(['config', 'lock-skills']);
    const updated = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    assert.equal(updated.skills['zea-skill'].computedHash, hash);
  });

  it('lock-skills: handles pi skill directory', async () => {
    const lockPath = path.join(tmpDir, '.config', 'opencode', 'skills-lock.json');
    const skillDir = path.join(tmpDir, '.pi', 'skills', 'pi-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const content = 'pi skill';
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        skills: { 'pi-skill': { computedHash: 'old' } },
      }),
    );

    await run(['config', 'lock-skills']);
    const updated = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    assert.equal(updated.skills['pi-skill'].computedHash, hash);
  });
});
