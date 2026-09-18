import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parse } from 'yaml';

const require = createRequire(import.meta.url);
const runner = require('../action/runner.cjs') as {
  PACKAGE_SPEC: string;
  resolveInputPath: (workspace: string, input: string) => string;
  validateReport: (report: unknown) => unknown;
};
const finalizer = require('../action/finalizer.cjs') as {
  finalizeAction: (options: Record<string, string>) => number;
};
const temporary: string[] = [];
const temp = (prefix: string) => {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporary.push(directory);
  return directory;
};
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('composite Action contract', () => {
  const source = readFileSync('action.yml', 'utf8');
  const action = parse(source) as Record<string, any>;

  it('exposes the approved inputs and outputs without report-version', () => {
    expect(action.inputs).toEqual({
      path: expect.objectContaining({ default: '.' }),
      rule: expect.objectContaining({ default: '' }),
      'upload-report': expect.objectContaining({ default: 'true' }),
      'artifact-name': expect.objectContaining({ default: 'aiagentconform-report' }),
    });
    expect(Object.keys(action.outputs)).toEqual([
      'determination', 'passed', 'failed', 'not_applicable', 'excluded',
      'unable_to_complete', 'selected', 'exit_code', 'report_path', 'artifact_name',
    ]);
    expect(Object.hasOwn(action.inputs, 'report-version')).toBe(false);
  });

  it('pins internal Actions and uploads before final failure propagation', () => {
    const steps = action.runs.steps as Record<string, any>[];
    expect(steps.find(step => step.name === 'Set up Node.js')?.uses).toBe('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38');
    expect(steps.find(step => step.id === 'upload')?.uses).toBe('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
    expect(steps.findIndex(step => step.id === 'upload')).toBeLessThan(steps.findIndex(step => step.id === 'finalize'));
    expect(steps.find(step => step.id === 'finalize')?.if).toContain('always()');
  });

  it('transports user inputs through environment variables, not shell source', () => {
    const step = (action.runs.steps as Record<string, any>[]).find(item => item.id === 'runner')!;
    expect(step.run).toBe('node "${GITHUB_ACTION_PATH}/action/runner.cjs"');
    expect(step.run).not.toContain('inputs.');
    expect(step.env).toEqual({
      AICONFORM_INPUT_PATH: '${{ inputs.path }}',
      AICONFORM_INPUT_RULE: '${{ inputs.rule }}',
      AICONFORM_INPUT_UPLOAD_REPORT: '${{ inputs.upload-report }}',
      AICONFORM_INPUT_ARTIFACT_NAME: '${{ inputs.artifact-name }}',
    });
  });

  it('uses only JSON v2, the exact package, and no annotations or SARIF', () => {
    expect(runner.PACKAGE_SPEC).toBe('aiagentconform@0.3.0');
    const helpers = source + readFileSync('action/runner.cjs', 'utf8') + readFileSync('action/finalizer.cjs', 'utf8');
    expect(helpers).toContain("'--json', '--report-version', '2'");
    expect(helpers.toLowerCase()).not.toContain('sarif');
    expect(helpers).not.toMatch(/::(?:error|warning|notice)::/u);
    expect(helpers).toContain("'--ignore-scripts'");
    expect(helpers).toContain("npm_config_ignore_scripts: 'true'");
    for (const match of helpers.matchAll(/require\((['"])(.*?)\1\)/gu)) expect(match[2]).toMatch(/^node:/u);
  });
});

describe('Action path boundary', () => {
  it('allows missing paths whose resolved location remains in the workspace', () => {
    const workspace = temp('aiconform-action-workspace-');
    expect(runner.resolveInputPath(workspace, 'missing/package')).toBe(path.join(realpathSync(workspace), 'missing/package'));
  });

  it.each(['/tmp/package', 'C:\\outside\\package', '\\\\server\\share', '../package', 'nested/../package', 'nested\\..\\package'])('rejects unsafe input %s', input => {
    const workspace = temp('aiconform-action-workspace-');
    expect(() => runner.resolveInputPath(workspace, input)).toThrow();
  });

  it('rejects direct and missing-tail symbolic-link escapes', () => {
    const workspace = temp('aiconform-action-workspace-');
    const outside = temp('aiconform-action-outside-');
    symlinkSync(outside, path.join(workspace, 'outside'), 'dir');
    expect(() => runner.resolveInputPath(workspace, 'outside')).toThrow(/symbolic link/u);
    expect(() => runner.resolveInputPath(workspace, 'outside/not-created')).toThrow(/symbolic link/u);
  });

  it('allows an in-workspace symbolic link and missing trailing path', () => {
    const workspace = temp('aiconform-action-workspace-');
    const target = path.join(workspace, 'target');
    require('node:fs').mkdirSync(target);
    symlinkSync(target, path.join(workspace, 'inside'), 'dir');
    expect(runner.resolveInputPath(workspace, 'inside/not-created')).toBe(path.join(realpathSync(target), 'not-created'));
  });
});

describe('Action finalization', () => {
  function state(root: string, determination: string, cliExit: number) {
    const statePath = path.join(root, 'state.json');
    writeFileSync(statePath, JSON.stringify({
      kind: 'report', cliExit, reportPath: path.join(root, 'report.json'), uploadReport: true,
      artifactName: 'report', report: {
        determination,
        summary: { passed: 1, failed: cliExit === 1 ? 1 : 0, notApplicable: 0, excluded: 19, unableToComplete: cliExit === 2 ? 1 : 0, selected: 1 },
      },
    }));
    return statePath;
  }

  it.each([['pass', 0, 'PASS'], ['limited_pass', 0, 'LIMITED PASS'], ['fail', 1, 'FAIL'], ['incomplete', 2, 'INCOMPLETE']] as const)('writes a %s summary and preserves exit %i', (determination, exit, label) => {
    const root = temp('aiconform-action-finalize-');
    const output = path.join(root, 'output'); const summary = path.join(root, 'summary');
    expect(finalizer.finalizeAction({ statePath: state(root, determination, exit), runnerOutcome: 'success', uploadOutcome: 'success', summaryFile: summary, outputFile: output })).toBe(exit);
    expect(readFileSync(summary, 'utf8')).toContain(`# AIAgentConform: ${label}`);
    expect(readFileSync(output, 'utf8')).toContain(`exit_code=${exit}`);
  });

  it('treats artifact failure as tooling failure and clears conformance outputs', () => {
    const root = temp('aiconform-action-finalize-');
    const output = path.join(root, 'output'); const summary = path.join(root, 'summary');
    expect(finalizer.finalizeAction({ statePath: state(root, 'fail', 1), runnerOutcome: 'success', uploadOutcome: 'failure', summaryFile: summary, outputFile: output })).toBe(1);
    expect(readFileSync(summary, 'utf8')).toContain('integration error');
    expect(readFileSync(output, 'utf8')).toContain('determination=\n');
    expect(readFileSync(output, 'utf8')).not.toContain('determination=fail');
  });

  it('keeps runner tooling errors distinct from package determinations', () => {
    const root = temp('aiconform-action-finalize-');
    const statePath = path.join(root, 'state.json'); const output = path.join(root, 'output'); const summary = path.join(root, 'summary');
    writeFileSync(statePath, JSON.stringify({ kind: 'tooling_error', message: 'installation failed' }));
    expect(finalizer.finalizeAction({ statePath, runnerOutcome: 'success', uploadOutcome: 'skipped', summaryFile: summary, outputFile: output })).toBe(1);
    expect(readFileSync(summary, 'utf8')).toContain('integration error');
    expect(readFileSync(summary, 'utf8')).not.toMatch(/AIAgentConform: (?:FAIL|INCOMPLETE)/u);
    expect(readFileSync(output, 'utf8')).toContain('failed=\n');
  });

  it('fails when summary generation is unavailable', () => {
    const root = temp('aiconform-action-finalize-');
    const output = path.join(root, 'output');
    expect(finalizer.finalizeAction({ statePath: state(root, 'pass', 0), runnerOutcome: 'success', uploadOutcome: 'success', summaryFile: path.join(root, 'missing/summary'), outputFile: output })).toBe(1);
    expect(() => readFileSync(output, 'utf8')).toThrow();
  });

  it('rejects incomplete JSON v2 structures before exit propagation', () => {
    expect(() => runner.validateReport({ reportVersion: '2', kind: 'report' })).toThrow(/contract/u);
  });
});
