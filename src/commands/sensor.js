import { getClient } from '../client.js';

export function register(program) {
  const sensorCmd = program.command('sensor').description('Sensor data capture and processing');

  sensorCmd.command('transcribe')
    .description('Transcribe audio files to text using MLX Whisper (Apple Silicon)')
    .argument('<files...>', 'Audio files or directories to transcribe')
    .option('-m, --model <model>', 'Whisper model (tiny, small, medium, large-v3-turbo)', 'large-v3-turbo')
    .option('-l, --language <lang>', 'Language code (es, en, auto)', 'es')
    .option('-o, --output-dir <dir>', 'Output directory for transcriptions', '.')
    .option('-f, --formats <formats>', 'Output formats: txt,json,srt,vtt,tsv,all', 'txt,json')
    .option('-q, --quiet', 'Quiet mode: only print transcribed text')
    .action(async (files, options) => {
      const scriptPath = '/Users/dev/Documents/zea/sensor/priv/python/transcribir';
      const { spawnSync } = await import('child_process');
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
      process.exit(result.status);
    });

  sensorCmd.command('events')
    .description('List sensor events from the Sensor service')
    .option('--source <source>', 'Filter by source type (audio, whatsapp, image)')
    .option('--status <status>', 'Filter by status (ingested, processing, completed, failed)')
    .option('--limit <limit>', 'Max results', '50')
    .action(async (options) => {
      try {
        const client = await getClient();
        const params = new URLSearchParams();
        if (options.source) params.set('source', options.source);
        if (options.status) params.set('status', options.status);
        if (options.limit) params.set('limit', options.limit);
        const response = await fetch(`${client.sensorUrl}/api/sensor/events?${params}`, { headers: client.headers });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  sensorCmd.command('status')
    .description('Get event status and result')
    .argument('<id>', 'Event ID')
    .action(async (id) => {
      try {
        const client = await getClient();
        const response = await fetch(`${client.sensorUrl}/api/sensor/events/${id}`, { headers: client.headers });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json();
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.error('Error:', e.message);
      }
    });

  sensorCmd.command('analyze')
    .description('Analizar un evento con Glia (DeepSeek): clasifica + Value Proposition Canvas')
    .argument('<event_id>', 'Sensor event ID to analyze')
    .action(async (eventId) => {
      try {
        const client = await getClient();
        const response = await fetch(`${client.sensorUrl}/api/sensor/analyze/${eventId}`, {
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
      } catch (e) {
        console.error('Error:', e.message);
      }
    });
}
