import dns from 'dns';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import crypto from 'crypto';
import open from 'open';

const originalLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
  if (hostname === 'auth.zea.localhost' || hostname.endsWith('.zea.localhost') || hostname === 'zea.localhost') {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const isAll = options && options.all;
    if (isAll) {
      return callback(null, [{ address: '127.0.0.1', family: 4 }]);
    } else {
      return callback(null, '127.0.0.1', 4);
    }
  }
  return originalLookup(hostname, options, callback);
};

const originalPromisesLookup = dns.promises.lookup;
dns.promises.lookup = async function(hostname, options) {
  if (hostname === 'auth.zea.localhost' || hostname.endsWith('.zea.localhost') || hostname === 'zea.localhost') {
    const isAll = options && options.all;
    if (isAll) {
      return [{ address: '127.0.0.1', family: 4 }];
    } else {
      return { address: '127.0.0.1', family: 4 };
    }
  }
  return originalPromisesLookup(hostname, options);
};

export const CONFIG_DIR = path.join(os.homedir(), '.config', 'zea');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
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
  const apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || config.apiUrl || 'http://auth.zea.localhost';
  const activeOrgId = config.activeOrgId || process.env.ZEA_ORG_ID || null;
  const cerebelumUrl = process.env.ZEA_CEREBELUM_URL || process.env.CEREBELUM_URL || config.cerebelumUrl || 'http://cerebelum.zea.localhost';
  const ventureUrl = process.env.ZEA_VENTURE_URL || config.ventureUrl || 'http://venture.zea.localhost';
  const sduiUrl = process.env.ZEA_SDUI_URL || config.sduiUrl || 'http://sdui.zea.localhost';
  const appsUrl = process.env.ZEA_APPS_URL || config.appsUrl || 'http://apps.zea.localhost';
  const gliaUrl = process.env.ZEA_GLIA_URL || config.gliaUrl || 'http://glia.zea.localhost';
  const sensorUrl = process.env.ZEA_SENSOR_URL || config.sensorUrl || 'http://sensor.zea.localhost';

  if (!token) {
    throw new Error('Not authenticated. Please run "zea auth login" or set ZEA_PAT.');
  }

  return {
    apiUrl,
    cerebelumUrl,
    ventureUrl,
    sduiUrl,
    appsUrl,
    gliaUrl,
    sensorUrl,
    token,
    activeOrgId,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
}

export async function handleDirectLogin(options) {
  const apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || options.url || 'http://auth.zea.localhost';
  const email = options.email;
  const password = options.password;
  
  try {
    const response = await fetch(`${apiUrl}/api/public/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error_description || errData.error || `Login failed: ${response.status}`);
    }
    
    const data = await response.json();
    const config = await loadConfig();
    config.token = data.access_token;
    config.refreshToken = data.refresh_token;
    config.apiUrl = apiUrl;
    
    const userinfoResponse = await fetch(`${apiUrl}/oauth/userinfo`, {
      headers: { 'Authorization': `Bearer ${data.access_token}` }
    });
    
    if (userinfoResponse.ok) {
      const userinfo = await userinfoResponse.json();
      if (userinfo.organizations && userinfo.organizations.length > 0) {
        config.activeOrgId = userinfo.organizations[0].id;
      }
    }
    
    await saveConfig(config);
    console.log('Successfully authenticated with ZEA Platform!');
    console.log(`User: ${data.user.email} (${data.user.name})`);
    if (data.organization) {
      console.log(`Organization: ${data.organization.name}`);
    }
  } catch (error) {
    console.error('Login failed:', error.message);
    process.exit(1);
  }
}

export async function handleLogin(options) {
  const apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || options.url || 'http://auth.zea.localhost';
  const port = 4005;
  const redirectUri = `http://localhost:${port}/callback`;

  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  console.log('Starting local authentication flow...');
  
  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://localhost:${port}`);
    if (urlObj.pathname === '/callback') {
      const code = urlObj.searchParams.get('code');
      const returnedState = urlObj.searchParams.get('state');

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication Error</h1><p>State mismatch. Potential CSRF attack detected.</p>');
        server.close();
        process.exit(1);
      }

      try {
        const tokenUrl = `${apiUrl}/oauth/token`;
        const params = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: 'thalamus_cli',
          code_verifier: codeVerifier
        });

        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });

        if (!tokenResponse.ok) {
          const errText = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${errText}`);
        }

        const tokenData = await tokenResponse.json();
        const config = await loadConfig();
        
        config.token = tokenData.access_token;
        config.refreshToken = tokenData.refresh_token;
        config.apiUrl = apiUrl;
        
        const userinfoResponse = await fetch(`${apiUrl}/oauth/userinfo`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        if (userinfoResponse.ok) {
          const userinfo = await userinfoResponse.json();
          if (userinfo.organizations && userinfo.organizations.length > 0) {
            config.activeOrgId = userinfo.organizations[0].id;
          }
        }

        await saveConfig(config);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication Successful</h1><p>You can close this tab and return to the terminal.</p>');
        console.log('Successfully authenticated with ZEA Platform!');
        
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);

      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authentication Failed</h1><p>${error.message}</p>`);
        console.error('Error during token exchange:', error.message);
        setTimeout(() => {
          server.close();
          process.exit(1);
        }, 1000);
      }
    }
  });

  server.listen(port, async () => {
    const authorizeUrl = `${apiUrl}/oauth/authorize?response_type=code&client_id=thalamus_cli&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid%20profile%20zea:read%20zea:write&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    console.log(`Opening browser to log in...`);
    console.log(`URL: ${authorizeUrl}`);
    await open(authorizeUrl);
  });
}
