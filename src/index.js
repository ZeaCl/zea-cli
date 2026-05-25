#!/usr/bin/env node

import { Command } from 'commander';
import http from 'http';
import crypto from 'crypto';
import readline from 'readline';
import open from 'open';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dns from 'dns';

// Override DNS lookup globally to map *.localhost to 127.0.0.1.
// This ensures that the CLI resolves auth.zea.localhost (routed by Caddy)
// even if the host machine has no resolver/hosts configuration for .localhost subdomains.
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

const CONFIG_DIR = path.join(os.homedir(), '.config', 'zea');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const program = new Command();

// Config helper functions
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

async function saveConfig(config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

async function getClient() {
  const config = await loadConfig();
  const token = process.env.ZEA_PAT || process.env.THALAMUS_PAT || process.env.ZEA_TOKEN || config.token;
  const apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || config.apiUrl || 'http://auth.zea.localhost';
  const activeOrgId = config.activeOrgId || null;
  const cerebelumUrl = process.env.ZEA_CEREBELUM_URL || process.env.CEREBELUM_URL || config.cerebelumUrl || 'http://cerebelum.zea.localhost';
  const ventureUrl = process.env.ZEA_VENTURE_URL || config.ventureUrl || 'http://venture.zea.localhost';
  const sduiUrl = process.env.ZEA_SDUI_URL || config.sduiUrl || 'http://sdui.zea.localhost';
  const appsUrl = process.env.ZEA_APPS_URL || config.appsUrl || 'http://apps.zea.localhost';
  const gliaUrl = process.env.ZEA_GLIA_URL || config.gliaUrl || 'http://glia.zea.localhost';

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
    token,
    activeOrgId,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
}

// Direct login via email/password for development (no browser)
async function handleDirectLogin(options) {
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
    
    // Fetch user info to populate default organization
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

// Interactive OAuth2 login via local server
async function handleLogin(options) {
  const apiUrl = process.env.ZEA_API_URL || process.env.THALAMUS_API_URL || options.url || 'http://auth.zea.localhost';
  const port = 4005;
  const redirectUri = `http://localhost:${port}/callback`;

  // Generate PKCE code verifier and challenge
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
        // Exchange code for token
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
        
        // Fetch user info to populate default organization
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

// CLI implementation
program
  .name('zea')
  .description('ZEA Platform Agent Skill CLI')
  .version('1.0.0');

const auth = program.command('auth').description('Authentication commands');

auth.command('login')
  .description('Login interactively using browser')
  .option('--url <url>', 'ZEA API URL')
  .option('--email <email>', 'Email for direct login (requires --password)')
  .option('--password <password>', 'Password for direct login (requires --email)')
  .action(async (options) => {
    if (options.email && options.password) {
      await handleDirectLogin(options);
    } else {
      await handleLogin(options);
    }
  });

auth.command('set-token <token>')
  .description('Configure a Personal Access Token (PAT) manually')
  .option('--url <url>', 'ZEA API URL')
  .action(async (token, options) => {
    const config = await loadConfig();
    config.token = token;
    if (options.url) config.apiUrl = options.url;
    await saveConfig(config);
    console.log('Personal Access Token saved successfully.');
  });

const org = program.command('org').description('Organization management commands');

org.command('list')
  .description('List organizations')
  .action(async () => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch user info: status ${response.status}`);
      }

      const info = await response.json();
      const orgs = info.organizations || [];

      if (orgs.length === 0) {
        console.log('No organizations found.');
        return;
      }

      console.log('Organizations:');
      orgs.forEach(o => {
        const activeMarker = o.id === client.activeOrgId ? '* ' : '  ';
        console.log(`${activeMarker}${o.name} (Slug: ${o.slug || 'N/A'}, ID: ${o.id})`);
      });
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

org.command('switch <org_id_or_slug>')
  .description('Switch default organization context')
  .action(async (target) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const info = await response.json();
      const orgs = info.organizations || [];
      const match = orgs.find(o => o.id === target || o.slug === target);

      if (!match) {
        throw new Error(`Organization '${target}' not found in your membership list.`);
      }

      const config = await loadConfig();
      config.activeOrgId = match.id;
      await saveConfig(config);
      console.log(`Active organization context switched to: ${match.name} (${match.id})`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

org.command('create')
  .description('Create a new organization')
  .requiredOption('--name <name>', 'Name of the organization')
  .requiredOption('--email <email>', 'Owner email address')
  .option('--plan <plan>', 'Plan type (free, basic, standard, premium, enterprise)', 'free')
  .action(async (options) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.apiUrl}/api/organizations`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({
          name: options.name,
          owner_email: options.email,
          plan_type: options.plan
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const result = await response.json();
      const savedOrg = result.data;
      console.log(`Organization '${savedOrg.name}' created successfully!`);
      console.log(`ID: ${savedOrg.id}`);
      console.log(`Owner: ${savedOrg.owner_email}`);
      console.log(`Plan: ${savedOrg.plan_type}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const memberCmd = org.command('member').description('Organization member management');

memberCmd.command('add <org_slug>')
  .description('Add a member to an organization by email')
  .requiredOption('--email <email>', 'Email of the user to add')
  .requiredOption('--role <role>', 'Role (admin, member, billing)')
  .action(async (orgSlug, options) => {
    try {
      const client = await getClient();
      const userinfoResponse = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
      if (!userinfoResponse.ok) throw new Error(`HTTP error ${userinfoResponse.status}`);

      const info = await userinfoResponse.json();
      const orgs = info.organizations || [];
      const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);

      if (!org) throw new Error(`Organization '${orgSlug}' not found in your memberships.`);

      const response = await fetch(`${client.apiUrl}/api/organizations/${org.id}/members`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({
          email: options.email,
          role: options.role
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const result = await response.json();
      console.log(`Member '${options.email}' added to '${org.name}' as ${options.role}.`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

memberCmd.command('remove <org_slug>')
  .description('Remove a member from an organization by user ID')
  .requiredOption('--user-id <user_id>', 'User ID to remove')
  .action(async (orgSlug, options) => {
    try {
      const client = await getClient();
      const userinfoResponse = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
      if (!userinfoResponse.ok) throw new Error(`HTTP error ${userinfoResponse.status}`);

      const info = await userinfoResponse.json();
      const orgs = info.organizations || [];
      const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);

      if (!org) throw new Error(`Organization '${orgSlug}' not found in your memberships.`);

      const response = await fetch(`${client.apiUrl}/api/organizations/${org.id}/members/${options.userId}`, {
        method: 'DELETE',
        headers: client.headers
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const result = await response.json();
      console.log(`Member '${options.userId}' removed from '${org.name}'.`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

memberCmd.command('list <org_slug>')
  .description('List members of an organization')
  .action(async (orgSlug) => {
    try {
      const client = await getClient();
      const userinfoResponse = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
      if (!userinfoResponse.ok) throw new Error(`HTTP error ${userinfoResponse.status}`);

      const info = await userinfoResponse.json();
      const orgs = info.organizations || [];
      const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);

      if (!org) throw new Error(`Organization '${orgSlug}' not found in your memberships.`);

      const response = await fetch(`${client.apiUrl}/api/organizations/${org.id}`, { headers: client.headers });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const result = await response.json();
      const members = result.data.members || [];

      if (members.length === 0) {
        console.log(`No members in '${org.name}'.`);
        return;
      }

      console.log(`Members of '${org.name}':`);
      members.forEach(m => {
        const userId = m.user_id || '(pending invite)';
        const email = m.email || '(email pending)';
        console.log(`  ${email} — ${m.role} (ID: ${userId})`);
      });
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const tokenCmd = program.command('token').description('Personal Access Token (PAT) commands');

tokenCmd.command('create')
  .description('Create a new Personal Access Token')
  .requiredOption('--name <name>', 'Token description / name')
  .action(async (options) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.apiUrl}/api/personal-access-tokens`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({
          name: options.name,
          organization_id: client.activeOrgId
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to generate token: ${errText}`);
      }

      const result = await response.json();
      console.log('Personal Access Token generated successfully!');
      console.log('--------------------------------------------------');
      console.log(`Token Value: ${result.token}`);
      console.log('--------------------------------------------------');
      console.log('WARNING: Store this token safely. It will not be shown again.');
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

tokenCmd.command('list')
  .description('List active Personal Access Tokens')
  .action(async () => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.apiUrl}/api/personal-access-tokens`, { headers: client.headers });
      if (!response.ok) throw new Error(`Failed to list tokens: status ${response.status}`);

      const result = await response.json();
      const pats = result.data || [];

      // Filter by active org if configured
      const filtered = pats.filter(p => !client.activeOrgId || p.organization_id === client.activeOrgId);

      if (filtered.length === 0) {
        console.log('No active tokens under the current organization.');
        return;
      }

      console.log('Active Tokens:');
      filtered.forEach(p => {
        console.log(`- ${p.name} (Prefix: ${p.token_prefix}..., ID: ${p.id}, Active: ${p.is_active})`);
      });
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

tokenCmd.command('revoke <token_id>')
  .description('Revoke an active Personal Access Token')
  .action(async (tokenId) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.apiUrl}/api/personal-access-tokens/${tokenId}`, {
        method: 'DELETE',
        headers: client.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to revoke token: status ${response.status}`);
      }

      console.log(`Token ${tokenId} revoked successfully.`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const workflow = program.command('workflow').description('Workflow management commands (Cerebelum)');

const domain = program.command('domain').description('Domain management commands');

workflow.command('list')
  .description('List available workflows')
  .action(async () => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.cerebelumUrl}/api/v1/workflows`, { headers: client.headers });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const result = await response.json();
      const workflows = result.data || [];
      if (workflows.length === 0) {
        console.log('No workflows registered.');
        return;
      }

      console.log('Available Workflows:');
      workflows.forEach(w => {
        console.log(`  ${w.module}`);
        console.log(`    Version: ${w.version}`);
        console.log(`    Timeline: ${(w.timeline || []).join(' -> ')}`);
        if (Object.keys(w.branches || {}).length > 0) {
          console.log(`    Branches: ${Object.keys(w.branches).join(', ')}`);
        }
        if (Object.keys(w.diverges || {}).length > 0) {
          console.log(`    Diverges: ${Object.keys(w.diverges).join(', ')}`);
        }
        console.log('');
      });
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

workflow.command('run <module>')
  .description('Execute a workflow')
  .argument('[inputs]', 'JSON inputs for the workflow', '{}')
  .action(async (module, inputs) => {
    try {
      const client = await getClient();
      let parsedInputs;
      try {
        parsedInputs = JSON.parse(inputs);
      } catch {
        parsedInputs = {};
      }

      const response = await fetch(`${client.cerebelumUrl}/api/v1/executions`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({
          workflow_module: module,
          inputs: parsedInputs
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const result = await response.json();
      console.log(`Workflow started!`);
      console.log(`Execution ID: ${result.data.id}`);
      console.log(`Status: ${result.data.status}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

workflow.command('status <execution_id>')
  .description('Get execution status')
  .action(async (executionId) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.cerebelumUrl}/api/v1/executions/${executionId}`, { headers: client.headers });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const result = await response.json();
      const exec = result.data;
      console.log(`Execution: ${exec.id}`);
      console.log(`Workflow: ${exec.workflow_module}`);
      console.log(`Status: ${exec.status}`);
      console.log(`Current Step: ${exec.current_step || 'N/A'}`);
      console.log(`Progress: ${exec.timeline_progress || 'N/A'}`);
      if (exec.started_at) console.log(`Started: ${exec.started_at}`);
      if (exec.completed_at) console.log(`Completed: ${exec.completed_at}`);
      if (exec.results) console.log(`Results: ${JSON.stringify(exec.results)}`);
      if (exec.error) console.log(`Error: ${exec.error}`);
      if (exec.duration_ms) console.log(`Duration: ${exec.duration_ms}ms`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

workflow.command('stop <execution_id>')
  .description('Stop a running execution')
  .action(async (executionId) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.cerebelumUrl}/api/v1/executions/${executionId}/stop`, {
        method: 'POST',
        headers: client.headers
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      console.log(`Execution ${executionId} stopped.`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

workflow.command('resume <execution_id>')
  .description('Resume a paused execution')
  .action(async (executionId) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.cerebelumUrl}/api/v1/executions/${executionId}/resume`, {
        method: 'POST',
        headers: client.headers
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      console.log(`Execution ${executionId} resumed.`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

domain.command('list')
  .description('List available domains and their scopes')
  .action(async () => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.apiUrl}/api/domains`, { headers: client.headers });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const result = await response.json();
      const domains = result.data || [];
      if (domains.length === 0) {
        console.log('No domains registered.');
        return;
      }
      console.log('Registered Domains:');
      domains.forEach(d => {
        console.log(`  ${d.domain}`);
        (d.scopes || []).forEach(s => console.log(`    - ${s.scope}: ${s.description}`));
        console.log('');
      });
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

domain.command('register <domain_name>')
  .description('Register a domain with its scopes')
  .requiredOption('--scopes <json>', 'JSON array of {scope, description} objects')
  .action(async (domainName, options) => {
    try {
      const client = await getClient();
      const scopes = JSON.parse(options.scopes);
      const response = await fetch(`${client.apiUrl}/api/domains/register`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({ domain: domainName, scopes: scopes })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`${result.message}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

domain.command('grant <user_id> <domain> <role>')
  .description('Grant a domain role to a user in an organization')
  .requiredOption('--org <org_id>', 'Organization ID')
  .option('--scopes <json>', 'JSON array of scopes', '[]')
  .action(async (userId, domain, role, options) => {
    try {
      const client = await getClient();
      const scopes = JSON.parse(options.scopes);
      const response = await fetch(`${client.apiUrl}/api/domains/roles/grant`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({
          user_id: userId,
          organization_id: options.org,
          domain: domain,
          role: role,
          scopes: scopes
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`${result.message}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

domain.command('revoke <user_id> <domain> <role>')
  .description('Revoke a domain role from a user')
  .requiredOption('--org <org_id>', 'Organization ID')
  .action(async (userId, domain, role, options) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.apiUrl}/api/domains/roles/revoke`, {
        method: 'DELETE',
        headers: client.headers,
        body: JSON.stringify({
          user_id: userId,
          organization_id: options.org,
          domain: domain,
          role: role
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`${result.message}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const venture = program.command('venture').description('Venture domain commands (GP API)');

const ventureFund = venture.command('fund').description('Fund management');

ventureFund.command('list')
  .description('List funds for the active organization')
  .action(async () => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId };
      const response = await fetch(`${client.ventureUrl}/gp/funds`, { headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      const funds = result.items || result.data || [];
      if (funds.length === 0) {
        console.log('No funds found.');
        return;
      }
      console.log(`Funds for org ${orgId}:`);
      funds.forEach(f => console.log(`  ${f.id}: ${f.name} [${f.status}]`));
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

ventureFund.command('create')
  .description('Create a new fund (via Cerebelum workflow — validates, creates, configures fees, and transitions to FUNDRAISING)')
  .requiredOption('--name <name>', 'Fund name')
  .option('--type <type>', 'Fund type', 'VENTURE_CAPITAL')
  .option('--hard-cap <amount>', 'Hard cap amount')
  .option('--currency <currency>', 'Currency', 'USD')
  .option('--mgmt-fee <json>', 'Management fee config (JSON)')
  .option('--carry <json>', 'Carried interest config (JSON)')
  .action(async (options) => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const inputs = {
        name: options.name,
        type: options.type,
        hard_cap: options.hardCap ? parseInt(options.hardCap) : undefined,
        currency: options.currency,
        jwt: client.token,
        org_id: orgId,
        management_fee: options.mgmtFee ? JSON.parse(options.mgmtFee) : undefined,
        carried_interest: options.carry ? JSON.parse(options.carry) : undefined
      };

      const response = await fetch(`${client.cerebelumUrl}/api/v1/executions`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({
          workflow_module: 'Cerebelum.Examples.Venture.FundCreateWorkflow',
          inputs: inputs
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }

      const result = await response.json();
      const execId = result.data.id;
      console.log(`Workflow started: ${execId}`);

      // Poll for completion (fund creation is fast ~50ms)
      let status = 'running';
      let attempts = 0;
      while (status === 'running' && attempts < 10) {
        await new Promise(r => setTimeout(r, 1000));
        const statusResp = await fetch(`${client.cerebelumUrl}/api/v1/executions/${execId}`, { headers: client.headers });
        if (statusResp.ok) {
          const statusResult = await statusResp.json();
          status = statusResult.data.status;
          if (status === 'completed') {
            const fundData = statusResult.data.results?.build_response?.value;
            if (fundData) {
              console.log(`Fund created: ${fundData.name} (${fundData.fund_id})`);
              console.log(`Status: ${fundData.status} | Type: ${fundData.type} | Currency: ${fundData.currency}`);
            }
          } else if (status === 'failed') {
            const err = statusResult.data.error;
            console.error(`Workflow failed: ${err?.message || JSON.stringify(err)}`);
          }
        }
        attempts++;
      }
      if (status === 'running') {
        console.log(`Check progress: zea workflow status ${execId}`);
      }
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

ventureFund.command('show <id>')
  .description('Show fund details')
  .action(async (fundId) => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId };
      const response = await fetch(`${client.ventureUrl}/gp/funds/${fundId}`, { headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const fund = await response.json();
      console.log(`Fund: ${fund.name} (${fund.id})`);
      console.log(`Status: ${fund.status} | Type: ${fund.type} | Currency: ${fund.currency}`);
      console.log(`Total Size: ${fund.total_size}`);
      if (fund.hard_cap) console.log(`Hard Cap: ${fund.hard_cap}`);
      if (fund.vintage_year) console.log(`Vintage: ${fund.vintage_year}`);
      if (fund.close_date) console.log(`Close Date: ${fund.close_date}`);
      if (fund.management_fee) console.log(`Mgmt Fee: ${JSON.stringify(fund.management_fee)}`);
      if (fund.carried_interest) console.log(`Carry: ${JSON.stringify(fund.carried_interest)}`);
      if (fund.created_at) console.log(`Created: ${fund.created_at}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

ventureFund.command('transition <id>')
  .description('Transition fund to a new status')
  .requiredOption('--status <status>', 'New status (FUNDRAISING, ACTIVE, HARVESTING, CLOSED)')
  .action(async (fundId, options) => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId, 'Content-Type': 'application/json' };
      const response = await fetch(`${client.ventureUrl}/gp/funds/${fundId}/transition`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: options.status })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const fund = await response.json();
      console.log(`Fund ${fund.name} transitioned to ${fund.status}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

ventureFund.command('configure-fees <id>')
  .description('Configure management fee and carried interest')
  .option('--mgmt-fee <json>', 'Management fee config (JSON)')
  .option('--carry <json>', 'Carried interest config (JSON)')
  .action(async (fundId, options) => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const body = {};
      if (options.mgmtFee) body.management_fee = JSON.parse(options.mgmtFee);
      if (options.carry) body.carried_interest = JSON.parse(options.carry);
      if (Object.keys(body).length === 0) {
        console.log('No fee config provided. Use --mgmt-fee or --carry.');
        return;
      }
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId, 'Content-Type': 'application/json' };
      const response = await fetch(`${client.ventureUrl}/gp/funds/${fundId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const fund = await response.json();
      console.log(`Fees configured for ${fund.name}`);
      if (fund.management_fee) console.log(`  Mgmt Fee: ${JSON.stringify(fund.management_fee)}`);
      if (fund.carried_interest) console.log(`  Carry: ${JSON.stringify(fund.carried_interest)}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

venture.command('dashboard')
  .description('Show dashboard for the active organization')
  .action(async () => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId };
      const response = await fetch(`${client.ventureUrl}/gp/dashboard`, { headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(JSON.stringify(result.data || result, null, 2));
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const ventureCC = venture.command('capital-call').description('Capital call management');

ventureCC.command('list')
  .description('List capital calls')
  .action(async () => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId };
      const response = await fetch(`${client.ventureUrl}/gp/capital-calls`, { headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      const calls = result.items || result.data || [];
      if (calls.length === 0) { console.log('No capital calls found.'); return; }
      console.log('Capital Calls:');
      calls.forEach(c => console.log(`  ${c.id}: #${c.call_number} ${c.fund_name || c.fund_id} [${c.status}] ${c.total_amount} ${c.currency}`));
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

ventureCC.command('create')
  .description('Create a capital call')
  .requiredOption('--fund <id>', 'Fund ID')
  .requiredOption('--amount <amount>', 'Total amount')
  .requiredOption('--due-date <date>', 'Due date (YYYY-MM-DD)')
  .option('--purpose <text>', 'Purpose description')
  .option('--workflow', 'Use Cerebelum workflow (async: creates, sends, waits for payments, closes) instead of direct API call')
  .action(async (options) => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;

      if (options.workflow) {
        const inputs = {
          fund_id: options.fund,
          total_amount: parseInt(options.amount),
          due_date: options.dueDate,
          purpose: options.purpose || 'Capital call',
          issue_date: new Date().toISOString().split('T')[0],
          jwt: client.token,
          org_id: orgId
        };

        const response = await fetch(`${client.cerebelumUrl}/api/v1/executions`, {
          method: 'POST',
          headers: client.headers,
          body: JSON.stringify({
            workflow_module: 'Cerebelum.Examples.Venture.CapitalCallWorkflow',
            inputs: inputs
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        const execId = result.data.id;
        console.log(`Workflow started: ${execId}`);
        console.log(`The capital call will be created, sent, and tracked until ${options.dueDate}.`);
        console.log(`Check progress: zea workflow status ${execId}`);
      } else {
        const headers = { ...client.headers, 'X-Zea-Org-Id': orgId, 'Content-Type': 'application/json' };
        const response = await fetch(`${client.ventureUrl}/gp/capital-calls`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fund_id: options.fund,
            total_amount: parseInt(options.amount),
            due_date: options.dueDate,
            issue_date: new Date().toISOString().split('T')[0],
            purpose: options.purpose || 'Capital call',
            status: 'DRAFT'
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        console.log(`Capital call created: ${result.id} [${result.status}]`);
      }
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

ventureCC.command('show <id>')
  .description('Show capital call details')
  .action(async (callId) => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId };
      const response = await fetch(`${client.ventureUrl}/gp/capital-calls/${callId}`, { headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const call = await response.json();
      console.log(`Capital Call: ${call.id}`);
      console.log(`Fund: ${call.fund_id} | #${call.call_number}`);
      console.log(`Status: ${call.status} | Amount: ${call.total_amount} ${call.currency}`);
      if (call.issue_date) console.log(`Issued: ${call.issue_date}`);
      if (call.due_date) console.log(`Due: ${call.due_date}`);
      if (call.purpose) console.log(`Purpose: ${call.purpose}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

ventureCC.command('send <id>')
  .description('Send capital call to investors')
  .action(async (callId) => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId };
      const response = await fetch(`${client.ventureUrl}/gp/capital-calls/${callId}/send`, {
        method: 'POST',
        headers
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      console.log(`Capital call ${callId} sent.`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const ventureInv = venture.command('investor').description('Investor (LP) management');

ventureInv.command('list')
  .description('List investors')
  .action(async () => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId };
      const response = await fetch(`${client.ventureUrl}/gp/investors`, { headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      const investors = result.items || result.data || [];
      if (investors.length === 0) { console.log('No investors found.'); return; }
      console.log('Investors:');
      investors.forEach(i => console.log(`  ${i.id}: ${i.name} (${i.email || 'no email'}) [${i.investor_type}]`));
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

ventureInv.command('create')
  .description('Create an investor (LP)')
  .requiredOption('--name <name>', 'Investor name')
  .requiredOption('--email <email>', 'Investor email')
  .option('--type <type>', 'Investor type (INDIVIDUAL, INSTITUTIONAL, CORPORATE, FAMILY_OFFICE)', 'INDIVIDUAL')
  .action(async (options) => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId, 'Content-Type': 'application/json' };
      const response = await fetch(`${client.ventureUrl}/gp/investors`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: options.name, email: options.email, investor_type: options.type })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`Investor created: ${result.name} (${result.id})`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

ventureInv.command('add-commitment')
  .description('Add investor commitment to a fund')
  .requiredOption('--investor <id>', 'Investor ID')
  .requiredOption('--fund <id>', 'Fund ID')
  .requiredOption('--amount <amount>', 'Commitment amount')
  .action(async (options) => {
    try {
      const client = await getClient();
      const orgId = client.activeOrgId;
      const headers = { ...client.headers, 'X-Zea-Org-Id': orgId, 'Content-Type': 'application/json' };
      const response = await fetch(`${client.ventureUrl}/gp/investors/${options.investor}/commitments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fund_id: options.fund, amount: parseInt(options.amount) })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`Commitment added: ${result.id}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const appCmd = program.command('app').description('App manifest management (zea_apps)');

appCmd.command('list')
  .description('List registered apps')
  .action(async () => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.appsUrl}/api/apps`, { headers: client.headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      const apps = result.apps || [];
      if (apps.length === 0) { console.log('No apps registered.'); return; }
      console.log('Registered Apps:');
      apps.forEach(a => console.log(`  ${a.app_id}: ${a.name} [${a.status}] v${a.version} — ${a.states_count} states, ${a.intents_count} intents`));
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

appCmd.command('show <app_id>')
  .description('Show app manifest')
  .action(async (appId) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.appsUrl}/api/apps/${appId}/manifest`, { headers: client.headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const manifest = await response.json();
      console.log(`App: ${manifest.name} v${manifest.version}`);
      console.log(`Domain: ${manifest.domain_auth} | Status: ${manifest.status}`);
      console.log(`\nStates:`);
      Object.keys(manifest.states || {}).forEach(s => console.log(`  ${s}`));
      console.log(`\nIntents:`);
      Object.entries(manifest.intent_routing || {}).forEach(([k, v]) => console.log(`  ${k} → ${v.type} ${v.target_state || v.workflow_module || ''}`));
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

appCmd.command('register <file>')
  .description('Register an app from a YAML or JSON manifest file')
  .action(async (filePath) => {
    try {
      const client = await getClient();
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf8');
      let manifest;
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        const yaml = await import('yaml');
        manifest = yaml.parse(content);
      } else {
        manifest = JSON.parse(content);
      }

      const payload = {
        app_id: manifest.app_id,
        name: manifest.name,
        domain_auth: manifest.domain_auth,
        status: manifest.status || 'active',
        version: manifest.version || '1.0.0',
        manifest: manifest,
        states: manifest.states || {},
        intent_routing: manifest.intent_routing || {}
      };

      const response = await fetch(`${client.appsUrl}/api/apps`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.details || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`App registered: ${result.name} (${result.app_id}) [${result.status}]`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const sduiCmd = program.command('sdui').description('Server-Driven UI commands');

sduiCmd.command('start <app_id>')
  .description('Start an SDUI session and get initial state')
  .option('--org-id <id>', 'Organization ID')
  .action(async (appId, options) => {
    try {
      const client = await getClient();
      const orgId = options.orgId || client.activeOrgId;
      const body = { app_id: appId, token: client.token };
      if (orgId) body.org_id = orgId;

      const response = await fetch(`${client.sduiUrl}/api/sessions`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const state = await response.json();
      console.log(`Session started: ${state.session_id}`);
      console.log(`State: ${state.screen_id}`);
      console.log(`Layout: ${state.layout?.type} (${(state.layout?.children || []).length} children)`);
      if (state.data) {
        const keys = Object.keys(state.data).filter(k => !k.startsWith('_') && k !== 'jwt' && k !== 'messages');
        if (keys.length) console.log(`Data: ${keys.join(', ')}`);
      }
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

sduiCmd.command('dispatch <session_id> <action>')
  .description('Dispatch an intent to an SDUI session')
  .argument('[payload]', 'JSON payload', '{}')
  .action(async (sessionId, action, payloadStr) => {
    try {
      const client = await getClient();
      let payload = {};
      try { payload = JSON.parse(payloadStr); } catch {}
      
      const response = await fetch(`${client.sduiUrl}/api/sessions/${sessionId}/dispatch`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({ action, payload })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const state = await response.json();
      console.log(`State: ${state.screen_id}`);
      console.log(`Layout: ${state.layout?.type}`);
      if (state.data) {
        const safeData = { ...state.data };
        delete safeData.jwt;
        console.log(`Data: ${JSON.stringify(safeData).substring(0, 200)}`);
      }
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const agentCmd = program.command('agent').description('Agent management (Glia/ReactAgent)');

agentCmd.command('list')
  .description('List running agents and their assigned skills')
  .action(async () => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.gliaUrl}/api/agents`, { headers: client.headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      const agents = result.agents || [];
      if (agents.length === 0) { console.log('No agents running.'); return; }
      console.log('Active Agents:');
      agents.forEach(a => console.log(`  ${a.name}: ${a.status} | skills: [${(a.skills||[]).join(', ')}] | users: ${a.user_count || 0}`));
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

agentCmd.command('create <name>')
  .description('Create a new agent')
  .option('--skills <list>', 'Comma-separated skill names')
  .action(async (name, options) => {
    try {
      const client = await getClient();
      const skills = options.skills ? options.skills.split(',').map(s => s.trim()) : [];
      const response = await fetch(`${client.gliaUrl}/api/agents`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({ name, skills })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`Agent '${result.name}' created [${result.status}]`);
      if (result.skills?.length) console.log(`  Skills: ${result.skills.join(', ')}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

agentCmd.command('assign <name>')
  .description('Assign a skill to a running agent (hot-reload)')
  .requiredOption('--skill <skill>', 'Skill name to assign')
  .action(async (name, options) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.gliaUrl}/api/agents/${encodeURIComponent(name)}/skills`, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({ skill: options.skill })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`Skill '${options.skill}' assigned to agent '${name}' [hot-reload]`);
      console.log(`  Active skills: ${(result.skills||[]).join(', ')}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

agentCmd.command('remove <name>')
  .description('Remove a skill from a running agent')
  .requiredOption('--skill <skill>', 'Skill name to remove')
  .action(async (name, options) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.gliaUrl}/api/agents/${encodeURIComponent(name)}/skills/${encodeURIComponent(options.skill)}`, {
        method: 'DELETE',
        headers: client.headers
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`Skill '${options.skill}' removed from agent '${name}'`);
      console.log(`  Active skills: ${(result.skills||[]).join(', ')}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

agentCmd.command('stop <name>')
  .description('Stop an agent')
  .action(async (name) => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.gliaUrl}/api/agents/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: client.headers
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      console.log(`Agent '${name}' stopped.`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

const skillCmd = program.command('skill').description('Skill management');

skillCmd.command('list')
  .description('List installed skills')
  .action(async () => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.gliaUrl}/api/skills`, { headers: client.headers });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      const skills = result.skills || [];
      if (skills.length === 0) { console.log('No skills installed.'); return; }
      console.log('Installed Skills:');
      skills.forEach(s => console.log(`  ${s.name}: ${s.description || ''} (${s.tools_count || 0} tools)`));
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

skillCmd.command('reload')
  .description('Force reload all skills (hot-reload)')
  .action(async () => {
    try {
      const client = await getClient();
      const response = await fetch(`${client.gliaUrl}/api/skills/reload`, {
        method: 'POST',
        headers: client.headers
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
      const result = await response.json();
      console.log(`Skills reloaded: ${result.count} skills loaded`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  });

// MCP Server Command
program.command('mcp')
  .description('Start Model Context Protocol (MCP) server')
  .action(async () => {
    try {
      const server = new Server({
        name: 'zea-mcp-server',
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {}
        }
      });

      server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
          tools: [
            {
              name: 'list_organizations',
              description: 'List all organizations the user belongs to',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'switch_organization',
              description: 'Switch the default organization context used for generating PATs',
              inputSchema: {
                type: 'object',
                properties: {
                  org_id_or_slug: { type: 'string', description: 'Organization ID or Slug to switch to' }
                },
                required: ['org_id_or_slug']
              }
            },
            {
              name: 'create_organization',
              description: 'Create a new organization',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Name of the organization' },
                  owner_email: { type: 'string', description: 'Email address of the owner' },
                  plan_type: { type: 'string', description: 'Plan type (free, basic, standard, premium, enterprise)' }
                },
                required: ['name', 'owner_email']
              }
            },
            {
              name: 'list_tokens',
              description: 'List active Personal Access Tokens (PATs) under the active organization context',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'create_token',
              description: 'Create a new Personal Access Token (PAT) under the active organization context',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Description/name of the token' }
                },
                required: ['name']
              }
            },
            {
              name: 'revoke_token',
              description: 'Revoke a Personal Access Token (PAT)',
              inputSchema: {
                type: 'object',
                properties: {
                  token_id: { type: 'string', description: 'Token ID to revoke' }
                },
                required: ['token_id']
              }
            },
            {
              name: 'add_member',
              description: 'Add a member to an organization by email',
              inputSchema: {
                type: 'object',
                properties: {
                  org_slug: { type: 'string', description: 'Organization slug or ID' },
                  email: { type: 'string', description: 'Email of the user to add' },
                  role: { type: 'string', description: 'Role (admin, member, billing)' }
                },
                required: ['org_slug', 'email', 'role']
              }
            },
            {
              name: 'remove_member',
              description: 'Remove a member from an organization by user ID',
              inputSchema: {
                type: 'object',
                properties: {
                  org_slug: { type: 'string', description: 'Organization slug or ID' },
                  user_id: { type: 'string', description: 'User ID to remove' }
                },
                required: ['org_slug', 'user_id']
              }
            },
            {
              name: 'list_members',
              description: 'List all members of an organization',
              inputSchema: {
                type: 'object',
                properties: {
                  org_slug: { type: 'string', description: 'Organization slug or ID' }
                },
                required: ['org_slug']
              }
            }
          ]
        };
      });

      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const client = await getClient();

        try {
          switch (name) {
            case 'list_organizations': {
              const response = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: JSON.stringify(result.organizations || [], null, 2) }]
              };
            }
            case 'switch_organization': {
              const target = args.org_id_or_slug;
              const response = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);

              const info = await response.json();
              const orgs = info.organizations || [];
              const match = orgs.find(o => o.id === target || o.slug === target);

              if (!match) {
                throw new Error(`Organization '${target}' not found.`);
              }

              const config = await loadConfig();
              config.activeOrgId = match.id;
              await saveConfig(config);
              return {
                content: [{ type: 'text', text: `Switched active organization to ${match.name} (${match.id})` }]
              };
            }
            case 'create_organization': {
              const response = await fetch(`${client.apiUrl}/api/organizations`, {
                method: 'POST',
                headers: client.headers,
                body: JSON.stringify({
                  name: args.name,
                  owner_email: args.owner_email,
                  plan_type: args.plan_type || 'free'
                })
              });
              if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error ${response.status}`);
              }
              const result = await response.json();
              return {
                content: [{ type: 'text', text: `Organization created successfully:\nName: ${result.data.name}\nID: ${result.data.id}\nOwner: ${result.data.owner_email}\nPlan: ${result.data.plan_type}` }]
              };
            }
            case 'list_tokens': {
              const response = await fetch(`${client.apiUrl}/api/personal-access-tokens`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              const pats = (result.data || []).filter(p => !client.activeOrgId || p.organization_id === client.activeOrgId);
              return {
                content: [{ type: 'text', text: JSON.stringify(pats, null, 2) }]
              };
            }
            case 'create_token': {
              const response = await fetch(`${client.apiUrl}/api/personal-access-tokens`, {
                method: 'POST',
                headers: client.headers,
                body: JSON.stringify({ name: args.name, organization_id: client.activeOrgId })
              });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: `Token created successfully:\nName: ${args.name}\nToken: ${result.token}` }]
              };
            }
            case 'revoke_token': {
              const response = await fetch(`${client.apiUrl}/api/personal-access-tokens/${args.token_id}`, {
                method: 'DELETE',
                headers: client.headers
              });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              return {
                content: [{ type: 'text', text: `Token ${args.token_id} revoked successfully.` }]
              };
            }
            case 'add_member': {
              const orgSlug = args.org_slug;
              const userinfoResp = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
              if (!userinfoResp.ok) throw new Error(`HTTP error ${userinfoResp.status}`);
              const info = await userinfoResp.json();
              const orgs = info.organizations || [];
              const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);
              if (!org) throw new Error(`Organization '${orgSlug}' not found.`);

              const response = await fetch(`${client.apiUrl}/api/organizations/${org.id}/members`, {
                method: 'POST',
                headers: client.headers,
                body: JSON.stringify({ email: args.email, role: args.role })
              });
              if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error ${response.status}`);
              }
              const result = await response.json();
              return {
                content: [{ type: 'text', text: `Member '${args.email}' added to '${org.name}' as ${args.role}.` }]
              };
            }
            case 'remove_member': {
              const orgSlug = args.org_slug;
              const userinfoResp = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
              if (!userinfoResp.ok) throw new Error(`HTTP error ${userinfoResp.status}`);
              const info = await userinfoResp.json();
              const orgs = info.organizations || [];
              const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);
              if (!org) throw new Error(`Organization '${orgSlug}' not found.`);

              const response = await fetch(`${client.apiUrl}/api/organizations/${org.id}/members/${args.user_id}`, {
                method: 'DELETE',
                headers: client.headers
              });
              if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error ${response.status}`);
              }
              return {
                content: [{ type: 'text', text: `Member '${args.user_id}' removed from '${org.name}'.` }]
              };
            }
            case 'list_members': {
              const orgSlug = args.org_slug;
              const userinfoResp = await fetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
              if (!userinfoResp.ok) throw new Error(`HTTP error ${userinfoResp.status}`);
              const info = await userinfoResp.json();
              const orgs = info.organizations || [];
              const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);
              if (!org) throw new Error(`Organization '${orgSlug}' not found.`);

              const response = await fetch(`${client.apiUrl}/api/organizations/${org.id}`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: JSON.stringify(result.data.members || [], null, 2) }]
              };
            }
            default:
              throw new Error(`Unknown tool: ${name}`);
          }
        } catch (error) {
          return {
            isError: true,
            content: [{ type: 'text', text: error.message }]
          };
        }
      });

      const transport = new StdioServerTransport();
      await server.connect(transport);
    } catch (e) {
      console.error('MCP Server initialization error:', e.message);
      process.exit(1);
    }
  });

program.parse();
