import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';

export function register(program) {
  const workflow = program.command('workflow').description('Workflow management commands (Cerebelum)');

  workflow.command('list')
    .description('List available workflows')
    .action(async () => {
      try {
        const client = await getClient();
        const response = await zeaFetch(`${client.cerebelumUrl}/api/v1/workflows`, { headers: client.headers });
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

        const response = await zeaFetch(`${client.cerebelumUrl}/api/v1/executions`, {
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
        const response = await zeaFetch(`${client.cerebelumUrl}/api/v1/executions/${executionId}`, { headers: client.headers });
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
        const response = await zeaFetch(`${client.cerebelumUrl}/api/v1/executions/${executionId}/stop`, {
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
        const response = await zeaFetch(`${client.cerebelumUrl}/api/v1/executions/${executionId}/resume`, {
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
}
