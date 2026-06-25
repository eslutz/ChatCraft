# ChatCraft

ChatCraft is a tool-based `.3mf` project editor for conversational 3D printing workflows.

The MVP keeps the LLM away from raw 3MF mutation. AI clients call safe tools exposed by ChatCraft; ChatCraft owns package parsing, validation, change history, diffs, and export.

Long-form documentation lives in the project wiki:

- https://github.com/eslutz/ChatCraft/wiki

## Local Development

```bash
npm install
npm test
npm run check
npm run build
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

The TypeScript package currently provides the CLI and MCP adapter. The Rust crate provides the emerging core implementation.

## CLI

```bash
npm run cli -- summary path/to/project.3mf
```

## MCP Server

```bash
npm run mcp
```
