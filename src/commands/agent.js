import { getClient } from '../client.js';
import { withLearning, readJSON } from '../utils/learning.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export function register(program) {
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
    .option('--mission <mission>', 'Agent mission (loads SOUL.md + skills from ~/.zea/agents/{mission})')
    .action(async (name, options) => {
      try {
        const client = await getClient();
        const skills = options.skills ? options.skills.split(',').map(s => s.trim()) : [];
        const body = { name, skills };
        if (options.mission) body.mission = options.mission;
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

  agentCmd.command('missions')
    .description('List available agent missions from ~/.zea/agents/')
    .action(async () => {
      try {
        const client = await getClient();
        const response = await fetch(`${client.gliaUrl}/api/missions`, { headers: client.headers });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();
        const missions = result.data || [];
        if (missions.length === 0) { console.log('No missions found.'); return; }
        console.log('Available missions:');
        missions.forEach(m => console.log(`  ${m}`));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  agentCmd.command('set-soul <mission>')
    .description('Create or update a mission SOUL.md')
    .argument('<file>', 'Path to SOUL.md file')
    .action(async (mission, file) => {
      try {
        const client = await getClient();
        const fs = await import('fs/promises');
        const content = await fs.readFile(file, 'utf8');
        const response = await fetch(`${client.gliaUrl}/api/missions`, {
          method: 'POST',
          headers: { ...client.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: mission, soul: content })
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();
        console.log(`Mission '${result.data.name}' ${result.data.status}`);
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  // ─── Autonomous Improvement ──────────────────────────

  const MEMORY_DIR = path.join(os.homedir(), '.zea', 'memory');

  async function readAppMemory(appId, file) {
    try {
      return JSON.parse(await fs.readFile(path.join(MEMORY_DIR, 'apps', appId, file), 'utf8'));
    } catch { return null; }
  }

  async function fetchStitchScreens(apiKey, projectId) {
    if (!apiKey || !projectId) return [];
    try {
      const r = await fetch('https://stitch.googleapis.com/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'list_screens', arguments: { projectId } }, id: 1 })
      });
      const d = await r.json();
      const text = d?.result?.content?.[0]?.text;
      if (text) {
        const data = JSON.parse(text);
        return (data.screens || []).map(s => ({
          id: s.name.split('/').pop(),
          title: s.title || 'Untitled'
        }));
      }
    } catch (e) { /* ignore */ }
    return [];
  }

  agentCmd.command('scan')
    .description('Scan for gaps: screens to import, missing intents, learning issues')
    .requiredOption('--app <id>', 'ZEA App ID')
    .option('--stitch-key <key>', 'Stitch API key')
    .action(async (opts) => {
      try {
        const client = await getClient();
        const issues = [];
        console.log('═══ Agent Scan: ' + opts.app + ' ═══\n');

        // 1. Stitch screens not in manifest
        const mem = await readAppMemory(opts.app, 'stitch.json');
        const apiKey = opts.stitchKey || process.env.STITCH_KEY;
        if (mem?.project_id && apiKey) {
          const stitchScreens = await fetchStitchScreens(apiKey, mem.project_id);
          const imported = mem.screen_mappings || {};
          const missing = stitchScreens.filter(s =>
            !Object.values(imported).some(i => i.stitch_id === s.id)
          );
          console.log('📋 Stitch Screens: ' + stitchScreens.length + ' total, ' + Object.keys(imported).length + ' imported');
          if (missing.length === 0) {
            console.log('   ✅ All screens imported');
          } else {
            for (const s of missing) {
              console.log('   ⬜ ' + s.title + ' (' + s.id.substring(0,15) + '...)');
              issues.push({ type: 'screen_missing', screen_id: s.id, title: s.title });
            }
          }
        }
        console.log('');

        // 2. Manifest checks
        const mResp = await fetch(client.appsUrl + '/api/apps/' + opts.app + '/manifest', { headers: client.headers });
        if (mResp.ok) {
          const manifest = await mResp.json();
          const states = Object.keys(manifest.states || {});
          const intents = manifest.intent_routing || {};
          const sidebarItems = manifest.shell?.sidebar?.items || [];
          const intentedStates = new Set(Object.values(intents).map(i => i.target_state));
          const statesWithoutIntents = states.filter(s => !intentedStates.has(s));
          console.log('🔗 Intent Routing: ' + Object.keys(intents).length + ' intents, ' + states.length + ' states');
          for (const s of statesWithoutIntents) {
            console.log("   ⬜ State '" + s + "' has no intent routing");
            issues.push({ type: 'missing_intent', state: s });
          }
          for (const item of sidebarItems) {
            const val = item.action?.value;
            if (val && !Object.keys(intents).includes(val)) {
              console.log("   ⬜ Sidebar '" + item.label + "' → intent '" + val + "' not defined");
              issues.push({ type: 'missing_intent_sidebar', label: item.label, intent: val });
            }
          }
        }
        console.log('');

        // 3. Learning issues
        const learnings = await readAppMemory(opts.app, 'learnings.json');
        if (learnings?.actions) {
          console.log('🩺 Learning Issues:');
          let count = 0;
          for (const [name, stats] of Object.entries(learnings.actions)) {
            if (stats.confidence < 0.5) {
              console.log('   🔴 ' + name + ': ' + Math.round(stats.confidence * 100) + '% confidence');
              issues.push({ type: 'low_confidence', action: name });
              count++;
            }
            for (const e of (stats.common_errors || [])) {
              console.log('   ⚠️  ' + name + ': ' + (e.error || '').substring(0, 80));
              issues.push({ type: 'error_pattern', action: name });
              count++;
            }
          }
          if (count === 0) console.log('   ✅ All actions healthy');
        }

        console.log('\n═══ ' + issues.length + ' issues found ═══');
        if (issues.length > 0) console.log('Run: zea agent improve --app ' + opts.app + ' --auto');
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  agentCmd.command('improve')
    .description('Auto-fix issues found by scan. Tracks progress via REML.')
    .requiredOption('--app <id>', 'ZEA App ID')
    .option('--auto', 'Auto-approve all fixes')
    .option('--stitch-key <key>', 'Stitch API key')
    .action(async (opts) => {
      try {
        const client = await getClient();
        let fixed = 0, failed = 0;

        console.log('═══ Auto-Improve: ' + opts.app + ' ═══\n');

        const mem = await readAppMemory(opts.app, 'stitch.json');
        const apiKey = opts.stitchKey || process.env.STITCH_KEY;
        if (mem?.project_id && apiKey) {
          const stitchScreens = await fetchStitchScreens(apiKey, mem.project_id);
          const imported = mem.screen_mappings || {};
          const missing = stitchScreens.filter(s =>
            !Object.values(imported).some(i => i.stitch_id === s.id)
          );

          for (const s of missing) {
            const stateName = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 30);
            const intentName = 'view_' + stateName;
            console.log('📋 ' + s.title + ' → ' + stateName);

            const r1 = await fetch('https://stitch.googleapis.com/mcp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'get_screen', arguments: { projectId: mem.project_id, screenId: s.id } }, id: 2 })
            });
            const d1 = await r1.json();
            const match = JSON.stringify(d1).match(/"downloadUrl":"(https:\/\/contribution[^"]+)"/);
            if (!match) { console.log('   ❌ No HTML URL'); failed++; continue; }

            const r2 = await fetch(match[1]);
            const html = await r2.text();
            const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
            const contentHtml = mainMatch ? mainMatch[1].trim() : html;

            const mResp = await fetch(client.appsUrl + '/api/apps/' + opts.app + '/manifest', { headers: client.headers });
            if (!mResp.ok) { failed++; continue; }
            const manifest = await mResp.json();
            manifest.states = manifest.states || {};
            manifest.states[stateName] = { type: 'StitchedScreen', html: contentHtml };
            manifest.intent_routing = manifest.intent_routing || {};
            manifest.intent_routing[intentName] = { type: 'state_transition', target_state: stateName };

            const payload = {
              app_id: opts.app, name: manifest.name || 'App',
              domain_auth: manifest.domain_auth || 'venture',
              status: 'active', version: '1.0.0',
              manifest, states: manifest.states,
              intent_routing: manifest.intent_routing,
              shell: manifest.shell || {}, design_system: manifest.design_system || {}
            };

            await withLearning(opts.app, 'agent.improve.import-screen', async () => {
              const uResp = await fetch(client.appsUrl + '/api/apps', {
                method: 'POST', headers: client.headers, body: JSON.stringify(payload)
              });
              if (uResp.ok) {
                console.log('   ✅ ' + stateName + ': ' + contentHtml.length + ' bytes');
                fixed++;
                mem.screen_mappings = mem.screen_mappings || {};
                mem.screen_mappings[stateName] = { stitch_id: s.id, state: stateName, intent: intentName, html_bytes: contentHtml.length, imported_at: new Date().toISOString() };
                const memDir = path.join(MEMORY_DIR, 'apps', opts.app);
                await fs.mkdir(memDir, { recursive: true });
                await fs.writeFile(path.join(memDir, 'stitch.json'), JSON.stringify(mem, null, 2));
              } else {
                console.log('   ❌ Failed: ' + uResp.status);
                failed++;
              }
            }, { screen_id: s.id, state: stateName });
          }
        }

        console.log('\n═══ ' + fixed + ' fixed, ' + failed + ' failed ═══');
        if (fixed > 0) console.log("Run 'zea learn analyze --app " + opts.app + "' to update learnings.");
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
