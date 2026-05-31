import zeaFetch from '../lib/http.js';
import { getClient } from '../client.js';
import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEYS || '';
const VISUAL_HOST = process.env.VISUAL_HOST || 'http://localhost:4090';

async function askAI(prompt, context) {
  const resp = await zeaFetch(DEEPSEEK_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Sos un validador visual experto de pantallas Stitch vs SDUI en ZEA Platform. Respondé en español, directo. Devolvé solo el JSON requerido.' },
        { role: 'user', content: `${prompt}\n\n${context}` }
      ],
      temperature: 0.3, max_tokens: 2000, response_format: { type: 'json_object' }
    })
  });
  const data = await resp.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

function analyzeStructure(html) {
  return {
    headings: (html.match(/<h[1-6][^>]*>/gi) || []).length,
    tables: (html.match(/<table/gi) || []).length,
    buttons: (html.match(/<button/gi) || []).length,
    inputs: (html.match(/<input/gi) || []).length,
    kpi_metric: (html.match(/metric|kpi|KPI|AUM/gi) || []).length,
    bindings: (html.match(/data-zea-bind/gi) || []).length,
    size: html.length
  };
}

function analyzeStyles(html) {
  const classes = html.match(/class="([^"]+)"/g) || [];
  const allClasses = classes.flatMap(c => c.replace(/class="/, '').replace(/"$/, '').split(/\s+/));
  const tailwind = allClasses.filter(c => c.startsWith('bg-') || c.startsWith('text-') || c.startsWith('font-') || c.startsWith('grid-') || c.startsWith('flex') || c.startsWith('p-') || c.startsWith('m-') || c.startsWith('rounded'));
  return {
    total_classes: allClasses.length,
    tailwind_classes: tailwind.length,
    unique_colors: [...new Set(allClasses.filter(c => c.startsWith('bg-') || c.startsWith('text-')))],
    has_grid: allClasses.some(c => c.startsWith('grid-')),
    has_flex: allClasses.some(c => c.includes('flex'))
  };
}

