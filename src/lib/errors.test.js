import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleError } from '../lib/errors.js';

describe('handleError', () => {
  let exitCode = null;

  beforeEach(() => {
    exitCode = null;
    mock.method(process, 'exit', (code) => {
      exitCode = code;
    });
    mock.method(console, 'error', () => {});
  });

  it('exits with code 1 on 401', () => {
    handleError({ status: 401, message: 'Unauthorized' });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on 403', () => {
    handleError({ status: 403, message: 'Forbidden' });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on 404', () => {
    handleError({ status: 404, message: 'Not found' });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on 500', () => {
    handleError({ status: 500 });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on 502', () => {
    handleError({ status: 502 });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on 400', () => {
    handleError({ status: 400, message: 'Bad request' });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on ENOTFOUND', () => {
    handleError({ code: 'ENOTFOUND', url: 'http://example.com' });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on ECONNREFUSED', () => {
    handleError({ code: 'ECONNREFUSED', url: 'http://example.com' });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on ECONNRESET', () => {
    handleError({ code: 'ECONNRESET' });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on ETIMEDOUT', () => {
    handleError({ code: 'ETIMEDOUT' });
    assert.equal(exitCode, 1);
  });

  it('exits with code 1 on generic error', () => {
    handleError({ message: 'Something broke' });
    assert.equal(exitCode, 1);
  });
});
