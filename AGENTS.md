# ChatCraft Agent Notes

## Project Shape

ChatCraft is a tool-based `.3mf` project editor for conversational 3D printing workflows.

- `src/core`: TypeScript MVP core currently used by the CLI and MCP server.
- `src/tools`: AI-facing tool catalog and in-memory session runtime.
- `src/mcp`: stdio MCP server.
- `src/cli.ts`: local CLI.
- `crates/chatcraft-core`: Rust core implementation in progress.

Keep the LLM/tool boundary strict: AI clients call safe tools; core code owns 3MF parsing, validation, compatibility rules, mutation, history, diffs, and export.

## Documentation

- The ChatCraft wiki at https://github.com/eslutz/ChatCraft/wiki is the single source of truth for project documentation.
- Documentation changes, updates, and additions for this project should be made in the wiki project.
- Keep this repository focused on source files, tests, package manifests, workflows, and short pointer docs that need to live with the implementation.
- When implementation changes require documentation changes, update the relevant wiki page in `/Users/ericslutz/Developer/Code/ChatCraft.wiki` in the same change set.
- Repository docs in this checkout should link to the wiki for project-level setup, architecture, operations, testing, roadmap, security, compatibility, and cross-client integration behavior.

## Common Commands

TypeScript:

```bash
npm test
npm run check
npm run build
npm audit
```

Rust:

```bash
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

CLI smoke:

```bash
npm run cli -- summary path/to/project.3mf
```

MCP server:

```bash
npm run mcp
```

## Development Rules

- Prefer test-first changes for core behavior.
- Preserve unknown `.3mf` package entries unless a test proves a safe mutation.
- Reject unsafe ZIP paths, malformed inputs, unsupported values, and unmapped slicer metadata fail-closed.
- Do not make the AI adapter manipulate raw 3MF package contents directly.
- Keep repo docs short and use the wiki for durable project documentation.
- If changing CLI/MCP tool behavior, update `src/tools/index.ts` and adapter tests together.
- If changing Rust core behavior, keep parity with TypeScript MVP behavior or explicitly document the gap in the wiki.

## Publishing Notes

- Main repo: `https://github.com/eslutz/ChatCraft`
- Wiki repo: `https://github.com/eslutz/ChatCraft.wiki.git`
- Default source branch is `main`.
- Wiki branch is `master`.

Before claiming completion, run the relevant validation commands and check `git status --short --branch`.
