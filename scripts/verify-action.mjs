// Exercises the Action orchestration against the locally packed npm package.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../schemas/report-v2.schema.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const { executeAction } = require('../action/runner.cjs');
const { finalizeAction } = require('../action/finalizer.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const artifact = path.join(root, '.artifacts', 'aiagentconform-0.3.0.tgz');
assert(existsSync(artifact), `Missing local package artifact: ${artifact}`);
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const temporary = mkdtempSync(path.join(tmpdir(), 'aiconform-action-integration-'));

const cases = [
  { name: 'full pass', workspace: root, inputPath: 'fixtures/action/full-pass', determination: 'pass', exit: 0, passed: 20 },
  { name: 'conformance failure', workspace: root, inputPath: 'fixtures/action/conformance-failure', determination: 'fail', exit: 1, failed: 1 },
  { name: 'unable to complete', workspace: root, inputPath: 'fixtures/action/unable-to-complete', determination: 'incomplete', exit: 2, unable: 1 },
  { name: 'mixed failure/incomplete', workspace: root, inputPath: 'fixtures/action/mixed', determination: 'incomplete', exit: 2, failed: 1, unable: 1 },
  { name: 'single-rule limited pass', workspace: root, inputPath: 'fixtures/action/single-rule', rule: 'AP006', determination: 'limited_pass', exit: 0, passed: 1, excluded: 19 },
  { name: 'subdirectory package', workspace: path.join(root, 'fixtures/action/subdirectory/workspace'), inputPath: 'packages/plugin', determination: 'pass', exit: 0 },
  { name: 'missing in-workspace package', workspace: root, inputPath: 'fixtures/action/not-created', determination: 'fail', exit: 1, failed: 1 },
];

try {
  for (const [index, item] of cases.entries()) {
    const state = executeAction({
      workspace: item.workspace,
      inputs: { path: item.inputPath, rule: item.rule ?? '', uploadReport: 'true', artifactName: `aiconform-${index}` },
      packageSpec: artifact,
      tempRoot: temporary,
    });
    assert.equal(state.kind, 'report');
    assert(validate(state.report), JSON.stringify(validate.errors));
    assert.equal(state.report.determination, item.determination);
    assert.equal(state.cliExit, item.exit);
    if (item.passed !== undefined) assert.equal(state.report.summary.passed, item.passed);
    if (item.failed !== undefined) assert.equal(state.report.summary.failed, item.failed);
    if (item.unable !== undefined) assert.equal(state.report.summary.unableToComplete, item.unable);
    if (item.excluded !== undefined) assert.equal(state.report.summary.excluded, item.excluded);
    assert(existsSync(state.reportPath), `${item.name}: report was not written before finalization`);
    const statePath = path.join(temporary, `state-${index}.json`);
    const outputPath = path.join(temporary, `output-${index}`);
    const summaryPath = path.join(temporary, `summary-${index}`);
    writeFileSync(statePath, JSON.stringify(state));
    assert.equal(finalizeAction({ statePath, runnerOutcome: 'success', uploadOutcome: 'success', summaryFile: summaryPath, outputFile: outputPath }), item.exit);
    assert.match(readFileSync(outputPath, 'utf8'), new RegExp(`exit_code=${item.exit}`));
    assert(readFileSync(summaryPath, 'utf8').includes('AIAgentConform'));
    console.log(`Action integration: ${item.name} passed (exit ${item.exit}).`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
