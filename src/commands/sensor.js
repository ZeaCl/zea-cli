import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import { withLearning } from '../utils/learning.js';

export function register(program) {
  const sensorCmd = program.command('sensor').description('Sensor data capture and processing');

  // ─── Transcribe ───────────────────────────────────────
  sensorCmd.command('transcribe')
    .description('Transcribe audio files to text using MLX Whisper (Apple Silicon)')
    .argument('<files...>', 'Audio files or directories to transcribe')
    .option('--app <id>', 'App ID for REML tracking')
    .option('-m, --model <model>', 'Whisper model', 'large-v3-turbo')
    .option('-l, --language <lang>', 'Language code', 'es')
    .option('-o, --output-dir <dir>', 'Output directory', '.')
    .option('-f, --formats <formats>', 'Output formats: txt,json,srt,vtt,tsv,all', 'txt,json')
    .option('-q, --quiet', 'Quiet mode')
    .action(async (files, options) => {
      const scriptPath = '/Users/dev/Documents/zea/sensor/priv/python/transcribir';
      const { spawnSync } = await import('child_process');
      await withLearning(options.app || 'sensor', 'sensor.transcribe', async () => {
        const args = files.concat([
          '--model', options.model,
          '--language', options.language,
          '--output-dir', options.outputDir,
          '--formats', options.formats,
          ...(options.quiet ? ['--quiet'] : [])
        ]);
        const result = spawnSync(scriptPath, args, {
          stdio: 'inherit',
          timeout: 300000
        });
        if (result.status !== 0) throw new Error(`Transcription failed: exit ${result.status}`);
      }, { files: files.length, model: options.model });
    });

  // ─── Events ───────────────────────────────────────────
  sensorCmd.command('events')
    .description('List sensor events from the Sensor service')
    .option('--app <id>', 'App ID for REML tracking')
    .option('--source <source>', 'Filter by source type')
    .option('--status <status>', 'Filter by status')
    .option('--limit <limit>', 'Max results', '50')
    .action(async (options) => {
      await withLearning(options.app || 'sensor', 'sensor.list-events', async () => {
        const client = await getClient();
        const params = new URLSearchParams();
        if (options.source) params.set('source', options.source);
        if (options.status) params.set('status', options.status);
        if (options.limit) params.set('limit', options.limit);
        const response = await zeaFetch(`${client.sensorUrl}/api/sensor/events?${params}`, { headers: client.headers });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();
        console.log(JSON.stringify(result, null, 2));
      }, { source: options.source, status: options.status });
    });

  // ─── Status ───────────────────────────────────────────
  sensorCmd.command('status')
    .description('Get event status and result')
    .option('--app <id>', 'App ID for REML tracking')
    .argument('<id>', 'Event ID')
    .action(async (id, options) => {
      await withLearning(options.app || 'sensor', 'sensor.get-status', async () => {
        const client = await getClient();
        const response = await zeaFetch(`${client.sensorUrl}/api/sensor/events/${id}`, { headers: client.headers });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();
        console.log(JSON.stringify(result, null, 2));
      }, { event_id: id });
    });

  // ─── Analyze ──────────────────────────────────────────
  sensorCmd.command('analyze')
    .description('Analyze event with Glia: classify + Value Proposition Canvas')
    .option('--app <id>', 'App ID for REML tracking')
    .argument('<event_id>', 'Sensor event ID')
    .action(async (eventId, options) => {
      await withLearning(options.app || 'sensor', 'sensor.analyze', async () => {
        const client = await getClient();
        const response = await zeaFetch(`${client.sensorUrl}/api/sensor/analyze/${eventId}`, {
          method: 'POST',
          headers: { ...client.headers, 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();
        console.log(`Classification: ${result.classification}`);
        console.log(`Analysis type: ${result.data?.analysis_type}`);
        if (result.innovation && result.innovation !== 'N/A') {
          console.log(`\n=== Value Proposition Canvas ===\n${result.innovation}`);
        }
      }, { event_id: eventId });
    });

  // ─── Listen (auto-process incoming events) ────────────
  sensorCmd.command('listen')
    .description('Listen for new sensor events and auto-process them')
    .requiredOption('--app <id>', 'App ID')
    .option('--source <source>', 'Filter by source')
    .option('--auto-process', 'Auto-analyze events with status=ingested')
    .action(async (opts) => {
      await withLearning(opts.app, 'sensor.listen', async () => {
        const client = await getClient();
        let processed = 0;

        console.log(`═══ Sensor Listen: ${opts.app} ═══\n`);

        // Get unprocessed events
        const params = new URLSearchParams({ status: 'ingested', limit: '20' });
        if (opts.source) params.set('source', opts.source);
        const r = await zeaFetch(`${client.sensorUrl}/api/sensor/events?${params}`, { headers: client.headers });
        if (!r.ok) throw new Error(`HTTP error ${r.status}`);
        const data = await r.json();
        const events = data.data || data.events || [];

        console.log(`Found: ${events.length} pending events`);
        console.log('');

        if (events.length === 0) {
          console.log('✅ No pending events.');
          return;
        }

        for (const event of events) {
          const status = event.status || 'unknown';
          const source = event.source || 'unknown';
          const id = event.id?.substring(0, 15) || '?';

          if (opts.autoProcess && status === 'ingested') {
            console.log(`🔄 Processing: ${id}... (${source})`);

            try {
              const ar = await zeaFetch(`${client.sensorUrl}/api/sensor/analyze/${event.id}`, {
                method: 'POST',
                headers: { ...client.headers, 'Content-Type': 'application/json' }
              });
              if (ar.ok) {
                const arData = await ar.json();
                const classification = arData.classification || 'unknown';
                console.log(`   ✅ ${id}: ${source} → ${classification}`);
                processed++;
              } else {
                console.log(`   ❌ ${id}: analyze failed (${ar.status})`);
              }
            } catch (e) {
              console.log(`   ❌ ${id}: ${e.message}`);
            }
          } else {
            console.log(`   📡 ${id}: ${source} [${status}]`);
          }
        }

        console.log(`\n═══ Processed: ${processed}/${events.length} ═══`);
      }, { source: opts.source, auto: opts.autoProcess });
    });

  // ─── Report (analyze + notify) ────────────────────────
  sensorCmd.command('report')
    .description('Analyze event and send report back to user (WhatsApp)')
    .requiredOption('--app <id>', 'App ID')
    .argument('<event_id>', 'Sensor event ID to analyze and report')
    .action(async (eventId, opts) => {
      await withLearning(opts.app, 'sensor.report', async () => {
        const client = await getClient();

        console.log(`═══ Sensor Report: ${opts.app} ═══\n`);
        console.log(`Event: ${eventId}`);

        // 1. Analyze
        console.log(`1/2 Analyzing...`);
        let analysis;
        try {
          const ar = await zeaFetch(`${client.sensorUrl}/api/sensor/analyze/${eventId}`, {
            method: 'POST',
            headers: { ...client.headers, 'Content-Type': 'application/json' }
          });
          if (!ar.ok) throw new Error(`Analyze failed: ${ar.status}`);
          analysis = await ar.json();
          console.log(`   Classification: ${analysis.classification}`);
          console.log(`   Type: ${analysis.data?.analysis_type || 'unknown'}`);
        } catch (e) {
          console.log(`   ❌ ${e.message}`);
          return;
        }

        // 2. Handle based on classification
        console.log(`\n2/2 Action...`);
        const classification = analysis.classification || 'unknown';

        switch (classification) {
          case 'bug_report':
            console.log('   🔧 Bug report — running agent scan...');
            console.log('   Run: zea agent scan --app ' + opts.app);
            break;
          case 'product_requirement':
            console.log('   💡 Product idea — saved to innovation canvas');
            if (analysis.innovation) {
              console.log('\n=== Innovation Canvas ===');
              console.log(analysis.innovation.substring(0, 500));
            }
            break;
          case 'question':
            console.log('   ❓ Question — ready to answer');
            break;
          case 'urgent':
            console.log('   🚨 Urgent — escalate immediately');
            break;
          default:
            console.log(`   📋 Classified as: ${classification}`);
        }

        console.log(`\n═══ Report complete ═══`);
        console.log('Suggestion: share this report via WhatsApp using Kapso API');
      }, { event_id: eventId });
    });
}
