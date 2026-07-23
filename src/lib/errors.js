import chalk from 'chalk';

/**
 * Centralized error handler for ZEA CLI commands.
 *
 * Distinguishes between error types and prints actionable messages:
 *   - 401 Unauthorized     → token expired
 *   - 403 Forbidden        → insufficient permissions
 *   - Network errors       → connectivity issues
 *   - 5xx                  → server error
 *   - Validation errors    → bad data
 *
 * Usage (drop-in replacement for catch blocks):
 *
 *   import { handleError } from '../lib/errors.js';
 *   try { ... } catch (e) { handleError(e); }
 */

export function handleError(e) {
  const status = e.status;
  const code = e.code;
  const message = e.message || '';

  // 401 — Unauthorized (expired or missing token)
  if (status === 401) {
    console.error(chalk.red('🔒 Session expired or not authenticated.'));
    console.error(chalk.dim('   Run: ') + chalk.yellow('zea auth login'));
    process.exit(1);
  }

  // 403 — Forbidden (wrong org or insufficient permissions)
  if (status === 403) {
    console.error(chalk.red("🚫 Access denied. You don't have permission for this action."));
    console.error(chalk.dim('   Check your active organization: ') + chalk.yellow('zea org list'));
    process.exit(1);
  }

  // 404 — Not found
  if (status === 404) {
    console.error(chalk.red('🔍 Resource not found.'));
    if (message) console.error(chalk.dim(`   ${message}`));
    process.exit(1);
  }

  // 5xx — Server error
  if (status && status >= 500 && status < 600) {
    console.error(chalk.red(`💥 Server error (${status}). The ZEA platform may be experiencing issues.`));
    console.error(chalk.dim('   Try again in a moment, or run: ') + chalk.yellow('zea health'));
    process.exit(1);
  }

  // 4xx — Other client errors (validation, etc.)
  if (status && status >= 400 && status < 500) {
    console.error(chalk.red(`❌ Request failed (${status}).`));
    if (message) console.error(chalk.dim(`   ${message}`));
    process.exit(1);
  }

  // Network / connectivity errors
  if (code === 'ENOTFOUND') {
    console.error(chalk.red('🔌 Host not found. Check your network connection and the service URL.'));
    if (e.url) console.error(chalk.dim(`   URL: ${e.url}`));
    process.exit(1);
  }

  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    console.error(chalk.red('🔌 Connection refused. Is the ZEA platform running?'));
    if (e.url) console.error(chalk.dim(`   URL: ${e.url}`));
    console.error(chalk.dim('   Run: ') + chalk.yellow('zea health'));
    process.exit(1);
  }

  if (code === 'ETIMEDOUT') {
    console.error(chalk.red('⏱️  Request timed out. The server took too long to respond.'));
    if (e.url) console.error(chalk.dim(`   URL: ${e.url}`));
    process.exit(1);
  }

  // Generic fallback
  console.error(chalk.red('❌ Error:'), message);
  process.exit(1);
}

export default handleError;
