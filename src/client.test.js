import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// Use temp home directory to isolate config
const tmpDir = path.join(os.tmpdir(), `zea-test-${Date.now()}`);
process.env.HOME = tmpDir;

// Dynamic import to pick up HOME env var
const client = await import('./client.js');

describe('client', () => {
  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean config before each test
    try {
      await fs.unlink(client.CONFIG_FILE);
    } catch {}
    // Clear env vars
    delete process.env.ZEA_PAT;
    delete process.env.ZEA_TOKEN;
    delete process.env.ZEA_API_URL;
    delete process.env.ZEA_ORG_ID;
    delete process.env.THALAMUS_PAT;
    delete process.env.THALAMUS_API_URL;
  });

  describe('loadConfig', () => {
    it('returns empty object when no config file', async () => {
      const config = await client.loadConfig();
      assert.deepEqual(config, {});
    });

    it('reads and parses config file', async () => {
      await client.saveConfig({ token: 'test-token', apiUrl: 'https://example.com' });
      const config = await client.loadConfig();
      assert.equal(config.token, 'test-token');
      assert.equal(config.apiUrl, 'https://example.com');
    });
  });

  describe('saveConfig', () => {
    it('saves config and creates directory', async () => {
      await client.saveConfig({ key: 'value' });
      const raw = await fs.readFile(client.CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      assert.equal(parsed.key, 'value');
    });

    it('overwrites existing config', async () => {
      await client.saveConfig({ first: true });
      await client.saveConfig({ second: true });
      const config = await client.loadConfig();
      assert.equal(config.first, undefined);
      assert.equal(config.second, true);
    });
  });

  describe('getClient', () => {
    it('throws when no token configured', async () => {
      await assert.rejects(() => client.getClient(), /Not authenticated/);
    });

    it('reads token from ZEA_PAT env var', async () => {
      process.env.ZEA_PAT = 'env-pat-token';
      const c = await client.getClient();
      assert.equal(c.token, 'env-pat-token');
      assert.ok(c.headers['Authorization'].includes('env-pat-token'));
    });

    it('reads token from config file', async () => {
      await client.saveConfig({ token: 'config-token' });
      const c = await client.getClient();
      assert.equal(c.token, 'config-token');
    });

    it('reads apiUrl from ZEA_API_URL env var', async () => {
      process.env.ZEA_PAT = 'token';
      process.env.ZEA_API_URL = 'https://custom.api.cl';
      const c = await client.getClient();
      assert.equal(c.apiUrl, 'https://custom.api.cl');
    });

    it('defaults apiUrl to production', async () => {
      process.env.ZEA_PAT = 'token';
      const c = await client.getClient();
      assert.equal(c.apiUrl, 'https://auth.zea.cl');
    });

    it('reads activeOrgId from ZEA_ORG_ID env var', async () => {
      process.env.ZEA_PAT = 'token';
      process.env.ZEA_ORG_ID = 'org-123';
      const c = await client.getClient();
      assert.equal(c.activeOrgId, 'org-123');
    });

    it('reads glia URLs with defaults', async () => {
      process.env.ZEA_PAT = 'token';
      const c = await client.getClient();
      assert.equal(c.gliaUrl, 'http://localhost:4002');
      assert.equal(c.gliaWsUrl, 'ws://localhost:4002/socket/websocket');
    });

    it('returns isLocalhost true when gliaUrl is local', async () => {
      process.env.ZEA_PAT = 'token';
      const c = await client.getClient();
      assert.equal(c.isLocalhost, true);
    });

    it('merges config file with env vars (env takes priority)', async () => {
      process.env.ZEA_PAT = 'env-token';
      await client.saveConfig({ token: 'config-token', apiUrl: 'https://config.cl' });
      const c = await client.getClient();
      assert.equal(c.token, 'env-token');
    });
  });
});
