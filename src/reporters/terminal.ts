import type { Report, RuleList } from '../core/report.js';

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

export function formatRuleList(list: RuleList): string {
  return [heading, ...list.rules.flatMap(rule => [
    `${rule.id}  ${rule.title}`, `  ${rule.explanation}`,
    ...rule.references.map(reference => `  Spec: §${reference.section} ${reference.url}`),
  ])].join('\n');
}
