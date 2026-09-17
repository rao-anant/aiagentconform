# JSON report v2 implementation design

This note records the v0.2.0 report shape before implementation. JSON v1 remains
the default and is not changed. JSON v2 uses the string discriminator `"2"`.

## Exact TypeScript model

```ts
export type RuleId =
  | 'AP001' | 'AP002' | 'AP003' | 'AP004' | 'AP005' | 'AP006' | 'AP007' | 'AP008' | 'AP009' | 'AP010'
  | 'AP011' | 'AP012' | 'AP013' | 'AP014' | 'AP015' | 'AP016' | 'AP017' | 'AP018' | 'AP019' | 'AP020';
export type RuleOutcome =
  | 'passed'
  | 'failed'
  | 'not_applicable'
  | 'excluded'
  | 'unable_to_complete';

export interface ReportV2 {
  reportVersion: '2';
  kind: 'report';
  tool: { name: 'AIAgentConform'; version: string };
  protocol: { id: 'agent-plugins'; specificationVersion: '1.0.0' };
  input: {
    argument: string;
    resolvedPath: string;
    packageIdentity: { manifestName: string | null };
  };
  selection: { mode: 'all' | 'single'; selectedRuleIds: RuleId[] };
  rules: RuleOutcomeV2[];
  findings: FindingV2[];
  inspection: {
    evidence: InspectionEvidence[];
    components: {
      manifest: ComponentInspection;
      standardSkills: ComponentInspection;
      mcp: ComponentInspection;
    };
    extensionNamespaces: {
      names: string[];
      internalsValidated: false;
      referencedPathsValidated: false;
      statement: string;
    };
    mcpServers: {
      declarations: McpServerDeclaration[];
      serversExecuted: false;
      endpointsContacted: false;
      statement: string;
    };
  };
  executionProblems: ExecutionProblem[];
  scope: { limitations: string[]; untestedCapabilities: string[] };
  summary: {
    total: 20;
    selected: number;
    passed: number;
    failed: number;
    notApplicable: number;
    excluded: number;
    unableToComplete: number;
  };
  determination: 'pass' | 'limited_pass' | 'fail' | 'incomplete';
}

export interface RuleOutcomeV2 {
  id: RuleId;
  title: string;
  classification: 'normative' | 'advisory';
  outcome: RuleOutcome;
  reason: string;
  references: { section: string; url: string }[];
}

export interface FindingV2 {
  ruleId: RuleId;
  result: 'passed' | 'failed';
  path: string;
  explanation: string;
  boundary: 'plugin' | 'component' | 'skill' | 'server' | 'field';
}

export interface InspectionEvidence {
  operation: 'resolve' | 'discover' | 'read' | 'parse' | 'inspect';
  subject: string;
  status: 'succeeded' | 'absent' | 'failed' | 'not_performed';
  detail: string;
}

export interface ComponentInspection {
  path: string;
  presence: 'present' | 'absent' | 'unknown';
  inspection: 'complete' | 'partial' | 'unable_to_complete' | 'not_applicable';
}

export interface McpServerDeclaration {
  name: string;
  transport: 'stdio' | 'streamable-http' | 'sse' | 'unknown';
  endpoint: string | null;
}

export interface ExecutionProblem {
  kind: 'filesystem' | 'parser_resource' | 'client_context' | 'prerequisite';
  path: string;
  affectedRuleIds: RuleId[];
  reason: string;
}
```

`reason` is required for every outcome so consumers never need to infer why a
rule was not applicable, excluded, or unable to complete. `classification` is
orthogonal to execution outcome; AP001-AP020 are all normative in v0.2.0.

## Complete example

This single-rule example is intentionally complete: the selected AP006 passes,
the other 19 catalog rules are excluded, and prerequisite work appears only as
inspection evidence.

