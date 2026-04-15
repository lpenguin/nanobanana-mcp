import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { handler } from "./mcp-handler.js";

function toHeaders(source: IncomingMessage["headers"]): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    headers.set(key, value);
  }

  return headers;
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function getRequestUrl(req: IncomingMessage, fallbackHost: string): string {
  const protocolHeader = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader;
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  return `${protocol ?? "http"}://${host ?? fallbackHost}${req.url ?? "/"}`;
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const stream = Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>);
    stream.on("error", reject);
    res.on("finish", resolve);
    res.on("error", reject);
    stream.pipe(res);
  });
}

export async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  fallbackHost = "127.0.0.1:3000"
): Promise<void> {
  if (!req.url?.startsWith("/api/mcp")) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const body = await readRequestBody(req);
    const requestInit: RequestInit & { duplex?: "half" } = {
      method: req.method,
      headers: toHeaders(req.headers),
    };

    if (body) {
      requestInit.body = body;
      requestInit.duplex = "half";
    }

    const request = new Request(getRequestUrl(req, fallbackHost), requestInit);
    const response = await handler(request);
    await writeResponse(res, response);
  } catch (error) {
    console.error("HTTP transport error:", error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

export async function startHttpServer(port: number, host: string): Promise<Server> {
  const fallbackHost = `${host}:${port}`;
  const server = createServer((req, res) => {
    void handleHttpRequest(req, res, fallbackHost);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}
