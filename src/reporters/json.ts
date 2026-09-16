import type { CliError, Report, RuleList } from '../core/report.js';

export function formatJson(value: Report | RuleList | CliError): string {
  return JSON.stringify(value, null, 2);
}
