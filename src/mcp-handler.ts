import { createMcpHandler } from "mcp-handler";
import { registerNanobananaTools, SERVER_INFO } from "./nanobanana.js";

export const handler = createMcpHandler(
  (server) => {
    registerNanobananaTools(server);
  },
  { serverInfo: SERVER_INFO },
  { basePath: "/api", disableSse: true }
);

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