export function register(program) {
  const validateCmd = program.command('validate')
    .description('Visual and structural validation of screens against Stitch originals')
    .requiredOption('--app <id>', 'App ID')
    .requiredOption('--screen <name>', 'Screen state name')
    .option('--visual', 'Include layout and style analysis')
    .option('--browser', 'Use browser (playwright-cli) for screenshot diff')
    .option('--llm', 'Use LLM for semantic visual comparison')
    .option('--json', 'Output as JSON');

  validateCmd.action(async (opts) => {
    const results = { screen: opts.screen, app: opts.app, checks: {} };

    try {
      // 1. Get SDUI HTML
      const client = await getClient();
      const resp = await zeaFetch(`${client.appsUrl}/api/apps/${opts.app}/manifest`, { headers: client.headers });
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const manifest = await resp.json();
      const state = (manifest.states || {})[opts.screen];
      if (!state) throw new Error(`State '${opts.screen}' not found`);

      const sduiHtml = state.html || '';

      // 2. Get Stitch reference HTML (re-fetch from Stitch API)
      const stitchJsonPath = path.join(os.homedir(), '.zea', 'memory', 'apps', opts.app, 'stitch.json');
      let stitchHtml = '';
      try {
        const stitchData = JSON.parse(await fs.readFile(stitchJsonPath, 'utf8'));
        const mapping = stitchData.screen_mappings?.[opts.screen];
        if (mapping?.stitch_id && process.env.STITCH_KEY) {
          const stitchResp = await zeaFetch('https://stitch.googleapis.com/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.STITCH_KEY },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'get_screen', arguments: { projectId: stitchData.project_id, screenId: mapping.stitch_id } }, id: 1 })
          });
          const stitchData2 = await stitchResp.json();
          const match = JSON.stringify(stitchData2).match(/"downloadUrl":"(https:\/\/contribution[^"]+)"/);
          if (match) {
            const htmlResp = await zeaFetch(match[1]);
            stitchHtml = await htmlResp.text();
            const mainMatch = stitchHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/);
            if (mainMatch) stitchHtml = mainMatch[1].trim();
          }
        }
      } catch { /* no Stitch ref available */ }

      // ── Structural ──────────────────────────────────────
      const sduiStruct = analyzeStructure(sduiHtml);
      const stitchStruct = stitchHtml ? analyzeStructure(stitchHtml) : null;

      results.checks.structural = {
        sdui: sduiStruct,
        stitch: stitchStruct,
        score: stitchStruct ? Math.round(
          (1 - Math.abs(sduiStruct.headings - stitchStruct.headings) / Math.max(stitchStruct.headings, 1)) * 30 +
          (1 - Math.abs(sduiStruct.tables - stitchStruct.tables) / Math.max(stitchStruct.tables, 1)) * 30 +
          (1 - Math.abs(sduiStruct.buttons - stitchStruct.buttons) / Math.max(stitchStruct.buttons, 1)) * 20 +
          (1 - Math.abs(sduiStruct.bindings - stitchStruct.bindings) / Math.max(sduiStruct.bindings || 1, 1)) * 20
        ) : 100
      };

      if (!opts.json) {
        console.log(chalk.bold(`\n═══ Validate: ${opts.screen} ═══`));
        console.log(chalk.cyan('\nStructural:'));
        console.log(`  Headings: ${sduiStruct.headings} | Tables: ${sduiStruct.tables} | Buttons: ${sduiStruct.buttons} | Bindings: ${sduiStruct.bindings}`);
        if (stitchStruct) {
          console.log(`  Stitch ref: Headings: ${stitchStruct.headings} | Tables: ${stitchStruct.tables} | Buttons: ${stitchStruct.buttons}`);
        }
        console.log(`  Score: ${results.checks.structural.score}/100`);
      }

      // ── Visual (layout + styles) ────────────────────────
      if (opts.visual) {
        const sduiStyles = analyzeStyles(sduiHtml);
        const stitchStyles = stitchHtml ? analyzeStyles(stitchHtml) : null;

        const styleMatch = stitchStyles
          ? sduiStyles.unique_colors.filter(c => stitchStyles.unique_colors.includes(c)).length / Math.max(stitchStyles.unique_colors.length, 1) * 100
          : 100;

        results.checks.visual = {
          sdui_styles: sduiStyles,
          stitch_styles: stitchStyles,
          style_match: Math.round(styleMatch),
          layout_preserved: stitchStyles
            ? sduiStyles.has_grid === stitchStyles.has_grid && sduiStyles.has_flex === stitchStyles.has_flex
            : true
        };

        if (!opts.json) {
          console.log(chalk.cyan('\nVisual (Layout + Styles):'));
          console.log(`  Tailwind classes: ${sduiStyles.tailwind_classes} | Grid: ${sduiStyles.has_grid ? '✅' : '❌'} | Flex: ${sduiStyles.has_flex ? '✅' : '❌'}`);
          console.log(`  Colors: ${sduiStyles.unique_colors.join(', ')}`);
          if (stitchStyles) console.log(`  Style match: ${results.checks.visual.style_match}%`);
        }
      }

      // ── Browser (screenshot via playwright-cli) ──────────
      if (opts.browser) {
        const sduiUrl = `http://sudlich.zea.localhost/app?app_id=${opts.app}`;
        try {
          const openResp = await zeaFetch(`${VISUAL_HOST}/open`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: sduiUrl })
          });
          const openData = await openResp.json();

          if (openData.ok) {
            const shotResp = await zeaFetch(`${VISUAL_HOST}/screenshot`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: openData.session_id, filename: `validate-${opts.screen}-${Date.now()}.png` })
            });
            const shotData = await shotResp.json();

            results.checks.browser = {
              url_opened: sduiUrl,
              session_id: openData.session_id,
              screenshot: shotData.file,
              screenshot_size: shotData.size
            };

            if (!opts.json) {
              console.log(chalk.cyan('\nBrowser:'));
              console.log(`  Opened: ${sduiUrl}`);
              console.log(`  Screenshot: ${shotData.file} (${shotData.size} bytes) ✅`);
            }

            // Close browser session
            await zeaFetch(`${VISUAL_HOST}/close`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: openData.session_id })
            });
          }
        } catch (e) {
          results.checks.browser = { error: e.message };
          if (!opts.json) console.log(chalk.red(`\nBrowser: ${e.message}`));
        }
      }

      // ── LLM semantic comparison ────────────────────────
      if (opts.llm && stitchHtml) {
        const prompt = `Compará semánticamente estas dos pantallas (Stitch original vs SDUI con data-zea-bind).

Stitch original: ${stitchHtml.slice(0, 3000)}
SDUI modificada: ${sduiHtml.slice(0, 3000)}

Devolvé este JSON:
{
  "are_equivalent": true/false,
  "visual_score": 0-100,
  "differences": ["diferencia 1", ...],
  "assessment": "evaluación en español"
}`;

        const semantic = await askAI(prompt, '');
        results.checks.semantic = semantic;

        if (!opts.json) {
          console.log(chalk.cyan('\nSemantic (LLM):'));
          console.log(`  Equivalent: ${semantic.are_equivalent ? '✅' : '❌'}`);
          console.log(`  Visual score: ${semantic.visual_score}/100`);
          console.log(`  Assessment: ${semantic.assessment}`);
          if (semantic.differences?.length) {
            console.log(`  Differences:`);
            semantic.differences.forEach(d => console.log(`    • ${d}`));
          }
        }
      }

      // ── Final score ─────────────────────────────────────
      const scores = [
        results.checks.structural?.score || 100,
        results.checks.visual?.style_match || 100,
        results.checks.semantic?.visual_score || 100
      ].filter(s => s > 0);

      results.overall_score = Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1));

      if (!opts.json) {
        console.log(chalk.bold(`\nOverall: ${results.overall_score}/100 ${results.overall_score >= 85 ? '✅' : results.overall_score >= 70 ? '⚠️' : '❌'}\n`));
      } else {
        console.log(JSON.stringify(results, null, 2));
      }

    } catch (e) {
      console.error('Error:', e.message);
    }
  });
}
