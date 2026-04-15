#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

console.log('Starting nanobanana-mcp integration test...\n');

const indexPath = path.join(__dirname, 'dist', 'index.js');

function waitForOutput(stream, matcher, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}. Output so far:\n${output}`));
    }, timeoutMs);

    const onData = (chunk) => {
      output += chunk.toString();
      if (matcher.test(output)) {
        cleanup();
        resolve(output);
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      stream.off('data', onData);
    };

    stream.on('data', onData);
  });
}

async function testStdioTransport() {
  console.log('Test 2: Testing stdio transport...');

  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js'),
  ]);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [indexPath],
    cwd: __dirname,
    stderr: 'pipe',
  });

  const stderrChunks = [];
  if (transport.stderr) {
    transport.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk.toString());
    });
  }

  const client = new Client({ name: 'integration-test-stdio', version: '1.0.0' });
  await client.connect(transport);
  const result = await client.listTools();

  assert.equal(result.tools.length, 3, 'Expected exactly 3 tools over stdio');
  const toolNames = result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ['composite_images', 'edit_image', 'generate_image']);

  const generateTool = result.tools.find((tool) => tool.name === 'generate_image');
  assert.ok(generateTool, 'generate_image tool should exist');
  assert.ok(generateTool.inputSchema.properties.googleToken, 'generate_image should require googleToken');

  await client.close();

  console.log('✓ Server responded over stdio');
  console.log(`✓ Found tools: ${toolNames.join(', ')}`);
  console.log('✓ generate_image exposes googleToken\n');

  const stderrOutput = stderrChunks.join('');
  assert.match(stderrOutput, /running on stdio/i, 'Expected stdio startup log');
}

async function testHttpTransport() {
  console.log('Test 3: Testing HTTP transport...');

  const port = 3100;
  const server = spawn('node', [indexPath, '--http', '--port', String(port)], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForOutput(server.stderr, /running on http:\/\/127\.0\.0\.1:3100\/api\/mcp/i, 15000, 'HTTP startup');

    const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
      import('@modelcontextprotocol/sdk/client/index.js'),
      import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
    ]);

    const client = new Client({ name: 'integration-test-http', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/api/mcp`));

    await client.connect(transport);
    const result = await client.listTools();

    assert.equal(result.tools.length, 3, 'Expected exactly 3 tools over HTTP');
    assert.ok(result.tools.every((tool) => tool.inputSchema.properties.googleToken), 'Each HTTP tool should expose googleToken');

    await client.close();
    console.log('✓ Server responded over HTTP');
    console.log('✓ All HTTP tools expose googleToken\n');
  } finally {
    server.kill();
  }
}

(async () => {
  console.log('Test 1: Checking build output...');
  if (!fs.existsSync(indexPath)) {
    console.error('✗ Build output not found. Run "npm run build" first.');
    process.exit(1);
  }
  console.log('✓ Build output exists\n');

  await testStdioTransport();
  await testHttpTransport();

  console.log('✓ All integration tests passed!');
})().catch((error) => {
  console.error('✗ Integration test failed:', error.message);
  process.exit(1);
});
