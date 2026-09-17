import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../schemas/report-v2.schema.json' with { type: 'json' };
import { runCli } from '../src/run-cli.js';
import { rules } from '../src/protocols/agent-plugins/rules.js';

const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const fixture = (name: string) => path.resolve('fixtures/agent-plugins', name);
const temporary: string[] = [];
function run(args: string[]) {
  let out = ''; let err = '';
  const code = runCli(args, '0.2.0', { out: text => { out += text; }, err: text => { err += text; } });
  return { out, err, code };
}
function v2(name: string, ...args: string[]) {
  const result = run([fixture(name), ...args, '--json', '--report-version', '2']);
  const report = JSON.parse(result.out);
  expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  expect(report.rules).toHaveLength(20);
  expect(new Set(report.rules.map((rule: { id: string }) => rule.id)).size).toBe(20);
  expect(report.summary.passed + report.summary.failed + report.summary.notApplicable + report.summary.excluded + report.summary.unableToComplete).toBe(20);
  return { ...result, report };
}
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('JSON v2 acceptance reports', () => {
  it('reports the C# package with qualified scope and opaque extension details', () => {
    const { report, code } = v2('acceptance/csharp-dotnet-development');
    expect(code).toBe(0); expect(report.determination).toBe('pass');
    expect(report.inspection.components.standardSkills.presence).toBe('absent');
    expect(report.inspection.components.mcp.presence).toBe('absent');
    expect(report.inspection.extensionNamespaces).toMatchObject({
      names: ['com.github.awesome-copilot'], internalsValidated: false, referencedPathsValidated: false,
    });
  });

  it('runs HTTP checks for Context7 and marks stdio-only rules not applicable', () => {
    const { report, code } = v2('acceptance/context7');
    expect(code).toBe(0);
    expect(report.rules.find((rule: { id: string }) => rule.id === 'AP020').outcome).toBe('passed');
    expect(report.rules.filter((rule: { id: string }) => ['AP018', 'AP019'].includes(rule.id)).map((rule: { outcome: string }) => rule.outcome)).toEqual(['not_applicable', 'not_applicable']);
    expect(report.inspection.mcpServers.declarations).toEqual([{ name: 'context7', transport: 'streamable-http', endpoint: 'https://mcp.context7.com/mcp' }]);
    expect(report.inspection.mcpServers.endpointsContacted).toBe(false);
  });

  it('emits one actual result and 19 excluded results for a single-rule run', () => {
    const { report, code } = v2('valid', '--rule', 'AP006');
    expect(code).toBe(0); expect(report.determination).toBe('limited_pass');
    expect(report.summary).toMatchObject({ selected: 1, passed: 1, excluded: 19 });
    expect(report.rules.filter((rule: { outcome: string }) => rule.outcome === 'excluded')).toHaveLength(19);
    const terminal = run([fixture('valid'), '--rule', 'AP006']);
    expect(terminal.out).toContain('LIMITED PASS - 1 selected rule passed; 19 rules excluded.');
  });

  it('treats a legitimately inapplicable selected rule as successful but limited', () => {
    const { report, code } = v2('minimal', '--rule', 'AP020');
    expect(code).toBe(0);
    expect(report.rules.find((rule: { id: string }) => rule.id === 'AP020').outcome).toBe('not_applicable');
    const terminal = run([fixture('minimal'), '--rule', 'AP020']);
    expect(terminal.code).toBe(0); expect(terminal.out).toContain('LIMITED PASS - selected rule not applicable; 19 rules excluded.');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports filesystem inspection failure as unable to complete', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'aiconform-v2-')); temporary.push(root);
    cpSync(fixture('minimal'), root, { recursive: true }); chmodSync(path.join(root, 'plugin.json'), 0);
    try {
      const result = run([root, '--json', '--report-version', '2']); const report = JSON.parse(result.out);
      expect(result.code).toBe(2); expect(validate(report)).toBe(true);
      expect(report.rules.some((rule: { outcome: string }) => rule.outcome === 'unable_to_complete')).toBe(true);
      expect(report.executionProblems[0]).toMatchObject({ kind: 'filesystem' });
      expect(report.inspection.components.manifest).toMatchObject({ presence: 'present', inspection: 'unable_to_complete' });
    } finally { chmodSync(path.join(root, 'plugin.json'), 0o644); }
  });

  it('keeps malformed plugin JSON as AP003 failure and exit 1', () => {
    const { report, code } = v2('invalid/ap003');
    expect(code).toBe(1);
    expect(report.rules.find((rule: { id: string }) => rule.id === 'AP003').outcome).toBe('failed');
    expect(report.summary.unableToComplete).toBe(0);
  });

  it('records a failed prerequisite as inspection evidence when it blocks a selected rule', () => {
    const { report, code } = v2('invalid/ap003', '--rule', 'AP012');
    expect(code).toBe(2);
    expect(report.rules.find((rule: { id: string }) => rule.id === 'AP012').outcome).toBe('unable_to_complete');
    expect(report.rules.find((rule: { id: string }) => rule.id === 'AP003').outcome).toBe('excluded');
    expect(report.inspection.evidence.some((item: { detail: string }) => item.detail.startsWith('Prerequisite AP003:'))).toBe(true);
  });

  it('is deterministic and every representative report validates', () => {
    for (const name of ['valid', 'minimal', 'incomplete/data-cwd', 'invalid/ap003', 'invalid/ap006']) {
      const first = v2(name); const second = v2(name);
      expect(first.out).toBe(second.out);
    }
  });

  it.each(['valid', 'minimal', 'incomplete/data-cwd', ...rules.map(rule => `invalid/${rule.id.toLowerCase()}`)])('validates the v2 report for %s', name => {
    v2(name);
  });

  it('uses a closed schema', () => {
    const { report } = v2('valid');
    expect(validate({ ...report, unexpected: true })).toBe(false);
    expect(validate({ ...report, rules: report.rules.map((rule: object, index: number) => index ? rule : { ...rule, unexpected: true }) })).toBe(false);
  });
});

describe('CLI version selection', () => {
  it('keeps --json and --format json on JSON v1', () => {
    const shorthand = run([fixture('valid'), '--json']);
    const format = run([fixture('valid'), '--format', 'json']);
    expect(JSON.parse(shorthand.out).reportVersion).toBe('1');
    expect(shorthand.out).toBe(format.out);
  });

  it('requires --json for report version 2', () => {
    const result = run([fixture('valid'), '--report-version', '2']);
    expect(result.code).toBe(2); expect(result.out).toBe(''); expect(result.err).toContain('requires --json');
  });

  it('uses v2 incomplete precedence while v1 retains mixed FAIL precedence', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'aiconform-v2-mixed-')); temporary.push(root);
    cpSync(fixture('incomplete/data-cwd'), root, { recursive: true });
    writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'valid', unexpected: true,
    }));
    const legacy = run([root, '--json']);
    const modern = run([root, '--json', '--report-version', '2']);
    expect(legacy.code).toBe(1); expect(JSON.parse(legacy.out).status).toBe('FAIL');
    expect(validate(JSON.parse(modern.out)), JSON.stringify(validate.errors)).toBe(true);
    expect(modern.code).toBe(2); expect(JSON.parse(modern.out).determination).toBe('incomplete');
    expect(run([root]).code).toBe(2);
  });

  it('does not permit --format json as the v2 opt-in', () => {
    const result = run([fixture('valid'), '--format', 'json', '--report-version', '2']);
    expect(result.code).toBe(2); expect(JSON.parse(result.out)).toMatchObject({ reportVersion: '1', kind: 'error', code: 'CLI_USAGE' });
  });
});
