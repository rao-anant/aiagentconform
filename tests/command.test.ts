import { describe, expect, it } from 'vitest';
import { createCommand } from '../src/command.js';

function run(args: string[]): { output: string; code: number } {
  let output = ''; let code = -1;
  createCommand('0.1.0', text => { output += text; }, value => { code = value; }).parse(args, { from: 'user' });
  return { output, code };
}

describe('agentcheck', () => {
  it('reports individual failures and rule IDs with a failing exit code', () => {
    const { output, code } = run(['fixtures/agent-plugins/invalid/ap006']);
    expect(output).toContain('FAIL AP006'); expect(code).toBe(1);
  });
  it('emits only structured JSON with references and a successful exit code', () => {
    const { output, code } = run(['fixtures/agent-plugins/valid', '--format', 'json']);
    const report = JSON.parse(output);
    expect(report.status).toBe('PASS'); expect(code).toBe(0);
    expect(report.rules).toHaveLength(20); expect(report.findings.length).toBeGreaterThan(20);
    expect(report.advisories).toEqual([]);
  });
  it('reports an inaccessible target as structured findings', () => {
    const { output, code } = run(['fixtures/agent-plugins/does-not-exist', '--format', 'json']);
    expect(JSON.parse(output).findings[0].ruleId).toBe('AP001'); expect(code).toBe(1);
  });
  it.each([[], ['--format', 'xml'], ['--unknown'], ['first', 'second']])('rejects invalid invocation %j', (...args) => {
    const command = createCommand('0.1.0', () => {}, () => {}).exitOverride().configureOutput({ writeErr: () => {} });
    expect(() => command.parse(args, { from: 'user' })).toThrow();
  });
});
