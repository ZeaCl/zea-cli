#!/usr/bin/env node

import { Command } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

import { loadConfig, saveConfig, getClient } from './client.js';
import { register as registerAuth } from './commands/auth.js';
import { register as registerOrg } from './commands/org.js';
import { register as registerToken } from './commands/token.js';
import { register as registerWorkflow } from './commands/workflow.js';
import { register as registerDomain } from './commands/domain.js';
import { register as registerVenture } from './commands/venture.js';
import { register as registerApp } from './commands/app.js';
import { register as registerSdui } from './commands/sdui.js';
import { register as registerAgent } from './commands/agent.js';
import { register as registerSkill } from './commands/skill.js';
import { register as registerSensor } from './commands/sensor.js';
import { register as registerDesign } from './commands/design.js';
import { register as registerMemory } from './commands/memory.js';
import { register as registerDoctor } from './commands/doctor.js';
import { register as registerInnovation } from './commands/innovation.js';

const program = new Command();

program
  .name('zea')
  .description('ZEA Platform Agent Skill CLI')
  .version('1.0.0');

registerAuth(program);
registerOrg(program);
registerToken(program);
registerWorkflow(program);
registerDomain(program);
registerVenture(program);
registerApp(program);
registerSdui(program);
registerAgent(program);
registerSkill(program);
registerSensor(program);
registerDesign(program);
registerMemory(program);
registerDoctor(program);
registerInnovation(program);

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
            },
            {
              name: 'sensor_transcribe_audio',
              description: 'Transcribe an audio file to text using MLX Whisper (optimized for Apple Silicon). Supports .opus, .mp3, .wav, .m4a, .flac, .ogg.',
              inputSchema: {
                type: 'object',
                properties: {
                  file_path: { type: 'string', description: 'Absolute or relative path to the audio file' },
                  model: { type: 'string', description: 'Whisper model: tiny, small, medium, large-v3-turbo (default), large-v3' },
                  language: { type: 'string', description: 'Language code: es (default), en, auto' }
                },
                required: ['file_path']
              }
            },
            {
              name: 'sensor_list_events',
              description: 'List sensor events (transcriptions, WhatsApp messages, image analyses) with optional filters',
              inputSchema: {
                type: 'object',
                properties: {
                  source: { type: 'string', description: 'Filter by source: audio, whatsapp, image, video, location' },
                  status: { type: 'string', description: 'Filter by status: ingested, processing, completed, failed' },
                  limit: { type: 'integer', description: 'Maximum number of results (default 50)' }
                }
              }
            },
            {
              name: 'sensor_get_event',
              description: 'Get a specific sensor event by ID, including transcription or analysis results',
              inputSchema: {
                type: 'object',
                properties: {
                  event_id: { type: 'string', description: 'The sensor event ID' }
                },
                required: ['event_id']
              }
            },
            {
              name: 'sensor_analyze_event',
              description: 'Analiza un evento del sensor usando Glia con DeepSeek. Clasifica el contenido (product_requirement, question, chat_casual) y si es un requerimiento de producto, genera un Value Proposition Canvas completo (Customer Jobs, Pains, Gains, Value Map, Propuesta de Valor, Hipótesis).',
              inputSchema: {
                type: 'object',
                properties: {
                  event_id: { type: 'string', description: 'El ID del evento del sensor a analizar' }
                },
                required: ['event_id']
              }
            },
            {
              name: 'glia_list_missions',
              description: 'Lista todas las misiones disponibles en ~/.zea/agents/ (cada misión define el comportamiento y skills de un agente Glia)',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'glia_create_agent',
              description: 'Crea un nuevo agente Glia con una misión y skills específicas',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Nombre del agente' },
                  mission: { type: 'string', description: 'Misión a cargar (desde ~/.zea/agents/{mission})' },
                  skills: { type: 'string', description: 'Skills separadas por coma' }
                },
                required: ['name']
              }
            },
            {
              name: 'glia_set_soul',
              description: 'Crea o actualiza la identidad (SOUL.md) de una misión de agente Glia',
              inputSchema: {
                type: 'object',
                properties: {
                  mission: { type: 'string', description: 'Nombre de la misión' },
                  content: { type: 'string', description: 'Contenido del SOUL.md (markdown)' }
                },
                required: ['mission', 'content']
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
            case 'sensor_transcribe_audio': {
              const { execSync } = await import('child_process');
              const scriptPath = '/Users/dev/Documents/zea/sensor/priv/python/transcribir';
              const cmd = `${scriptPath} "${args.file_path}" --model ${args.model || 'large-v3-turbo'} --language ${args.language || 'es'} --formats txt,json --quiet`;
              try {
                const output = execSync(cmd, { encoding: 'utf-8', timeout: 300000 });
                return {
                  content: [{ type: 'text', text: output.trim() }]
                };
              } catch (e) {
                return {
                  isError: true,
                  content: [{ type: 'text', text: `Transcription failed: ${e.stderr || e.message}` }]
                };
              }
            }
            case 'sensor_list_events': {
              const params = new URLSearchParams();
              if (args.source) params.set('source', args.source);
              if (args.status) params.set('status', args.status);
              if (args.limit) params.set('limit', args.limit.toString());
              const response = await fetch(`${client.sensorUrl}/api/sensor/events?${params}`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
              };
            }
            case 'sensor_get_event': {
              const response = await fetch(`${client.sensorUrl}/api/sensor/events/${args.event_id}`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
              };
            }
            case 'sensor_analyze_event': {
              const response = await fetch(`${client.sensorUrl}/api/sensor/analyze/${args.event_id}`, {
                method: 'POST',
                headers: { ...client.headers, 'Content-Type': 'application/json' }
              });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              const parts = [`Classification: ${result.classification}`, `Analysis Type: ${result.data?.analysis_type}`];
              if (result.innovation && result.innovation !== 'N/A') {
                parts.push(`\n=== Value Proposition Canvas ===\n${result.innovation}`);
              }
              return {
                content: [{ type: 'text', text: parts.join('\n') }]
              };
            }
            case 'glia_list_missions': {
              const response = await fetch(`${client.gliaUrl}/api/missions`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: JSON.stringify(result.data || [], null, 2) }]
              };
            }
            case 'glia_create_agent': {
              const body = { name: args.name, skills: args.skills ? args.skills.split(',').map(s => s.trim()) : [] };
              if (args.mission) body.mission = args.mission;
              const response = await fetch(`${client.gliaUrl}/api/agents`, {
                method: 'POST',
                headers: { ...client.headers, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
              });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: `Agent '${result.name}' created with status: ${result.status}${result.skills?.length ? ', skills: ' + result.skills.join(', ') : ''}` }]
              };
            }
            case 'glia_set_soul': {
              const response = await fetch(`${client.gliaUrl}/api/missions`, {
                method: 'POST',
                headers: { ...client.headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: args.mission, soul: args.content })
              });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: `Mission '${result.data.name}' ${result.data.status}` }]
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

async function loadPlugins() {
  const pluginsDir = path.join(os.homedir(), '.zea', 'cli', 'plugins');
  try {
    const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginFile = path.join(pluginsDir, entry.name, 'index.js');
        try {
          await fs.access(pluginFile);
          const plugin = await import(pluginFile);
          if (typeof plugin.register === 'function') {
            plugin.register(program);
          }
        } catch (e) {
          // Plugin not found or has no register function, skip silently
        }
      }
    }
  } catch (e) {
    // Plugins directory doesn't exist, skip silently
  }
}

await loadPlugins();

program.parse();
