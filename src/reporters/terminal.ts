import type { Report, RuleList } from '../core/report.js';
import type { ReportV2 } from '../core/report-v2.js';

// Escape controls, including bidi overrides, from package-controlled text.
const safe = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
const heading = 'AIAgentConform - Agent Plugins 1.0';

export function formatTerminal(report: Report): string {
  const lines = [heading];
  for (const finding of [...report.findings, ...report.prerequisiteFindings].filter(f => f.severity === 'FAIL')) {
    lines.push(`✗ FAIL ${finding.ruleId}  ${safe(finding.path)}`, `  ${safe(finding.explanation)}`);
    const rule = report.rules.find(item => item.id === finding.ruleId);
    for (const reference of rule?.references ?? []) lines.push(`  Spec: §${reference.section} ${reference.url}`);
  }
  const { passed, total, failed, skipped } = report.ruleSummary;
  const symbol = report.status === 'PASS' ? '✓' : report.status === 'FAIL' ? '✗' : '!';
  const detail = [failed ? `${failed} failed` : '', skipped ? `${skipped} skipped` : ''].filter(Boolean);
  lines.push(`${symbol} ${passed}/${total} conformance checks passed${detail.length ? ` (${detail.join(', ')})` : ''}`);
  for (const skip of report.skipped.filter(item => item.reason !== 'not-applicable')) {
    lines.push(`  SKIP ${skip.ruleId} ${safe(skip.path)}: ${safe(skip.explanation)}`);
  }
  for (const advisory of report.advisories) lines.push(`WARN ${advisory.ruleId}: ${safe(advisory.explanation)}`);
  return lines.join('\n');
}

export function formatTerminalV2(report: ReportV2): string {
  const lines = [heading, `Target: ${safe(report.input.resolvedPath)}`];
  const components = report.inspection.components;
  lines.push(
    'Components:',
    `  Manifest: ${components.manifest.presence} (${components.manifest.inspection})`,
    `  Standard skills: ${components.standardSkills.presence} (${components.standardSkills.inspection})`,
    `  MCP configuration: ${components.mcp.presence} (${components.mcp.inspection})`,
  );
  const namespaces = report.inspection.extensionNamespaces.names;
  lines.push(`Extensions: ${namespaces.length ? namespaces.map(safe).join(', ') : 'none declared'}`);
  lines.push(`  ${report.inspection.extensionNamespaces.statement}`);
  const servers = report.inspection.mcpServers.declarations;
  lines.push(`MCP servers: ${servers.length ? servers.map(server => `${safe(server.name)} (${server.transport}${server.endpoint ? `: ${safe(server.endpoint)}` : ''})`).join(', ') : 'none declared'}`);
  lines.push(`  ${report.inspection.mcpServers.statement}`);

  for (const finding of report.findings.filter(item => item.result === 'failed')) {
    lines.push(`✗ FAIL ${finding.ruleId}  ${safe(finding.path)}`, `  ${safe(finding.explanation)}`);
    const rule = report.rules.find(item => item.id === finding.ruleId);
    for (const reference of rule?.references ?? []) lines.push(`  Spec: §${reference.section} ${reference.url}`);
  }
  for (const rule of report.rules.filter(item => item.outcome === 'unable_to_complete')) {
    lines.push(`! UNABLE ${rule.id}  ${safe(rule.reason)}`);
  }

  const summary = report.summary;
  if (report.determination === 'limited_pass') {
    lines.push(summary.passed === 1
      ? `✓ LIMITED PASS - 1 selected rule passed; ${summary.excluded} rules excluded.`
      : `✓ LIMITED PASS - selected rule not applicable; ${summary.excluded} rules excluded.`);
  } else if (report.determination === 'pass') {
    const parts = [`${summary.passed} rules passed`];
    if (summary.notApplicable) parts.push(`${summary.notApplicable} not applicable`);
    lines.push(`✓ QUALIFIED PASS - ${parts.join('; ')}.`);
  } else if (report.determination === 'fail') {
    lines.push(`✗ FAIL - ${summary.failed} rule${summary.failed === 1 ? '' : 's'} failed; ${summary.passed} passed; ${summary.notApplicable} not applicable.`);
  } else {
    lines.push(`! INCOMPLETE - ${summary.unableToComplete} rule${summary.unableToComplete === 1 ? '' : 's'} unable to complete; ${summary.failed} failed; ${summary.passed} passed.`);
  }
  lines.push('PASS is qualified: static conformance checks do not certify runtime or complete client behavior.');
  return lines.join('\n');
}

export function formatRuleList(list: RuleList): string {
  return [heading, ...list.rules.flatMap(rule => [
    `${rule.id}  ${rule.title}`, `  ${rule.explanation}`,
    ...rule.references.map(reference => `  Spec: §${reference.section} ${reference.url}`),
  ])].join('\n');
}
