#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { ChatCraftError } from "../core/index.js";
import { createToolRuntime, TOOL_DEFINITIONS, type ToolRuntime } from "../tools/index.js";

export function createChatCraftMcpServer(runtime: ToolRuntime = createToolRuntime()) {
  const server = new McpServer({
    name: "chatcraft",
    version: "0.1.0"
  });

  for (const definition of TOOL_DEFINITIONS) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.inputSchema
      },
      async (args) => {
        try {
          const structuredContent = await runtime.call(definition.name, args as Record<string, unknown>);
          return {
            content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
            structuredContent
          };
        } catch (error) {
          const structuredContent =
            error instanceof ChatCraftError
              ? { error: { code: error.code, message: error.message, details: error.details } }
              : { error: { code: "unexpected_error", message: error instanceof Error ? error.message : String(error) } };
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
            structuredContent
          };
        }
      }
    );
  }

  return server;
}

export async function runMcpServer() {
  const server = createChatCraftMcpServer();
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMcpServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
