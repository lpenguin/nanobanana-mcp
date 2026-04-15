#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerNanobananaTools, SERVER_INFO } from "./nanobanana.js";
import { startHttpServer } from "./http-server.js";

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return undefined;
  }

  return args[index + 1];
}

async function runStdioServer(): Promise<void> {
  const server = new McpServer(SERVER_INFO);
  registerNanobananaTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Nanobanana MCP Server running on stdio");
  console.error("Google token must be provided as a tool argument");
}

async function runHttpServer(args: string[]): Promise<void> {
  const port = Number.parseInt(getFlagValue(args, "--port") ?? process.env.PORT ?? "3000", 10);
  const host = getFlagValue(args, "--host") ?? process.env.HOST ?? "127.0.0.1";

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("Invalid port. Use --port <number>.");
  }

  await startHttpServer(port, host);
  console.error(`Nanobanana MCP Server running on http://${host}:${port}/api/mcp`);
  console.error("Google token must be provided as a tool argument");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--http")) {
    await runHttpServer(args);
    return;
  }

  await runStdioServer();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
