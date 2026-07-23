/**
 * Coverage bootstrap — imports all source modules at parse time to force
 * complete coverage tracking. Only index.js is excluded (it calls
 * program.parse() at import time).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── lib modules ──────────────────────────────────────
import * as errors from '../lib/errors.js';
import * as http from '../lib/http.js';
import * as globals from '../lib/globals.js';

// ── utils ────────────────────────────────────────────
import * as display from '../utils/display.js';

// ── client ────────────────────────────────────────────
import * as client from '../client.js';

// ── commands (core only) ──────────────────────────────
import * as cmd_config from '../commands/config.js';

describe('coverage bootstrap', () => {
  const modules = {
    'lib/errors': errors,
    'lib/http': http,
    'lib/globals': globals,
    'utils/display': display,
    client,
    'commands/config': cmd_config,
  };

  for (const [name, mod] of Object.entries(modules)) {
    it(`loads ${name}`, () => {
      assert.ok(Object.keys(mod).length > 0, `${name} should export something`);
    });
  }
});
