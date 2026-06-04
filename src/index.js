#!/usr/bin/env node

import { Command } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

import { loadConfig, saveConfig, getClient } from './client.js';
import zeaFetch from './lib/http.js';
import { register as registerAuth } from './commands/auth.js';
import { register as registerOrg } from './commands/org.js';
import { register as registerToken } from './commands/token.js';
import { register as registerWorkflow } from './commands/workflow.js';
import { register as registerDomain } from './commands/domain.js';
import { register as registerDomainPipeline } from './commands/domain-pipeline.js';
import { register as registerVenture } from './commands/venture.js';
import { register as registerNutrition } from './commands/nutrition.js';
import { register as registerApp } from './commands/app.js';
import { register as registerSdui } from './commands/sdui.js';
import { register as registerAgent } from './commands/agent.js';
import { register as registerSkill } from './commands/skill.js';
import { register as registerSensor } from './commands/sensor.js';
import { register as registerDesign } from './commands/design.js';
import { register as registerMemory } from './commands/memory.js';
import { register as registerDoctor } from './commands/doctor.js';
import { register as registerInnovation } from './commands/innovation.js';
import { register as registerShell } from './commands/shell.js';
import { register as registerLearn } from './commands/learn.js';
import { register as registerExperiment } from './commands/experiment.js';
import { register as registerExpert } from './commands/expert.js';
import { register as registerGlia } from './commands/glia.js';
import { register as registerScreen } from './commands/screen.js';
import { register as registerBranch } from './commands/branch.js';
import { register as registerDb } from './commands/db.js';
import { register as registerDiagnose } from './commands/diagnose.js';
import { register as registerConfig } from './commands/config.js';
import { register as registerVerify } from './commands/verify.js';
import { register as registerQa } from './commands/qa.js';
import { register as registerValidate } from './commands/validate.js';
import { register as registerImprove } from './commands/improve.js';
import { register as registerOrchestrate } from './commands/orchestrate.js';
import { register as registerSession } from './commands/session.js';
import { register as registerServer } from './commands/server.js';import { register as registerWs } from './commands/ws_server.js';
import { register as registerXlsx } from './commands/xlsx.js';
const program = new Command();

program
  .name('zea')
  .description('ZEA Platform Agent Skill CLI')
    .version('1.1.0');

