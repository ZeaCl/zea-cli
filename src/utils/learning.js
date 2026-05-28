import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const MEMORY_DIR = path.join(os.homedir(), '.zea', 'memory');

async function appDir(appId) {
  const dir = path.join(MEMORY_DIR, 'apps', appId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function readJSON(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * Wraps a function with automatic action logging for reinforcement learning.
 * Logs success/failure, timing, parameters, and error context.
 *
 * Usage:
 *   const result = await withLearning('sudlich', 'design.update-design',
 *     async () => { ... },
 *     { token: opts.token }
 *   );
 */
export async function withLearning(app, action, fn, params = {}) {
  if (!app) return fn();

  const t0 = Date.now();
  try {
    const result = await fn();
    await logAction(app, action, 'success', {
      ms: Date.now() - t0,
      params: sanitizeParams(params)
    });
    return result;
  } catch (e) {
    await logAction(app, action, 'failure', {
      ms: Date.now() - t0,
      params: sanitizeParams(params),
      error: e.message?.substring(0, 500)
    });
    // Adaptive: if 3+ consecutive failures, suggest doctor
    const recent = await getRecentFailures(app, action, 3);
    if (recent >= 3) {
      console.warn(`⚠️  ${action} failed ${recent} times in a row. Consider: zea doctor check`);
    }
    throw e;
  }
}

/**
 * Log a single action to history.json
 */
export async function logAction(app, action, result, meta = {}) {
  const dir = await appDir(app);
  const historyPath = path.join(dir, 'history.json');
  const history = await readJSON(historyPath) || [];

  const entry = {
    ts: new Date().toISOString(),
    action,
    result,
    ...meta
  };

  history.push(entry);
  // Keep last 500 entries
  const trimmed = history.slice(-500);
  await writeJSON(historyPath, trimmed);

  // Auto-regenerate learnings after every 10 actions
  if (trimmed.length % 10 === 0) {
    await regenerateLearnings(app);
  }
}

/**
 * Get number of recent consecutive failures for an action
 */
async function getRecentFailures(app, action, count) {
  const dir = await appDir(app);
  const historyPath = path.join(dir, 'history.json');
  const history = await readJSON(historyPath) || [];

  let failures = 0;
  for (let i = history.length - 1; i >= 0 && failures < count; i--) {
    if (history[i].action === action && history[i].result === 'failure') {
      failures++;
    } else if (history[i].action === action) {
      break;
    }
  }
  return failures;
}

/**
 * Regenerate learnings.json from history.json
 */
export async function regenerateLearnings(app) {
  const dir = await appDir(app);
  const historyPath = path.join(dir, 'history.json');
  const history = await readJSON(historyPath) || [];

  // Group by action
  const byAction = {};
  for (const entry of history) {
    if (!byAction[entry.action]) byAction[entry.action] = { success: 0, failure: 0, errors: [], times: [] };
    const stats = byAction[entry.action];
    stats[entry.result === 'success' ? 'success' : 'failure'] += 1;
    if (entry.error) stats.errors.push(entry.error);
    if (entry.ms) stats.times.push(entry.ms);
  }

  const actions = {};
  for (const [name, stats] of Object.entries(byAction)) {
    const total = stats.success + stats.failure;
    const successRate = total > 0 ? stats.success / total : 0;
    const avgTime = stats.times.length > 0
      ? Math.round(stats.times.reduce((a, b) => a + b, 0) / stats.times.length)
      : 0;

    // Detect common errors
    const errorCounts = {};
    for (const e of stats.errors) {
      const key = e.substring(0, 80);
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
    const commonErrors = Object.entries(errorCounts)
      .filter(([, c]) => c >= 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([e, c]) => ({ error: e, count: c }));

    // Confidence score: blend of success rate + recency
    const recentEntries = history.filter(e => e.action === name).slice(-5);
    const recentSuccess = recentEntries.filter(e => e.result === 'success').length;
    const recentRate = recentEntries.length > 0 ? recentSuccess / recentEntries.length : 0;
    const confidence = Math.round(((successRate * 0.6 + recentRate * 0.4) * 100)) / 100;

    // Detect regression (was failing, now fixed)
    const halfPoint = Math.floor(history.filter(e => e.action === name).length / 2);
    const firstHalf = history.filter(e => e.action === name).slice(0, halfPoint);
    const secondHalf = history.filter(e => e.action === name).slice(halfPoint);
    const firstRate = firstHalf.length > 0
      ? firstHalf.filter(e => e.result === 'success').length / firstHalf.length : 0;
    const secondRate = secondHalf.length > 0
      ? secondHalf.filter(e => e.result === 'success').length / secondHalf.length : 0;
    const regression = secondRate > firstRate && firstRate < 0.5 ? {
      old_error: commonErrors[0]?.error || 'unknown',
      fix_applied: true,
      pre_fix_rate: Math.round(firstRate * 100),
      post_fix_rate: Math.round(secondRate * 100)
    } : null;

    const status =
      confidence >= 0.85 ? 'reliable' :
      confidence >= 0.5 ? 'improving' :
      'unstable';

    actions[name] = {
      success_rate: Math.round(successRate * 100) / 100,
      total_calls: total,
      avg_time_ms: avgTime,
      common_errors: commonErrors,
      confidence,
      status,
      ...(regression ? { regression } : {})
    };
  }

  // Detect sequences (consecutive actions that appear multiple times)
  const sequences = {};
  for (let len = 3; len <= 5; len++) {
    for (let i = 0; i < history.length - len; i++) {
      const slice = history.slice(i, i + len);
      const key = slice.map(e => e.action).join(' → ');
      const allSuccess = slice.every(e => e.result === 'success');
      if (!sequences[key]) sequences[key] = { count: 0, success: 0 };
      sequences[key].count++;
      if (allSuccess) sequences[key].success++;
    }
  }

  const topSequences = Object.entries(sequences)
    .filter(([, s]) => s.count >= 3)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([name, s]) => ({
      steps: name.split(' → '),
      success_rate: Math.round((s.success / s.count) * 100) / 100,
      count: s.count
    }));

  // Detect global rules
  const globalRules = [];
  for (const [name, stats] of Object.entries(actions)) {
    if (stats.confidence >= 0.9 && stats.total_calls >= 5) {
      globalRules.push({
        rule: `prefer_${name.replace(/\./g, '_')}`,
        confidence: stats.confidence,
        source: 'high_success_pattern'
      });
    }
    if (stats.common_errors.length > 0) {
      globalRules.push({
        rule: `avoid_${name}_errors`,
        confidence: 0.95,
        source: 'common_failures',
        errors: stats.common_errors.map(e => e.error)
      });
    }
    if (stats.regression) {
      globalRules.push({
        rule: `regression_fixed_in_${name}`,
        confidence: stats.confidence,
        source: 'regression_detected',
        improvement: `${stats.regression.pre_fix_rate}% → ${stats.regression.post_fix_rate}%`
      });
    }
  }

  const learnings = {
    generated_at: new Date().toISOString(),
    total_actions: history.length,
    actions,
    sequences: topSequences,
    global_rules: globalRules.slice(0, 20)
  };

  const learningsPath = path.join(dir, 'learnings.json');
  await writeJSON(learningsPath, learnings);

  return learnings;
}

/**
 * Build confidence scores per action
 */
async function buildConfidence(app) {
  const dir = await appDir(app);
  const learningsPath = path.join(dir, 'learnings.json');
  const learnings = await readJSON(learningsPath) || { actions: {} };

  const scores = {};
  for (const [name, stats] of Object.entries(learnings.actions || {})) {
    scores[name] = stats.confidence || 0.5;
  }

  const confidencePath = path.join(dir, 'confidence.json');
  await writeJSON(confidencePath, scores);
  return scores;
}

function sanitizeParams(params) {
  const clean = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === 'token' || k === 'api_key' || k === 'password') {
      clean[k] = '***';
    } else if (typeof v === 'string' && v.length > 200) {
      clean[k] = v.substring(0, 200) + '...';
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export { readJSON, writeJSON, buildConfidence, getRecentFailures };

// ── Error Pattern Recognition ────────────────────────────

/**
 * Suggests a fix for an error based on learned patterns.
 * Returns null if no pattern matches.
 */
export async function suggestFix(errorMessage) {
  const dir = path.join(MEMORY_DIR, 'maintenance');
  const patternsPath = path.join(dir, 'error_patterns.json');
  const patterns = await readJSON(patternsPath) || {};

  for (const [name, p] of Object.entries(patterns)) {
    if (new RegExp(p.matches).test(errorMessage)) {
      return {
        name,
        fix: p.fix,
        detect: p.detect,
        verify: p.verify,
        confidence: p.confidence || 0.5,
        auto_fix: p.auto_fix || false,
        times_seen: p.times_seen || 0
      };
    }
  }
  return null;
}

/**
 * Records the result of applying a fix.
 * Updates confidence and auto_fix flag.
 */
export async function recordFixResult(patternName, success, errorMessage, fixApplied) {
  const dir = path.join(MEMORY_DIR, 'maintenance');
  await fs.mkdir(dir, { recursive: true });
  const patternsPath = path.join(dir, 'error_patterns.json');
  const patterns = await readJSON(patternsPath) || {};

  if (!patterns[patternName]) {
    patterns[patternName] = {
      matches: errorMessage,
      service: 'unknown',
      fix: fixApplied,
      detect: '',
      verify: '',
      times_seen: 0,
      times_fixed: 0,
      confidence: 0.1,
      auto_fix: false,
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };
  }

  const p = patterns[patternName];
  p.times_seen++;
  if (success) p.times_fixed++;
  if (fixApplied && !p.fix) p.fix = fixApplied;
  p.last_seen = new Date().toISOString();

  // Recalculate confidence
  if (p.times_seen >= 3) {
    p.confidence = Math.round((p.times_fixed / p.times_seen) * 100) / 100;
  }
  if (p.confidence >= 0.9) p.auto_fix = true;

  await writeJSON(patternsPath, patterns);
  return patterns[patternName];
}

/**
 * Registers a new error pattern or updates an existing one.
 */
export async function registerErrorPattern(name, matches, service, fix, detect, verify) {
  const dir = path.join(MEMORY_DIR, 'maintenance');
  await fs.mkdir(dir, { recursive: true });
  const patternsPath = path.join(dir, 'error_patterns.json');
  const patterns = await readJSON(patternsPath) || {};

  patterns[name] = {
    matches,
    service,
    fix,
    detect,
    verify,
    times_seen: patterns[name]?.times_seen || 0,
    times_fixed: patterns[name]?.times_fixed || 0,
    confidence: patterns[name]?.confidence || 0.1,
    auto_fix: false,
    first_seen: patterns[name]?.first_seen || new Date().toISOString(),
    last_seen: new Date().toISOString()
  };

  await writeJSON(patternsPath, patterns);
  return patterns[name];
}

/**
 * Lists all known error patterns with their confidence and auto_fix status.
 */
export async function listErrorPatterns() {
  const dir = path.join(MEMORY_DIR, 'maintenance');
  const patternsPath = path.join(dir, 'error_patterns.json');
  return await readJSON(patternsPath) || {};
}

/**
 * Generates CLI commands for error patterns with high confidence.
 * These become part of the maintenance skill.
 */
export async function generateCommands() {
  const patterns = await listErrorPatterns();
  const commands = [];

  for (const [name, p] of Object.entries(patterns)) {
    if (p.confidence >= 0.9 && p.auto_fix && p.times_seen >= 5) {
      commands.push({
        command: `maintenance fix ${name}`,
        description: `Auto-fix: ${p.service} - ${name}`,
        steps: p.fix.split(' && '),
        verify: p.verify,
        confidence: p.confidence,
        times_fixed: p.times_fixed
      });
    }
  }

  return commands;
}
