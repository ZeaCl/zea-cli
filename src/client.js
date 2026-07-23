import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// .zea.localhost → 127.0.0.1 resolution is handled by zeaFetch in lib/http.js
export const CONFIG_DIR = path.join(os.homedir(), '.config', 'zea');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveConfig(config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

export async function getClient() {
  const config = await loadConfig();
  const token = process.env.ZEA_PAT || process.env.THALAMUS_PAT || process.env.ZEA_TOKEN || config.token;
  const apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || config.apiUrl || 'https://auth.zea.cl';
  const activeOrgId = config.activeOrgId || process.env.ZEA_ORG_ID || null;
  const cerebelumUrl =
    process.env.ZEA_CEREBELUM_URL ||
    process.env.CEREBELUM_URL ||
    config.cerebelumUrl ||
    'http://cerebelum.zea.localhost';
  const ventureUrl = process.env.ZEA_VENTURE_URL || config.ventureUrl || 'http://venture.zea.localhost';
  const sduiUrl = process.env.ZEA_SDUI_URL || config.sduiUrl || 'http://sdui.zea.localhost';
  const appsUrl = process.env.ZEA_APPS_URL || config.appsUrl || 'http://apps.zea.localhost';
  const gliaUrl = process.env.ZEA_GLIA_URL || config.gliaUrl || 'http://localhost:4002';
  const gliaWsUrl = process.env.ZEA_GLIA_WS_URL || config.gliaWsUrl || 'ws://localhost:4002/socket/websocket';
  const sensorUrl = process.env.ZEA_SENSOR_URL || config.sensorUrl || 'http://sensor.zea.localhost';
  const deepseekKey = process.env.DEEPSEEK_API_KEY || config.deepseek_key || config.deepseekKey || null;

  if (!token) {
    throw new Error('Not authenticated. Please run "zea auth login" or set ZEA_PAT.');
  }

  const isLocalhost = gliaUrl.includes('localhost') || gliaUrl.includes('127.0.0.1');

  return {
    apiUrl,
    cerebelumUrl,
    ventureUrl,
    sduiUrl,
    appsUrl,
    gliaUrl,
    gliaWsUrl,
    sensorUrl,
    token,
    deepseekKey,
    isLocalhost,
    activeOrgId,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}
