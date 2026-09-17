import { Command, Option } from 'commander';
import { checkPlugin } from './protocols/agent-plugins/index.js';
import { rules } from './protocols/agent-plugins/rules.js';
import { exitCode, type RuleList } from './core/report.js';
import { exitCodeV2, toReportV2 } from './core/report-v2.js';
import { formatJson } from './reporters/json.js';
import { formatRuleList, formatTerminalV2 } from './reporters/terminal.js';

export function createCommand(
  version: string,
  write: (text: string) => void,
  setExitCode: (code: number) => void = (code) => { process.exitCode = code; },
): Command {
  const command = new Command()
    .name('aiconform')
    .description('Open-source conformance testing for AI agent protocols and standards.')
    .version(version)
    .argument('[plugin-directory]', 'plugin package directory (required unless listing rules)')
    .addOption(new Option('-f, --format <format>', 'output format').choices(['terminal', 'json']).default('terminal'))
    .option('--json', 'emit JSON v1 (shorthand for --format json)')
    .addOption(new Option('--report-version <version>', 'JSON report version (2 requires --json)').choices(['1', '2']).default('1'))
    .option('--list-rules', 'list conformance rules and specification references')
    .addOption(new Option('--rule <APxxx>', 'run one rule with necessary prerequisite checks').choices(rules.map(rule => rule.id)))
    .addHelpText('after', '\nExamples:\n  aiconform ./my-plugin\n  aiconform ./my-plugin --json\n  aiconform ./my-plugin --json --report-version 2\n  aiconform ./my-plugin --rule AP006\n  aiconform --list-rules\n\nExit codes: 0 = qualified pass/list/help, 1 = conformance failure, 2 = usage error or unable to complete.');
  command.action((directory: string | undefined, options: { format: 'terminal' | 'json'; json?: boolean; reportVersion: '1' | '2'; listRules?: boolean; rule?: string }) => {
    if (options.json && options.format === 'terminal' && command.getOptionValueSource('format') === 'cli') {
      command.error('--json cannot be combined with --format terminal.', { exitCode: 2 });
    }
    if (options.reportVersion === '2' && !options.json) {
      command.error('--report-version 2 requires --json.', { exitCode: 2 });
    }
    const jsonOutput = options.json === true || options.format === 'json';
    if (options.listRules) {
      if (directory || options.rule || options.reportVersion === '2') command.error('--list-rules cannot be combined with a directory, --rule, or --report-version 2.', { exitCode: 2 });
      const list: RuleList = { reportVersion: '1', kind: 'rules', protocol: 'agent-plugins', specificationVersion: '1.0.0', rules };
      write((jsonOutput ? formatJson(list) : formatRuleList(list)) + '\n');
      setExitCode(0);
      return;
    }
    if (!directory) command.error('A plugin directory is required. Use --help for usage or --list-rules to inspect the catalog.', { exitCode: 2 });
    const report = checkPlugin(directory!, options.rule);
    if (jsonOutput && options.reportVersion === '1') {
      write(formatJson(report) + '\n');
      setExitCode(exitCode(report));
      return;
    }
    const reportV2 = toReportV2(report, version);
    write((jsonOutput ? formatJson(reportV2) : formatTerminalV2(reportV2)) + '\n');
    setExitCode(exitCodeV2(reportV2));
  });
  return command;
}
