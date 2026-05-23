#!/usr/bin/env node

import { Command } from 'commander';
import http from 'http';
import crypto from 'crypto';
import open from 'open';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'thalamus');
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
  const token = process.env.THALAMUS_PAT || process.env.THALAMUS_TOKEN || config.token;
  const apiUrl = process.env.THALAMUS_API_URL || config.apiUrl || 'http://auth.zea.localhost:4000';
  const activeOrgId = config.activeOrgId || null;

  if (!token) {
    throw new Error('Not authenticated. Please run "thalamus auth login" or set THALAMUS_PAT.');
  }

  return {
    apiUrl,
    token,
    activeOrgId,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
}

// Interactive OAuth2 login via local server
async function handleLogin(options) {
  const apiUrl = process.env.THALAMUS_API_URL || options.url || 'http://auth.zea.localhost:4000';
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
        console.log('Successfully authenticated with ZEA Thalamus!');
        
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
  .name('thalamus')
  .description('ZEA Thalamus Agent Skill CLI')
  .version('1.0.0');

const auth = program.command('auth').description('Authentication commands');

auth.command('login')
  .description('Login interactively using browser')
  .option('--url <url>', 'Thalamus API URL')
  .action(handleLogin);

auth.command('set-token <token>')
  .description('Configure a Personal Access Token (PAT) manually')
  .option('--url <url>', 'Thalamus API URL')
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

// MCP Server Command
program.command('mcp')
  .description('Start Model Context Protocol (MCP) server')
  .action(async () => {
    try {
      const server = new Server({
        name: 'thalamus-mcp-server',
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
