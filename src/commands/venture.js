import { getClient } from '../client.js';

export function register(program) {
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
}
