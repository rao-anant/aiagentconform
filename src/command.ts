import { Command, Option } from 'commander';
import { checkPlugin } from './protocols/agent-plugins/index.js';
import { rules } from './protocols/agent-plugins/rules.js';
import { exitCode, type RuleList } from './core/report.js';
import { formatJson } from './reporters/json.js';
import { formatRuleList, formatTerminal } from './reporters/terminal.js';

export function createCommand(
  version: string,
  write: (text: string) => void,
  setExitCode: (code: number) => void = (code) => { process.exitCode = code; },
): Command {
  const command = new Command()
    .name('agentcheck')
    .description('Static Agent Plugins 1.0 conformance checks; never executes plugin code')
    .version(version)
    .argument('[plugin-directory]', 'plugin package directory (required unless listing rules)')
    .addOption(new Option('-f, --format <format>', 'output format').choices(['terminal', 'json']).default('terminal'))
    .option('--list-rules', 'list conformance rules and specification references')
    .addOption(new Option('--rule <APxxx>', 'run one rule with necessary prerequisite checks').choices(rules.map(rule => rule.id)))
    .addHelpText('after', '\nExamples:\n  agentcheck ./my-plugin\n  agentcheck ./my-plugin --format json\n  agentcheck ./my-plugin --rule AP006\n  agentcheck --list-rules\n\nExit codes: 0 = passed/list/help, 1 = conformance failure, 2 = usage error or incomplete check.');
  command.action((directory: string | undefined, options: { format: 'terminal' | 'json'; listRules?: boolean; rule?: string }) => {
    if (options.listRules) {
      if (directory || options.rule) command.error('--list-rules cannot be combined with a directory or --rule.', { exitCode: 2 });
      const list: RuleList = { reportVersion: '1', kind: 'rules', protocol: 'agent-plugins', specificationVersion: '1.0.0', rules };
      write((options.format === 'json' ? formatJson(list) : formatRuleList(list)) + '\n');
      setExitCode(0);
      return;
    }
    if (!directory) command.error('A plugin directory is required. Use --help for usage or --list-rules to inspect the catalog.', { exitCode: 2 });
    const report = checkPlugin(directory!, options.rule);
    write((options.format === 'json' ? formatJson(report) : formatTerminal(report)) + '\n');
    setExitCode(exitCode(report));
  });
  return command;
}