registerAuth(program);
registerOrg(program);
registerToken(program);
registerWorkflow(program);
registerDomain(program);
registerDomainPipeline();
registerVenture(program);
registerNutrition(program);
registerApp(program);
registerSdui(program);
registerAgent(program);
registerSkill(program);
registerSensor(program);
registerDesign(program);
registerMemory(program);
registerDoctor(program);
registerInnovation(program);
registerShell(program);
registerLearn(program);
registerExperiment(program);
registerGlia(program);
registerScreen(program);
registerExpert(program);
registerBranch(program);
registerDb(program);
registerDiagnose(program);
registerConfig(program);
registerVerify(program);
registerQa(program);
registerValidate(program);
registerImprove(program);
registerOrchestrate(program);
registerSession(program);
registerServer(program);registerWs(program);
registerXlsx(program);program.command('mcp')
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
              name: 'glia_swarm_create',
              description: 'Crea un nuevo agente especialista en el swarm Glia',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Nombre del agente' },
                  capabilities: { type: 'string', description: 'Capabilities separadas por coma (bash, elixir, filesystem, etc.)' },
                  system_prompt: { type: 'string', description: 'System prompt personalizado' }
                },
                required: ['name']
              }
            },
            {
              name: 'glia_chat',
              description: 'Envía un mensaje al agente Glia vía WebSocket y recibe streaming en tiempo real',
              inputSchema: {
                type: 'object',
                properties: {
                  message: { type: 'string', description: 'Mensaje a enviar' },
                  tools: { type: 'string', description: 'Tools separadas por coma (bash, filesystem, etc.)' }
                },
                required: ['message']
              }
            },
            {
              name: 'glia_list_agents',
              description: 'Lista agentes activos en el swarm Glia',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'db_diff',
              description: 'Show SQL diff between branch (or main) and current DB',
              inputSchema: {
                type: 'object',
                properties: {
                  branch: { type: 'string', description: 'Branch name (optional)' }
                }
              }
            },
            {
              name: 'db_push',
              description: 'Apply SQL schema to the database. Overwrites/applies changes.',
              inputSchema: {
                type: 'object',
                properties: {
                  branch: { type: 'string', description: 'Branch name (optional)' }
                }
              }
            },
            {
              name: 'db_reset',
              description: 'Reset database to clean init-venture.sql schema (DELETES ALL DATA)',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'db_migrations_new',
              description: 'Create a new migration file',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Migration name (e.g. add-pending-tasks)' }
                },
                required: ['name']
              }
            },
            {
              name: 'db_migrations_list',
              description: 'List all migrations',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'sdui_start',
              description: 'Start an SDUI session and get initial state',
              inputSchema: {
                type: 'object',
                properties: {
                  app_id: { type: 'string', description: 'ZEA App ID' },
                  org_id: { type: 'string', description: 'Organization ID (optional)' }
                },
                required: ['app_id']
              }
            },
            {
              name: 'sdui_dispatch',
              description: 'Dispatch an intent/action to an SDUI session',
              inputSchema: {
                type: 'object',
                properties: {
                  session_id: { type: 'string', description: 'SDUI Session ID' },
                  action: { type: 'string', description: 'Action/Intent name' },
                  payload: { type: 'object', description: 'JSON payload objects (optional)' }
                },
                required: ['session_id', 'action']
              }
            },
            {
              name: 'sdui_manifest',
              description: 'Show app manifest summary (states, intents, shell)',
              inputSchema: {
                type: 'object',
                properties: {
                  app_id: { type: 'string', description: 'ZEA App ID' }
                },
                required: ['app_id']
              }
            },
            {
              name: 'sdui_screens',
              description: 'List all screens/states in the app manifest',
              inputSchema: {
                type: 'object',
                properties: {
                  app_id: { type: 'string', description: 'ZEA App ID' }
                },
                required: ['app_id']
              }
            },
            {
              name: 'sdui_screen',
              description: 'Show the HTML content of a StitchedScreen state',
              inputSchema: {
                type: 'object',
                properties: {
                  app_id: { type: 'string', description: 'ZEA App ID' },
                  state: { type: 'string', description: 'State name' }
                },
                required: ['app_id', 'state']
              }
            },
            {
              name: 'venture_fund_list',
              description: 'List funds for the active organization',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'venture_fund_create',
              description: 'Create a new fund (runs async validation, fees, transitions)',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Fund name' },
                  type: { type: 'string', description: 'Fund type (e.g. VENTURE_CAPITAL, HEDGE_FUND)', default: 'VENTURE_CAPITAL' },
                  hard_cap: { type: 'string', description: 'Hard cap amount (optional)' },
                  currency: { type: 'string', description: 'Currency (default: USD)', default: 'USD' },
                  mgmt_fee: { type: 'string', description: 'Management fee config JSON string (optional)' },
                  carry: { type: 'string', description: 'Carried interest config JSON string (optional)' }
                },
                required: ['name']
              }
            },
            {
              name: 'venture_fund_show',
              description: 'Show fund details by ID',
              inputSchema: {
                type: 'object',
                properties: {
                  fund_id: { type: 'string', description: 'Fund ID' }
                },
                required: ['fund_id']
              }
            },
            {
              name: 'venture_fund_transition',
              description: 'Transition fund to a new status (e.g. FUNDRAISING, ACTIVE, HARVESTING, CLOSED)',
              inputSchema: {
                type: 'object',
                properties: {
                  fund_id: { type: 'string', description: 'Fund ID' },
                  status: { type: 'string', description: 'New status' }
                },
                required: ['fund_id', 'status']
              }
            },
            {
              name: 'venture_fund_configure_fees',
              description: 'Configure management fee and carried interest for a fund',
              inputSchema: {
                type: 'object',
                properties: {
                  fund_id: { type: 'string', description: 'Fund ID' },
                  mgmt_fee: { type: 'string', description: 'Management fee config JSON string (optional)' },
                  carry: { type: 'string', description: 'Carried interest config JSON string (optional)' }
                },
                required: ['fund_id']
              }
            },
            {
              name: 'venture_dashboard',
              description: 'Show GP dashboard for the active organization',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'venture_capital_call_list',
              description: 'List capital calls',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'venture_capital_call_create',
              description: 'Create a capital call (sync API or async Cerebelum workflow)',
              inputSchema: {
                type: 'object',
                properties: {
                  fund_id: { type: 'string', description: 'Fund ID' },
                  amount: { type: 'string', description: 'Total amount' },
                  due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
                  purpose: { type: 'string', description: 'Purpose description (optional)' },
                  use_workflow: { type: 'boolean', description: 'Use async Cerebelum workflow (default: false)' }
                },
                required: ['fund_id', 'amount', 'due_date']
              }
            },
            {
              name: 'venture_capital_call_show',
              description: 'Show capital call details by ID',
              inputSchema: {
                type: 'object',
                properties: {
                  call_id: { type: 'string', description: 'Capital Call ID' }
                },
                required: ['call_id']
              }
            },
            {
              name: 'venture_capital_call_send',
              description: 'Send capital call to investors',
              inputSchema: {
                type: 'object',
                properties: {
                  call_id: { type: 'string', description: 'Capital Call ID' }
                },
                required: ['call_id']
              }
            },
            {
              name: 'venture_investor_list',
              description: 'List investors',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'venture_investor_create',
              description: 'Create an investor (LP)',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Investor name' },
                  email: { type: 'string', description: 'Investor email' },
                  type: { type: 'string', description: 'Investor type (INDIVIDUAL, INSTITUTIONAL, CORPORATE, FAMILY_OFFICE)', default: 'INDIVIDUAL' }
                },
                required: ['name', 'email']
              }
            },
            {
              name: 'venture_investor_add_commitment',
              description: 'Add investor commitment to a fund',
              inputSchema: {
                type: 'object',
                properties: {
                  investor_id: { type: 'string', description: 'Investor ID' },
                  fund_id: { type: 'string', description: 'Fund ID' },
                  amount: { type: 'string', description: 'Commitment amount' }
                },
                required: ['investor_id', 'fund_id', 'amount']
              }
            },
            {
              name: 'venture_data_add_table',
              description: 'Create a new table in the Venture DB and update init-venture.sql',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Table name (e.g. pending_tasks)' },
                  fields: { type: 'string', description: 'Fields array as JSON string: [{"name": "title", "type": "VARCHAR(255)", "nullable": false}]' }
                },
                required: ['name', 'fields']
              }
            },
            {
              name: 'venture_api_add_endpoint',
              description: 'Generate controller code for a new API endpoint in venture-gp-api',
              inputSchema: {
                type: 'object',
                properties: {
                  method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE)' },
                  path: { type: 'string', description: 'Route path (e.g. /gp/tasks)' },
                  handler: { type: 'string', description: 'Handler function name (e.g. list_tasks)' }
                },
                required: ['method', 'path', 'handler']
              }
            },
            {
              name: 'venture_data_import',
              description: 'Import data from Excel file into Venture DB',
              inputSchema: {
                type: 'object',
                properties: {
                  file_path: { type: 'string', description: 'Path to Excel file' },
                  use_llm: { type: 'boolean', description: 'Use LLM for auto-mapping columns (default: false)' }
                },
                required: ['file_path']
              }
            },
            {
              name: 'design_list_screens',
              description: 'List Stitch screens for an app',
              inputSchema: {
                type: 'object',
                properties: {
                  app_id: { type: 'string', description: 'ZEA App ID' },
                  stitch_key: { type: 'string', description: 'Stitch API Key (optional)' }
                },
                required: ['app_id']
              }
            },
            {
              name: 'design_import_screen',
              description: 'Import a Stitch screen into ZEA app manifest',
              inputSchema: {
                type: 'object',
                properties: {
                  app_id: { type: 'string', description: 'ZEA App ID' },
                  screen_id: { type: 'string', description: 'Stitch screen ID' },
                  state: { type: 'string', description: 'SDUI state name' },
                  intent: { type: 'string', description: 'Intent name for routing' },
                  stitch_key: { type: 'string', description: 'Stitch API Key (optional)' }
                },
                required: ['app_id', 'screen_id', 'state', 'intent']
              }
            },
            {
              name: 'design_status',
              description: 'Show import status for an app',
              inputSchema: {
                type: 'object',
                properties: {
                  app_id: { type: 'string', description: 'ZEA App ID' }
                },
                required: ['app_id']
              }
            },
            {
              name: 'design_update_design',
              description: 'Update design system tokens (colors, typography)',
              inputSchema: {
                type: 'object',
                properties: {
                  app_id: { type: 'string', description: 'ZEA App ID' },
                  token: { type: 'string', description: 'Token path (e.g. colors.primary)' },
                  value: { type: 'string', description: 'New value' },
                  experiment: { type: 'string', description: 'Experiment branch name (optional)' }
                },
                required: ['app_id', 'token', 'value']
              }
            }
          ]
        };
      });

      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const client = await getClient();

        const runCli = async (argsArray) => {
          const { execFileSync } = await import('child_process');
          const cliPath = process.argv[1];
          try {
            const output = execFileSync(process.execPath, [cliPath, ...argsArray], { encoding: 'utf-8', timeout: 300000 });
            return {
              content: [{ type: 'text', text: output.trim() || '(no output)' }]
            };
          } catch (e) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Command execution failed: ${e.stdout || ''}\n${e.stderr || e.message}` }]
            };
          }
        };

        try {
          switch (name) {
            case 'list_organizations': {
              const response = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: JSON.stringify(result.organizations || [], null, 2) }]
              };
            }
            case 'switch_organization': {
              const target = args.org_id_or_slug;
              const response = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
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
              const response = await zeaFetch(`${client.apiUrl}/api/organizations`, {
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
              const response = await zeaFetch(`${client.apiUrl}/api/personal-access-tokens`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              const pats = (result.data || []).filter(p => !client.activeOrgId || p.organization_id === client.activeOrgId);
              return {
                content: [{ type: 'text', text: JSON.stringify(pats, null, 2) }]
              };
            }
            case 'create_token': {
              const response = await zeaFetch(`${client.apiUrl}/api/personal-access-tokens`, {
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
              const response = await zeaFetch(`${client.apiUrl}/api/personal-access-tokens/${args.token_id}`, {
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
              const userinfoResp = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
              if (!userinfoResp.ok) throw new Error(`HTTP error ${userinfoResp.status}`);
              const info = await userinfoResp.json();
              const orgs = info.organizations || [];
              const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);
              if (!org) throw new Error(`Organization '${orgSlug}' not found.`);

              const response = await zeaFetch(`${client.apiUrl}/api/organizations/${org.id}/members`, {
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
              const userinfoResp = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
              if (!userinfoResp.ok) throw new Error(`HTTP error ${userinfoResp.status}`);
              const info = await userinfoResp.json();
              const orgs = info.organizations || [];
              const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);
              if (!org) throw new Error(`Organization '${orgSlug}' not found.`);

              const response = await zeaFetch(`${client.apiUrl}/api/organizations/${org.id}/members/${args.user_id}`, {
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
              const userinfoResp = await zeaFetch(`${client.apiUrl}/oauth/userinfo`, { headers: client.headers });
              if (!userinfoResp.ok) throw new Error(`HTTP error ${userinfoResp.status}`);
              const info = await userinfoResp.json();
              const orgs = info.organizations || [];
              const org = orgs.find(o => o.id === orgSlug || o.slug === orgSlug);
              if (!org) throw new Error(`Organization '${orgSlug}' not found.`);

              const response = await zeaFetch(`${client.apiUrl}/api/organizations/${org.id}`, { headers: client.headers });
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
              const response = await zeaFetch(`${client.sensorUrl}/api/sensor/events?${params}`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
              };
            }
            case 'sensor_get_event': {
              const response = await zeaFetch(`${client.sensorUrl}/api/sensor/events/${args.event_id}`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
              };
            }
            case 'sensor_analyze_event': {
              const response = await zeaFetch(`${client.sensorUrl}/api/sensor/analyze/${args.event_id}`, {
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
            case 'glia_swarm_create': {
              return {
                content: [{ type: 'text', text: JSON.stringify({
                  instruction: 'Use the Glia CLI to create an agent via WebSocket',
                  cli: `zea glia agent create ${args.name}${args.capabilities ? ' --skills ' + args.capabilities : ''}`,
                  note: 'Glia agents are created via WebSocket, not REST. Use the CLI command above.'
                }, null, 2) }]
              };
            }
            case 'glia_chat': {
              return {
                content: [{ type: 'text', text: JSON.stringify({
                  instruction: 'Connect to Glia WebSocket for streaming chat',
                  ws_url: client.gliaWsUrl || 'ws://localhost:4002/socket/websocket',
                  session_id: 'mcp-' + Date.now(),
                  message: args.message,
                  tools: args.tools ? args.tools.split(',').map(s => s.trim()) : [],
                  cli: `zea glia chat "${args.message}"${args.tools ? ' --tools ' + args.tools : ''}`
                }, null, 2) }]
              };
            }
            case 'glia_list_agents': {
              const response = await zeaFetch(`${client.gliaUrl}/api/agents`, { headers: client.headers });
              if (!response.ok) throw new Error(`HTTP error ${response.status}`);
              const result = await response.json();
              return {
                content: [{ type: 'text', text: JSON.stringify(result.agents || [], null, 2) }]
              };
            }
            case 'db_diff': {
              const cmdArgs = ['db', 'diff'];
              if (args.branch) cmdArgs.push('--branch', args.branch);
              cmdArgs.push('--json');
              return await runCli(cmdArgs);
            }
            case 'db_push': {
              const cmdArgs = ['db', 'push'];
              if (args.branch) cmdArgs.push('--branch', args.branch);
              cmdArgs.push('--yes');
              return await runCli(cmdArgs);
            }
            case 'db_reset': {
              return await runCli(['db', 'reset', '--yes']);
            }
            case 'db_migrations_new': {
              return await runCli(['db', 'migrations', 'new', '--name', args.name]);
            }
            case 'db_migrations_list': {
              return await runCli(['db', 'migrations', 'list', '--json']);
            }
            case 'sdui_start': {
              const cmdArgs = ['sdui', 'start', args.app_id];
              if (args.org_id) cmdArgs.push('--org-id', args.org_id);
              return await runCli(cmdArgs);
            }
            case 'sdui_dispatch': {
              const payloadStr = args.payload ? JSON.stringify(args.payload) : '{}';
              return await runCli(['sdui', 'dispatch', args.session_id, args.action, payloadStr]);
            }
            case 'sdui_manifest': {
              return await runCli(['sdui', 'manifest', args.app_id]);
            }
            case 'sdui_screens': {
              return await runCli(['sdui', 'screens', args.app_id]);
            }
            case 'sdui_screen': {
              return await runCli(['sdui', 'screen', args.app_id, args.state]);
            }
            case 'venture_fund_list': {
              return await runCli(['venture', 'fund', 'list']);
            }
            case 'venture_fund_create': {
              const cmdArgs = ['venture', 'fund', 'create', '--name', args.name];
              if (args.type) cmdArgs.push('--type', args.type);
              if (args.hard_cap) cmdArgs.push('--hard-cap', args.hard_cap);
              if (args.currency) cmdArgs.push('--currency', args.currency);
              if (args.mgmt_fee) cmdArgs.push('--mgmt-fee', args.mgmt_fee);
              if (args.carry) cmdArgs.push('--carry', args.carry);
              return await runCli(cmdArgs);
            }
            case 'venture_fund_show': {
              return await runCli(['venture', 'fund', 'show', args.fund_id]);
            }
            case 'venture_fund_transition': {
              return await runCli(['venture', 'fund', 'transition', args.fund_id, '--status', args.status]);
            }
            case 'venture_fund_configure_fees': {
              const cmdArgs = ['venture', 'fund', 'configure-fees', args.fund_id];
              if (args.mgmt_fee) cmdArgs.push('--mgmt-fee', args.mgmt_fee);
              if (args.carry) cmdArgs.push('--carry', args.carry);
              return await runCli(cmdArgs);
            }
            case 'venture_dashboard': {
              return await runCli(['venture', 'dashboard']);
            }
            case 'venture_capital_call_list': {
              return await runCli(['venture', 'capital-call', 'list']);
            }
            case 'venture_capital_call_create': {
              const cmdArgs = ['venture', 'capital-call', 'create', '--fund', args.fund_id, '--amount', args.amount, '--due-date', args.due_date];
              if (args.purpose) cmdArgs.push('--purpose', args.purpose);
              if (args.use_workflow) cmdArgs.push('--workflow');
              return await runCli(cmdArgs);
            }
            case 'venture_capital_call_show': {
              return await runCli(['venture', 'capital-call', 'show', args.call_id]);
            }
            case 'venture_capital_call_send': {
              return await runCli(['venture', 'capital-call', 'send', args.call_id]);
            }
            case 'venture_investor_list': {
              return await runCli(['venture', 'investor', 'list']);
            }
            case 'venture_investor_create': {
              const cmdArgs = ['venture', 'investor', 'create', '--name', args.name, '--email', args.email];
              if (args.type) cmdArgs.push('--type', args.type);
              return await runCli(cmdArgs);
            }
            case 'venture_investor_add_commitment': {
              return await runCli(['venture', 'investor', 'add-commitment', '--investor', args.investor_id, '--fund', args.fund_id, '--amount', args.amount]);
            }
            case 'venture_data_add_table': {
              return await runCli(['venture', 'data', 'add-table', '--name', args.name, '--fields', args.fields]);
            }
            case 'venture_api_add_endpoint': {
              return await runCli(['venture', 'api', 'add-endpoint', '--method', args.method, '--path', args.path, '--handler', args.handler]);
            }
            case 'venture_data_import': {
              const cmdArgs = ['venture', 'data', 'import', '--file', args.file_path, '--yes'];
              if (args.use_llm) cmdArgs.push('--llm');
              return await runCli(cmdArgs);
            }
            case 'design_list_screens': {
              const cmdArgs = ['design', 'list-screens', '--app', args.app_id];
              if (args.stitch_key) cmdArgs.push('--stitch-key', args.stitch_key);
              return await runCli(cmdArgs);
            }
            case 'design_import_screen': {
              const cmdArgs = ['design', 'import-screen', '--app', args.app_id, '--screen-id', args.screen_id, '--state', args.state, '--intent', args.intent];
              if (args.stitch_key) cmdArgs.push('--stitch-key', args.stitch_key);
              return await runCli(cmdArgs);
            }
            case 'design_status': {
              return await runCli(['design', 'status', '--app', args.app_id]);
            }
            case 'design_update_design': {
              const cmdArgs = ['design', 'update-design', '--app', args.app_id, '--token', args.token, '--value', args.value];
              if (args.experiment) cmdArgs.push('--experiment', args.experiment);
              return await runCli(cmdArgs);
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