```json
{
  "reportVersion": "2",
  "kind": "report",
  "tool": { "name": "AIAgentConform", "version": "0.2.0" },
  "protocol": { "id": "agent-plugins", "specificationVersion": "1.0.0" },
  "input": {
    "argument": "./csharp-dotnet-development",
    "resolvedPath": "/work/csharp-dotnet-development",
    "packageIdentity": { "manifestName": "csharp-dotnet-development" }
  },
  "selection": { "mode": "single", "selectedRuleIds": ["AP006"] },
  "rules": [
    { "id": "AP001", "title": "Manifest discovery", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "5.1", "url": "https://agent-plugins.org/specification#51-location-and-loading" }] },
    { "id": "AP002", "title": "Package containment", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "4.1", "url": "https://agent-plugins.org/specification#41-general-requirements" }] },
    { "id": "AP003", "title": "Manifest JSON", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "5.2", "url": "https://agent-plugins.org/specification#52-manifest-object" }] },
    { "id": "AP004", "title": "Required manifest fields", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "5.3", "url": "https://agent-plugins.org/specification#53-required-fields" }] },
    { "id": "AP005", "title": "Manifest schema version", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "5.2", "url": "https://agent-plugins.org/specification#52-manifest-object" }] },
    { "id": "AP006", "title": "Plugin name", "classification": "normative", "outcome": "passed", "reason": "The rule ran and its normative requirement was satisfied.", "references": [{ "section": "5.5", "url": "https://agent-plugins.org/specification#55-plugin-name-constraints" }] },
    { "id": "AP007", "title": "Manifest metadata", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "5.4", "url": "https://agent-plugins.org/specification#54-metadata-fields" }] },
    { "id": "AP008", "title": "Unknown manifest fields", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "5.2", "url": "https://agent-plugins.org/specification#52-manifest-object" }] },
    { "id": "AP009", "title": "Extensions package shape", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "8.1", "url": "https://agent-plugins.org/specification#81-manifest-extension-data" }] },
    { "id": "AP010", "title": "Fixed component locations", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "6.1–6.2", "url": "https://agent-plugins.org/specification#6-component-discovery" }] },
    { "id": "AP011", "title": "Skill frontmatter", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "7.1", "url": "https://agent-plugins.org/specification#71-skills" }, { "section": "SKILL.md format and frontmatter", "url": "https://agentskills.io/specification#frontmatter" }] },
    { "id": "AP012", "title": "Skill fields", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "7.1", "url": "https://agent-plugins.org/specification#71-skills" }, { "section": "SKILL.md format and frontmatter", "url": "https://agentskills.io/specification#frontmatter" }] },
    { "id": "AP013", "title": "MCP JSON", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "7.2.1", "url": "https://agent-plugins.org/specification#721-discovery-and-configuration" }] },
    { "id": "AP014", "title": "MCP document shape", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "7.2.1", "url": "https://agent-plugins.org/specification#721-discovery-and-configuration" }] },
    { "id": "AP015", "title": "MCP schema version", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "7.2.1", "url": "https://agent-plugins.org/specification#721-discovery-and-configuration" }] },
    { "id": "AP016", "title": "Cross-file schema versions", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "10.1", "url": "https://agent-plugins.org/specification#101-specification-and-schema-versions" }] },
    { "id": "AP017", "title": "MCP transport schema", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "7.2.1; 9.2", "url": "https://agent-plugins.org/specification#721-discovery-and-configuration" }, { "section": "9.2", "url": "https://agent-plugins.org/specification#92-placeholder-expansion" }] },
    { "id": "AP018", "title": "Stdio command", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "7.2.1; 4.1", "url": "https://agent-plugins.org/specification#stdio" }] },
    { "id": "AP019", "title": "Stdio working directory", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "7.2.1; 9.2", "url": "https://agent-plugins.org/specification#stdio" }, { "section": "9.2", "url": "https://agent-plugins.org/specification#92-placeholder-expansion" }] },
    { "id": "AP020", "title": "Remote URL and headers", "classification": "normative", "outcome": "excluded", "reason": "Excluded by --rule AP006 selection.", "references": [{ "section": "7.2.1", "url": "https://agent-plugins.org/specification#streamable-http-and-legacy-httpsse" }] }
  ],
  "findings": [{ "ruleId": "AP006", "result": "passed", "path": "plugin.json#/name", "explanation": "Name must satisfy the official 1–64 character lowercase name constraints.", "boundary": "plugin" }],
  "inspection": {
    "evidence": [
      { "operation": "resolve", "subject": "./csharp-dotnet-development", "status": "succeeded", "detail": "Resolved the package root for static inspection." },
      { "operation": "discover", "subject": "plugin.json", "status": "succeeded", "detail": "Found the required root manifest." },
      { "operation": "read", "subject": "plugin.json", "status": "succeeded", "detail": "Read the manifest as UTF-8." },
      { "operation": "parse", "subject": "plugin.json", "status": "succeeded", "detail": "Parsed the manifest as a JSON object." },
      { "operation": "inspect", "subject": "skills", "status": "not_performed", "detail": "Not needed for --rule AP006." },
      { "operation": "inspect", "subject": "mcp.json", "status": "not_performed", "detail": "Not needed for --rule AP006." }
    ],
    "components": {
      "manifest": { "path": "plugin.json", "presence": "present", "inspection": "complete" },
      "standardSkills": { "path": "skills", "presence": "unknown", "inspection": "not_applicable" },
      "mcp": { "path": "mcp.json", "presence": "unknown", "inspection": "not_applicable" }
    },
    "extensionNamespaces": { "names": ["com.github.awesome-copilot"], "internalsValidated": false, "referencedPathsValidated": false, "statement": "Extension internals and referenced paths were not validated." },
    "mcpServers": { "declarations": [], "serversExecuted": false, "endpointsContacted": false, "statement": "MCP servers were not executed and declared endpoints were not contacted." }
  },
  "executionProblems": [],
  "scope": {
    "limitations": ["Static checks only; PASS is qualified and is not certification of full package or client conformance."],
    "untestedCapabilities": ["runtime execution", "endpoint behavior", "extension internals", "extension referenced paths"]
  },
  "summary": { "total": 20, "selected": 1, "passed": 1, "failed": 0, "notApplicable": 0, "excluded": 19, "unableToComplete": 0 },
  "determination": "limited_pass"
}
```

## Acceptance-scenario check

1. The component and extension sections qualify PASS, show absent standard
   components, list `com.github.awesome-copilot`, and state both extension limits.
2. Transport-specific outcomes distinguish HTTP applicability from stdio
   `not_applicable`; remote declarations retain endpoints while the MCP safety
   statement says they were not contacted.
3. All 20 rules are emitted; one has its actual result and 19 are `excluded`.
4. Inspection failures become `unable_to_complete` plus `executionProblems` and
   take exit-code precedence in terminal/v2.
5. Malformed `plugin.json` remains an AP003 `failed` outcome and exit 1 unless a
   separate selected outcome is `unable_to_complete`.
6. JSON v1 remains the default adapter; only `--json --report-version 2` selects
   v2, while report version 2 without `--json` is usage error 2.
