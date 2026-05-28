import chalk from 'chalk';
import { marked } from 'marked';

const C = {
  thinking: chalk.gray,
  tool: chalk.blue,
  progress: chalk.cyan,
  question: chalk.bold.white,
  text: (t) => t,
  done: chalk.green,
  error: chalk.red,
};

export function reasoning(text) {
  process.stdout.write(`  ${C.thinking('[pensando]')} ${C.thinking(text)}\n`);
}

export function tool(text, status) {
  const prefix = status === 'running' ? '[ejecutando]' : '[tool]';
  process.stdout.write(`  ${C.tool(prefix)} ${C.tool(text)}\n`);
}

export function progressEvent(text) {
  process.stdout.write(`  ${C.progress('[progreso]')} ${C.progress(text)}\n`);
}

export function question(text) {
  process.stdout.write(`\n  ${C.question(text)}\n\n`);
}

export function message(text) {
  const rendered = renderMarkdown(text);
  process.stdout.write(`  ${rendered}\n`);
}

export function done() {
  process.stdout.write(`  ${C.done('✓ Listo')}\n`);
}

export function errorMsg(text) {
  process.stdout.write(`  ${C.error('✗ Error:')} ${C.error(text)}\n`);
}

// ── Markdown renderer ──────────────────────────────────

function renderMarkdown(text) {
  try {
    const tokens = marked.lexer(text);
    let output = '';
    for (const token of tokens) {
      output += renderToken(token);
    }
    return output.trim() || text;
  } catch {
    return text;
  }
}

function renderToken(token) {
  switch (token.type) {
    case 'paragraph':
      return token.tokens ? token.tokens.map(renderToken).join('') + '\n' : token.text + '\n';

    case 'heading':
      return chalk.bold.underline(token.text) + '\n';

    case 'strong':
      return chalk.bold(token.text);

    case 'em':
      return chalk.italic(token.text);

    case 'codespan':
      return chalk.dim('`' + token.text + '`');

    case 'code':
      return chalk.dim(token.text + '\n');

    case 'list':
      return token.items.map((item, i) => {
        const text = item.tokens ? item.tokens.map(renderToken).join('') : item.text;
        return `  ${chalk.dim(token.ordered ? `${i + 1}.` : '•')} ${text}`;
      }).join('\n') + '\n';

    case 'list_item':
      return token.tokens ? token.tokens.map(renderToken).join('') : token.text;

    case 'table':
      return renderTable(token) + '\n';

    case 'blockquote':
      const ctx = token.tokens ? token.tokens.map(renderToken).join('') : token.text;
      return chalk.italic.dim(ctx) + '\n';

    case 'hr':
      return chalk.dim('─'.repeat(40)) + '\n';

    case 'space':
      return '\n';

    case 'text':
      return token.text || '';

    case 'link':
      return chalk.blue.underline(token.text) + (token.href ? ' ' + chalk.dim('(' + token.href + ')') : '');

    default:
      return token.raw || token.text || '';
  }
}

function renderTable(token) {
  const header = token.header.map(h => chalk.bold(h.text));
  const rows = token.rows.map(row => row.map(c => c.text));
  const all = [header, ...rows];

  const colWidths = header.map((_, ci) =>
    Math.max(...all.map(row => (row[ci] || '').length))
  );

  const pad = (text, w) => text + ' '.repeat(Math.max(0, w - text.length));

  let out = '';
  out += '  ' + chalk.dim('┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐') + '\n';
  out += '  ' + chalk.dim('│') + ' ' + header.map((h, i) => chalk.bold(pad(h, colWidths[i]))).join(' ' + chalk.dim('│') + ' ') + ' ' + chalk.dim('│') + '\n';
  out += '  ' + chalk.dim('├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤') + '\n';
  for (const row of rows) {
    out += '  ' + chalk.dim('│') + ' ' + row.map((c, i) => pad(c, colWidths[i])).join(' ' + chalk.dim('│') + ' ') + ' ' + chalk.dim('│') + '\n';
  }
  out += '  ' + chalk.dim('└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘');
  return out;
}
