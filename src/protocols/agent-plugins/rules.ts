import type { Rule } from '../../core/report.js';

const spec = 'https://agent-plugins.org/specification';
const definitions = [
  ['AP001', 'Manifest discovery', 'Find a regular plugin.json at the supplied directory root.', '5.1', '51-location-and-loading'],
  ['AP002', 'Package containment', 'Filesystem-resolved paths inspected by AIAgentConform stay inside the plugin root.', '4.1', '41-general-requirements'],
  ['AP003', 'Manifest JSON', 'Parse plugin.json as a JSON object.', '5.2', '52-manifest-object'],
  ['AP004', 'Required manifest fields', 'Require non-empty string $schema and name fields.', '5.3', '53-required-fields'],
  ['AP005', 'Manifest schema version', 'Recognize the exact canonical 1.0.0 manifest schema identifier locally.', '5.2', '52-manifest-object'],
  ['AP006', 'Plugin name', 'Validate the manifest name length, characters, boundaries, and repetitions.', '5.5', '55-plugin-name-constraints'],
  ['AP007', 'Manifest metadata', 'Validate optional portable metadata against the official schema, without extra format constraints.', '5.4', '54-metadata-fields'],
  ['AP008', 'Unknown manifest fields', 'Report every unknown top-level field; ignore it when discovering components.', '5.2', '52-manifest-object'],
  ['AP009', 'Extensions container', 'Report a non-object extensions field but continue discovery; leave unimplemented namespace values opaque.', '8.1', '81-manifest-extension-data'],
  ['AP010', 'Fixed component locations', 'Allow absent components; require skills to be a directory and mcp.json a regular file when present.', '6.1–6.2', '6-component-discovery'],
  ['AP011', 'Skill frontmatter', 'Discover immediate child SKILL.md files only and parse their YAML frontmatter as a mapping.', '7.1', '71-skills'],
  ['AP012', 'Skill fields', 'Validate required skill name/description and documented optional field types and lengths.', '7.1', '71-skills'],
  ['AP013', 'MCP JSON', 'Parse root mcp.json as a JSON object.', '7.2.1', '721-discovery-and-configuration'],
  ['AP014', 'MCP document shape', 'Require $schema and an object mcpServers; reject other top-level fields independently of server entries.', '7.2.1', '721-discovery-and-configuration'],
  ['AP015', 'MCP schema version', 'Recognize the exact canonical 1.0.0 MCP schema identifier locally.', '7.2.1', '721-discovery-and-configuration'],
  ['AP016', 'Cross-file schema versions', 'Require matching specification versions in plugin.json and mcp.json schema identifiers.', '10.1', '101-specification-and-schema-versions'],
  ['AP017', 'MCP transport schema', 'Validate each closed transport variant, including reserved env names and cwd syntax, using the official server schema.', '7.2.1; 9.2', '721-discovery-and-configuration'],
  ['AP018', 'Stdio command', 'Require one bare executable token or a contained ./ path; never expand command placeholders.', '7.2.1; 4.1', 'stdio'],
  ['AP019', 'Stdio working directory', 'Check cwd forms and containment after single-pass plugin placeholder expansion; data-root filesystem checks are incomplete without client context.', '7.2.1; 9.2', 'stdio'],
  ['AP020', 'Remote URL and headers', 'Validate HTTP(S) endpoint restrictions and HTTP header syntax and case-insensitive uniqueness without expansion.', '7.2.1', 'streamable-http-and-legacy-httpsse'],
] as const;

export const rules: Rule[] = definitions.map(([id, title, explanation, section, anchor]) => ({
  id,
  title, explanation, category: 'conformance',
  references: [
    { section, url: `${spec}#${anchor}` },
    ...(['AP011', 'AP012'].includes(id) ? [{ section: 'SKILL.md format and frontmatter', url: 'https://agentskills.io/specification#frontmatter' }] : []),
    ...(['AP017', 'AP019'].includes(id) ? [{ section: '9.2', url: `${spec}#92-placeholder-expansion` }] : []),
  ],
}));
