import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

const originalWrite = process.stdout.write;
let chunks = [];

beforeEach(() => {
  chunks = [];
  process.stdout.write = (chunk) => {
    chunks.push(chunk);
    return true;
  };
});

const display = await import('../utils/display.js');

describe('display module', () => {
  after(() => {
    process.stdout.write = originalWrite;
  });

  // ── message / markdown ──────────────────────────

  it('message renders plain text', () => {
    display.message('Hello world');
    assert.ok(chunks.join('').includes('Hello world'));
  });

  it('message renders bold markdown', () => {
    display.message('**bold text**');
    assert.ok(chunks.join('').includes('bold text'));
  });

  it('message renders inline code', () => {
    display.message('use `zea auth` command');
    assert.ok(chunks.join('').includes('zea auth'));
  });

  it('message renders headings', () => {
    display.message('# Title');
    assert.ok(chunks.join('').includes('Title'));
  });

  it('message renders h2 headings', () => {
    display.message('## Subtitle');
    assert.ok(chunks.join('').includes('Subtitle'));
  });

  it('message renders horizontal rule', () => {
    display.message('---');
    assert.ok(chunks.join('').includes('─'));
  });

  it('message renders links', () => {
    display.message('[click here](https://example.com)');
    const output = chunks.join('');
    assert.ok(output.includes('click here'));
    assert.ok(output.includes('https://example.com'));
  });

  it('message renders links without href', () => {
    // Some markdown parsers produce links without href
    display.message('[just text]()');
  });

  it('message renders blockquotes', () => {
    display.message('> quoted text');
    assert.ok(chunks.join('').includes('quoted text'));
  });

  it('message renders unordered lists', () => {
    display.message('- item 1\n- item 2');
    const output = chunks.join('');
    assert.ok(output.includes('item 1'));
    assert.ok(output.includes('item 2'));
  });

  it('message renders ordered lists', () => {
    display.message('1. first\n2. second');
    const output = chunks.join('');
    assert.ok(output.includes('first'));
    assert.ok(output.includes('second'));
  });

  it('message renders nested list items', () => {
    display.message('- parent\n  - child');
    const output = chunks.join('');
    assert.ok(output.includes('parent'));
    assert.ok(output.includes('child'));
  });

  it('message renders code blocks', () => {
    display.message('```\nconst x = 1;\n```');
    assert.ok(chunks.join('').includes('const x = 1'));
  });

  it('message renders italic', () => {
    display.message('*italic text*');
    assert.ok(chunks.join('').includes('italic text'));
  });

  it('message renders tables', () => {
    display.message('| Name | Value |\n|------|-------|\n| foo  | bar   |');
    const output = chunks.join('');
    assert.ok(output.includes('Name'));
    assert.ok(output.includes('Value'));
    assert.ok(output.includes('foo'));
    assert.ok(output.includes('bar'));
    assert.ok(output.includes('┌'));
    assert.ok(output.includes('└'));
  });

  it('message renders single-cell tables', () => {
    display.message('| single |\n|--------|\n| value  |');
    const output = chunks.join('');
    assert.ok(output.includes('single'));
    assert.ok(output.includes('value'));
  });

  it('message handles empty markdown', () => {
    display.message('');
    // Should not throw
  });

  it('message handles whitespace-only markdown', () => {
    display.message('   \n  \n ');
    // Should not throw, falls back to original text
  });

  it('message handles invalid markdown gracefully', () => {
    assert.doesNotThrow(() => display.message('unclosed **bold'));
  });

  it('message handles malformed markdown without crash', () => {
    // raw HTML or weird input
    assert.doesNotThrow(() => display.message('<div>html</div>'));
  });

  // ── utility functions ───────────────────────────

  it('done outputs success message', () => {
    display.done();
    assert.ok(chunks.join('').includes('Listo'));
  });

  it('errorMsg outputs error message', () => {
    display.errorMsg('something failed');
    const output = chunks.join('');
    assert.ok(output.includes('something failed'));
    assert.ok(output.includes('Error'));
  });

  it('reasoning outputs thinking prefix', () => {
    display.reasoning('analyzing...');
    const output = chunks.join('');
    assert.ok(output.includes('pensando'));
    assert.ok(output.includes('analyzing...'));
  });

  it('tool outputs running prefix', () => {
    display.tool('installing', 'running');
    const output = chunks.join('');
    assert.ok(output.includes('ejecutando'));
    assert.ok(output.includes('installing'));
  });

  it('tool outputs tool prefix when not running', () => {
    display.tool('installed', 'done');
    const output = chunks.join('');
    assert.ok(output.includes('tool'));
    assert.ok(output.includes('installed'));
  });

  it('progressEvent outputs progress', () => {
    display.progressEvent('downloading');
    const output = chunks.join('');
    assert.ok(output.includes('progreso'));
    assert.ok(output.includes('downloading'));
  });

  it('question outputs question', () => {
    display.question('Continue?');
    assert.ok(chunks.join('').includes('Continue?'));
  });
});
