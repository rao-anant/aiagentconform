'use strict';

const fs = require('node:fs');

const OUTPUT_NAMES = [
  'determination', 'passed', 'failed', 'not_applicable', 'excluded',
  'unable_to_complete', 'selected', 'exit_code', 'report_path', 'artifact_name',
];

function escapeMarkdown(value) {
  return String(value).replace(/[\\`|*_{}[\]()<>#+.!-]/gu, '\\$&').replace(/[\r\n]+/gu, ' ');
}

function appendOutput(file, name, value) {
  if (!file) throw new Error('GITHUB_OUTPUT is unavailable.');
  fs.appendFileSync(file, `${name}=${String(value)}\n`, 'utf8');
}

function writeOutputs(file, values) {
  for (const name of OUTPUT_NAMES) appendOutput(file, name, values[name] ?? '');
}

function toolingSummary(message) {
  return [
    '# AIAgentConform integration error',
    '',
    'The Action could not produce a trustworthy conformance result.',
    '',
    `Reason: ${escapeMarkdown(message)}`,
    '',
  ].join('\n');
}

function reportSummary(state, uploadOutcome) {
  const report = state.report;
  const labels = { pass: 'PASS', limited_pass: 'LIMITED PASS', fail: 'FAIL', incomplete: 'INCOMPLETE' };
  const summary = report.summary;
  return [
    `# AIAgentConform: ${labels[report.determination]}`,
    '',
    '| Outcome | Count |',
    '| --- | ---: |',
    `| Passed | ${summary.passed} |`,
    `| Failed | ${summary.failed} |`,
    `| Not applicable | ${summary.notApplicable} |`,
    `| Excluded | ${summary.excluded} |`,
    `| Unable to complete | ${summary.unableToComplete} |`,
    `| Selected | ${summary.selected} |`,
    '',
    `Validated CLI exit code: ${state.cliExit}`,
    '',
    `JSON v2 report: \`${escapeMarkdown(state.reportPath)}\``,
    '',
    state.uploadReport ? `Artifact \`${escapeMarkdown(state.artifactName)}\`: ${uploadOutcome}.` : 'Artifact upload: disabled.',
    '',
  ].join('\n');
}

function finalizeAction(options) {
  let state;
  try {
    if (options.runnerOutcome !== 'success') throw new Error(`Runner step outcome was ${options.runnerOutcome || 'unavailable'}.`);
    if (!options.statePath) throw new Error('Runner state is unavailable.');
    state = JSON.parse(fs.readFileSync(options.statePath, 'utf8'));
    if (!state || state.kind === 'tooling_error') throw new Error(state?.message || 'Runner did not produce a report.');
    if (state.kind !== 'report') throw new Error('Runner state is invalid.');
    if (state.uploadReport && options.uploadOutcome !== 'success') {
      throw new Error(`Report artifact upload outcome was ${options.uploadOutcome || 'unavailable'}.`);
    }
    fs.appendFileSync(options.summaryFile, reportSummary(state, options.uploadOutcome), 'utf8');
    writeOutputs(options.outputFile, {
      determination: state.report.determination,
      passed: state.report.summary.passed,
      failed: state.report.summary.failed,
      not_applicable: state.report.summary.notApplicable,
      excluded: state.report.summary.excluded,
      unable_to_complete: state.report.summary.unableToComplete,
      selected: state.report.summary.selected,
      exit_code: state.cliExit,
      report_path: state.reportPath,
      artifact_name: state.artifactName,
    });
    console.log(`AIAgentConform ${state.report.determination}: exit ${state.cliExit}; report ${state.reportPath}`);
    return state.cliExit;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`AIAgentConform Action tooling error: ${message}`);
    try {
      fs.appendFileSync(options.summaryFile, toolingSummary(message), 'utf8');
      writeOutputs(options.outputFile, {});
    } catch (writeError) {
      console.error(`AIAgentConform Action could not write its summary or outputs: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
    }
    return 1;
  }
}

function main() {
  process.exitCode = finalizeAction({
    statePath: process.env.AICONFORM_STATE_PATH,
    runnerOutcome: process.env.AICONFORM_RUNNER_OUTCOME,
    uploadOutcome: process.env.AICONFORM_UPLOAD_OUTCOME,
    summaryFile: process.env.GITHUB_STEP_SUMMARY,
    outputFile: process.env.GITHUB_OUTPUT,
  });
}

module.exports = { OUTPUT_NAMES, escapeMarkdown, finalizeAction, reportSummary, toolingSummary };

if (require.main === module) main();
