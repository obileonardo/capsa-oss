// Sample inputs for on-device extraction (build-out Stage 2). Each fixture lists what the rules must find.
// `expect` is the list of candidates in order: type, a title test, and the exact words (or a start/end test).
// Written for these checks; none of it was captured from a real source.
export const FIXTURES = [
  {
    id: 'prompt-one-line',
    input: 'Act as a release reviewer. Before I deploy, list: 1) migrations that can’t be rolled back, 2) env vars that differ between staging and prod, 3) the single riskiest change. Ask me before assuming.',
    expect: [{ type: 'prompt', title: /^Act as a release reviewer$/, exactIsWhole: true }],
  },
  {
    id: 'prompt-role-multi-paragraph',
    input: 'You are a senior technical editor.\n\nRewrite the text I paste next so it is shorter and clearer.\n\nRules:\n- Keep my voice\n- No jargon\n- Never invent facts',
    expect: [{ type: 'prompt', title: /^You are a senior technical editor$/, exactIsWhole: true }],
  },
  {
    id: 'prompt-after-intro',
    input: 'Here’s the prompt I use for code reviews:\n\nReview this pull request like a staff engineer. Point out risky changes first, then naming, then missing tests.',
    expect: [{ type: 'prompt', title: /^Review this pull request like a staff engineer$/, exact: 'Review this pull request like a staff engineer. Point out risky changes first, then naming, then missing tests.' }],
  },
  {
    id: 'template-blanks-only',
    input: '[medium] of [subject], [lighting], in the style of [era or movement]',
    expect: [{ type: 'template', exactIsWhole: true, blanks: 4 }],
  },
  {
    id: 'prompt-with-blanks-is-template',
    input: 'Write a cold email to [name] at [company] about [offer]. Keep it under 120 words and end with one question.',
    expect: [{ type: 'template', title: /^Write a cold email to \[name\] at \[company\] about \[offer\]$/, exactIsWhole: true, blanks: 3 }],
  },
  {
    id: 'workflow-numbered',
    input: 'My release routine:\n1. Run the full test suite\n2. Bump the version number\n3. Write the release notes\n4. Tag the release and push',
    expect: [{ type: 'workflow', title: /^My release routine$/, exact: '1. Run the full test suite\n2. Bump the version number\n3. Write the release notes\n4. Tag the release and push' }],
  },
  {
    id: 'workflow-step-words',
    input: 'Step 1: Open the analytics dashboard\nStep 2: Export last week as CSV\nStep 3: Paste it into the weekly report',
    expect: [{ type: 'workflow', title: /^Open the analytics dashboard$/, exactIsWhole: true }],
  },
  {
    id: 'prompt-containing-steps',
    input: 'Review my pull request and check these in order:\n1. Tests cover the change\n2. Names are clear\n3. Nothing risky ships without a flag',
    expect: [{ type: 'prompt', exactIsWhole: true }],
  },
  {
    id: 'mcp-json-unfenced',
    input: '{\n  "mcpServers": {\n    "github": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"]\n    }\n  }\n}',
    expect: [{ type: 'mcp_server', title: /^github MCP server$/, exactIsWhole: true }],
  },
  {
    id: 'mcp-json-fenced-with-prose',
    input: 'Add this to your Claude config:\n\n```json\n{\n  "mcpServers": {\n    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/notes"] },\n    "memory": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-memory"] }\n  }\n}\n```\n\nThen restart Claude.',
    expect: [{ type: 'mcp_server', title: /^filesystem, memory MCP servers$/, exactStartsWith: '{\n  "mcpServers"', exactEndsWith: '}\n}' }],
  },
  {
    id: 'mcp-claude-add-command',
    input: '```\nclaude mcp add sentry -- npx -y @sentry/mcp-server\n```',
    expect: [{ type: 'mcp_server', title: /^sentry MCP server$/, exact: 'claude mcp add sentry -- npx -y @sentry/mcp-server' }],
  },
  {
    id: 'skill-md-unfenced',
    input: '---\nname: release-notes\ndescription: Draft release notes from merged pull requests since the last tag, grouped by type.\n---\n\n# Release notes\n\nWhen asked for release notes:\n1. List the merged pull requests\n2. Group them by type',
    expect: [{ type: 'skill', title: /^release-notes$/, exactIsWhole: true }],
  },
  {
    id: 'skill-md-fenced',
    input: 'Save this as SKILL.md:\n\n```markdown\n---\nname: tidy-imports\ndescription: Sort and group imports in the files you touch.\n---\nSort imports alphabetically within each group.\n```',
    expect: [{ type: 'skill', title: /^tidy-imports$/, exactStartsWith: '---\nname: tidy-imports' }],
  },
  {
    id: 'shell-command',
    input: 'Install it with:\n\n```bash\nnpx -y @acme/cli init --yes\n```',
    expect: [{ type: 'command', title: /^npx -y @acme\/cli init --yes$/, exact: 'npx -y @acme/cli init --yes' }],
  },
  {
    id: 'yaml-config',
    input: '```yaml\nrules:\n  - no-console\n  - prefer-const\n```',
    expect: [{ type: 'command_config', title: /^YAML config$/, exact: 'rules:\n  - no-console\n  - prefer-const' }],
  },
  {
    id: 'prompt-fenced-as-text',
    input: 'Paste this into ChatGPT:\n\n```\nYou are a careful copy editor. Fix grammar only and keep my wording.\n```',
    expect: [{ type: 'prompt', title: /^You are a careful copy editor$/, exact: 'You are a careful copy editor. Fix grammar only and keep my wording.' }],
  },
  {
    id: 'mixed-document-headings',
    input: '# My AI kit\n\n## Code review prompt\nReview this diff like a staff engineer and list the risks first.\n\n## Deploy steps\n1. Run the tests\n2. Deploy to staging\n3. Smoke test the main flows\n\n## Image template\n[subject] in [style], [lighting]',
    expect: [
      { type: 'prompt', title: /^Code review prompt$/, exact: 'Review this diff like a staff engineer and list the risks first.' },
      { type: 'workflow', title: /^Deploy steps$/, exact: '1. Run the tests\n2. Deploy to staging\n3. Smoke test the main flows' },
      { type: 'template', title: /^Image template$/, exact: '[subject] in [style], [lighting]' },
    ],
  },
  {
    id: 'labelled-prompts',
    input: 'Prompt 1: Summarise this article in five bullet points for a busy executive.\nPrompt 2: Rewrite the summary as a short thread with a strong opening line.',
    expect: [
      { type: 'prompt', exact: 'Summarise this article in five bullet points for a busy executive.' },
      { type: 'prompt', exact: 'Rewrite the summary as a short thread with a strong opening line.' },
    ],
  },
  {
    id: 'crlf-line-endings',
    input: 'Act as a patient maths tutor for a 12 year old.\r\n\r\nAsk one question at a time.',
    expect: [{ type: 'prompt', exact: 'Act as a patient maths tutor for a 12 year old.\n\nAsk one question at a time.' }],
  },
  {
    id: 'plain-note-nothing',
    input: 'Remember to look at the pricing page on Friday.',
    expect: [],
  },
  {
    id: 'short-imperative-nothing',
    input: 'Write tests.',
    expect: [],
  },
  {
    id: 'prompt-mode-description',
    mode: 'prompt',
    input: 'Cinematic still of a lighthouse at dusk, 35mm, soft haze',
    expect: [{ type: 'prompt', exactIsWhole: true }],
  },
  {
    id: 'prompt-mode-blanks',
    mode: 'prompt',
    input: 'A [colour] logo for [brand], flat, on white',
    expect: [{ type: 'template', exactIsWhole: true, blanks: 2 }],
  },
  // Track C (XEV-06): {{x}} blanks alongside [x]; model parameters kept as written
  {
    id: 'template-curly-blanks',
    input: 'Write a launch tweet for {{product}} aimed at {{ audience }}. Keep it under 200 characters.',
    expect: [{ type: 'template', title: /^Write a launch tweet for \{\{product\}\}/, exactIsWhole: true, blanks: 2 }],
  },
  {
    id: 'template-mixed-blanks',
    input: '[subject] photographed by {{photographer}}, golden hour',
    expect: [{ type: 'template', exactIsWhole: true, blanks: 2 }],
  },
  {
    id: 'github-actions-not-blanks',
    input: '```yaml\nenv:\n  TOKEN: ${{ secrets.TOKEN }}\n```',
    expect: [{ type: 'command_config', exact: 'env:\n  TOKEN: ${{ secrets.TOKEN }}', blanks: 0 }],
  },
  {
    id: 'image-prompt-with-params',
    input: 'Here is my lighthouse prompt:\n\nA lighthouse at dusk, volumetric fog, 35mm film --ar 16:9 --v 6 --no people, boats',
    expect: [{ type: 'prompt', title: /^A lighthouse at dusk, volumetric fog, 35mm film$/, exact: 'A lighthouse at dusk, volumetric fog, 35mm film --ar 16:9 --v 6 --no people, boats' }],
  },
];

// Link titles and sites, read from the address only (nothing is fetched).
export const LINKS = [
  { url: 'https://github.com/demo-org/release-notes-skill', kind: 'github', title: 'demo-org/release-notes-skill', host: 'github.com' },
  { url: 'https://github.com/demo-org/skills/blob/main/tidy/SKILL.md', kind: 'github', title: 'demo-org/skills · tidy/SKILL.md', host: 'github.com' },
  { url: 'https://www.youtube.com/watch?v=abc123', kind: 'video', title: 'YouTube video', host: 'youtube.com' },
  { url: 'https://x.com/someone/status/123456', kind: 'x', title: 'Post by @someone', host: 'x.com' },
  { url: 'https://example.com/blog/how-i-review-pull-requests', kind: 'article', title: 'How i review pull requests', host: 'example.com' },
  { url: 'https://example.com/', kind: 'article', title: 'example.com', host: 'example.com' },
];
