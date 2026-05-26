import { getClient } from '../client.js';

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
}
