import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getGlobalOpts, display } from '../lib/globals.js';

describe('getGlobalOpts', () => {
  let originalArgv;

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('returns defaults when no flags present', () => {
    process.argv = ['node', 'zea'];
    const opts = getGlobalOpts();
    assert.equal(opts.output, 'table');
    assert.equal(opts.debug, false);
    assert.equal(opts.dryRun, false);
    assert.equal(opts.quiet, false);
    assert.equal(opts.noColor, false);
  });

  it('detects --debug flag', () => {
    process.argv = ['node', 'zea', '--debug'];
    assert.equal(getGlobalOpts().debug, true);
  });

  it('detects -d short flag', () => {
    process.argv = ['node', 'zea', '-d'];
    assert.equal(getGlobalOpts().debug, true);
  });

  it('detects --dry-run flag', () => {
    process.argv = ['node', 'zea', '--dry-run'];
    assert.equal(getGlobalOpts().dryRun, true);
  });

  it('detects --quiet and -q', () => {
    process.argv = ['node', 'zea', '--quiet'];
    assert.equal(getGlobalOpts().quiet, true);
  });

  it('detects --no-color flag', () => {
    process.argv = ['node', 'zea', '--no-color'];
    assert.equal(getGlobalOpts().noColor, true);
  });

  it('reads --output value', () => {
    process.argv = ['node', 'zea', '--output', 'json'];
    assert.equal(getGlobalOpts().output, 'json');
  });

  it('reads -o short form', () => {
    process.argv = ['node', 'zea', '-o', 'json'];
    assert.equal(getGlobalOpts().output, 'json');
  });

  it('returns table when --output flag present without value', () => {
    process.argv = ['node', 'zea', '--output'];
    assert.equal(getGlobalOpts().output, 'table');
  });

  it('combines multiple flags', () => {
    process.argv = ['node', 'zea', '--debug', '--dry-run', '--quiet', '--output', 'json', '--no-color'];
    const opts = getGlobalOpts();
    assert.equal(opts.debug, true);
    assert.equal(opts.dryRun, true);
    assert.equal(opts.quiet, true);
    assert.equal(opts.noColor, true);
    assert.equal(opts.output, 'json');
  });
});

describe('display', () => {
  let logged;

  beforeEach(() => {
    logged = [];
    mock.method(console, 'log', (msg) => logged.push(msg));
  });

  it('formats as json when output=json', () => {
    display({ status: 'ok', version: '1.0' }, { output: 'json' });
    const parsed = JSON.parse(logged[0]);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.version, '1.0');
  });

  it('formats as text when output=text', () => {
    display('hello world', { output: 'text' });
    assert.equal(logged[0], 'hello world');
  });

  it('defaults to table (pass-through)', () => {
    display('some table output');
    assert.equal(logged[0], 'some table output');
  });
});
