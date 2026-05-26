import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const SKILL_PATH = path.join(os.homedir(), '.zea', 'skills', 'innovation', 'SKILL.md');

export function register(program) {
  const innovationCmd = program.command('innovation')
    .description('Customer discovery & innovation methodology (Strategyzer/Osterwalder)');

  innovationCmd.command('start')
    .description('Start full customer discovery flow (Phase 1→6)')
    .option('--sector <sector>', 'Target sector or industry')
    .action(async (opts) => {
      try {
        const skill = await fs.readFile(SKILL_PATH, 'utf8');
        console.log('═══ Innovation Flow — Customer Discovery ═══');
        console.log('');
        console.log(skill);
        console.log('');
        console.log('═══ Starting Phase 1: Define Customer Segment ═══');
        console.log('');

        if (opts.sector) {
          console.log(`Sector: ${opts.sector}`);
          console.log('');
          console.log('Phase 1 — Questions to explore:');
          console.log(`  1. Who in the "${opts.sector}" sector experiences the biggest pain?`);
          console.log('  2. What role/position do they hold?');
          console.log('  3. What specific process or area should we investigate?');
          console.log('');
          console.log('Output: 2-3 line customer segment profile.');
        } else {
          console.log('Provide a sector with --sector to begin.');
        }
      } catch (e) {
        console.error('Innovation skill not found. Run: zea skill reload');
      }
    });

  innovationCmd.command('discover')
    .description('Phase 1: Define customer segment')
    .requiredOption('--sector <sector>', 'Target industry/sector')
    .option('--role <role>', 'Target customer role (e.g. CTO, Operations Manager)')
    .action(async (opts) => {
      console.log('═══ Phase 1: Define Customer Segment ═══');
      console.log('');
      console.log(`Sector: ${opts.sector}`);
      if (opts.role) console.log(`Role: ${opts.role}`);
      console.log('');
      console.log('Questions to answer:');
      console.log('  1. What specific job/role are we targeting?');
      console.log('  2. What is their operational context?');
      console.log('  3. What industry dynamics affect them?');
      console.log('');
      console.log('Output format:');
      console.log('  [Role] en [Industry] que realiza [process] y enfrenta [context]');
      console.log('');
      console.log('Example: "Jefe de Obra en construcción de edificios');
      console.log('residenciales que coordina subcontratistas desde planos');
      console.log('en papel y enfrenta sobrecostos por inconsistencias."');
    });

  innovationCmd.command('analyze')
    .description('Phase 2: Analyze research document → Customer Profile')
    .requiredOption('--file <path>', 'Path to research document or notes')
    .action(async (opts) => {
      console.log('═══ Phase 2: Customer Profile from Document ═══');
      console.log(`Document: ${opts.file}`);
      console.log('');
      console.log('Extract and structure:');
      console.log('');
      console.log('A. CUSTOMER JOBS (what are they trying to accomplish?)');
      console.log('   - Functional tasks (concrete actions)');
      console.log('   - Social jobs (how they want to be perceived)');
      console.log('   - Emotional jobs (how they want to feel)');
      console.log('');
      console.log('B. PAINS (what frustrates, costs, or risks them?)');
      console.log('   - Undesired outcomes (errors, rework)');
      console.log('   - Obstacles (slow processes, missing info)');
      console.log('   - Risks (fines, accidents, lost contracts)');
      console.log('');
      console.log('C. GAINS (what would delight them?)');
      console.log('   - Required gains (basic expectations)');
      console.log('   - Expected gains (what they hope for)');
      console.log('   - Desired gains (what would surprise them)');
    });

  innovationCmd.command('simulate')
    .description('Phase 3: Simulate customer interview')
    .requiredOption('--role <role>', 'Role to simulate (e.g. CTO, Project Manager)')
    .option('--sector <sector>', 'Industry context')
    .action(async (opts) => {
      console.log(`═══ Phase 3: Simulate Interview with ${opts.role} ═══`);
      if (opts.sector) console.log(`Sector: ${opts.sector}`);
      console.log('');
      console.log('Interview Guide:');
      console.log('');
      console.log('OPENING (2 min)');
      console.log(`  "Thanks for meeting. We are researching ${opts.sector || 'your industry'} to understand challenges in [process]. We would love to learn from your experience."`);
      console.log('');
      console.log('DISCOVERY QUESTIONS');
      console.log('  1. "Walk me through how you currently handle [process]."');
      console.log('  2. "What is the most frustrating part?"');
      console.log('  3. "When was the last time something went wrong? What happened?"');
      console.log('  4. "How do you currently solve this? What tools?"');
      console.log('  5. "What would the ideal solution look like?"');
      console.log('');
      console.log('QUANTIFICATION');
      console.log('  "How much time/money does [pain] cost you per week/month?"');
      console.log('  "How many people are affected?"');
      console.log('');
      console.log('CLOSING');
      console.log('  "Who else should I talk to about this?"');
      console.log('  "Would you be open to testing a solution?"');
    });

  innovationCmd.command('propose')
    .description('Phase 4: Generate value proposition')
    .option('--pains <json>', 'Pains array as JSON')
    .option('--gains <json>', 'Gains array as JSON')
    .option('--jobs <json>', 'Customer jobs array as JSON')
    .action(async (opts) => {
      console.log('═══ Phase 4: Value Proposition Design ═══');
      console.log('');
      console.log('VALUE PROPOSITION CANVAS');
      console.log('');
      console.log('Products & Services:');
      console.log('  └─ What we offer to address customer jobs');
      console.log('');
      console.log('Pain Relievers:');
      console.log('  └─ How our solution eliminates/reduces customer pains');
      console.log('');
      console.log('Gain Creators:');
      console.log('  └─ How our solution creates customer gains');
      console.log('');
      console.log('FIT CHECK:');
      console.log('  └─ Does each pain reliever address a real pain?');
      console.log('  └─ Does each gain creator match a real gain?');
      console.log('  └─ Are we solving jobs that customers actually care about?');
      console.log('');
      if (opts.pains) {
        console.log('Pains provided:', opts.pains);
      }
    });

  innovationCmd.command('opening')
    .description('Phase 5: Prepare interview opening script')
    .requiredOption('--name <name>', 'Interviewee name')
    .option('--company <company>', 'Company name')
    .option('--role <role>', 'Their role')
    .action(async (opts) => {
      const company = opts.company || '[Company]';
      const role = opts.role || '[Role]';
      console.log('═══ Phase 5: Interview Opening Script ═══');
      console.log('');
      console.log(`INTERVIEWEE: ${opts.name}, ${role} at ${company}`);
      console.log('');
      console.log('OPENING SCRIPT:');
      console.log('');
      console.log(`  Hi ${opts.name},`);
      console.log('');
      console.log(`  Thanks for taking the time. We are researching how ${role}s`);
      console.log(`  at companies like ${company} handle [process/area].`);
      console.log('');
      console.log('  There are no right or wrong answers — we just want to learn');
      console.log('  from your real experience. Everything you share is confidential.');
      console.log('');
      console.log('  Would it be ok if I take notes during our conversation?');
      console.log('');
      console.log('PREPARATION CHECKLIST:');
      console.log('  □ Research the company (LinkedIn, website, news)');
      console.log('  □ Prepare specific questions about their context');
      console.log('  □ Have note-taking method ready');
      console.log('  □ Schedule 30-45 min (respect their time)');
    });

  innovationCmd.command('register')
    .description('Phase 6: Register interview insights')
    .requiredOption('--company <name>', 'Company name')
    .requiredOption('--contact <name>', 'Contact name')
    .option('--role <role>', 'Contact role')
    .option('--pains <json>', 'Key pains discovered (JSON)')
    .option('--gains <json>', 'Key gains discovered (JSON)')
    .option('--notes <text>', 'Interview notes')
    .action(async (opts) => {
      console.log('═══ Phase 6: Register Interview ═══');
      console.log('');
      console.log(`Company: ${opts.company}`);
      console.log(`Contact: ${opts.contact}`);
      if (opts.role) console.log(`Role: ${opts.role}`);
      console.log('');
      console.log('INTERVIEW SUMMARY');
      console.log('');
      console.log('Key Findings:');
      console.log('  1. Main pain identified:');
      console.log('  2. Current workaround:');
      console.log('  3. Willingness to pay:');
      console.log('  4. Decision maker?');
      console.log('');
      console.log('NEXT STEPS:');
      console.log('  □ Send thank-you note');
      console.log('  □ Update CRM/project board');
      console.log('  □ Schedule follow-up if promising');
      console.log('  □ Identify patterns across interviews');
      console.log('');
      console.log('Memory: save to ~/.zea/memory/innovation/');
    });
}
