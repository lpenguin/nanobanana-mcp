import { IncomingMessage, ServerResponse } from "node:http";
import { handleHttpRequest } from "../src/http-server.js";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleHttpRequest(req, res);
}
