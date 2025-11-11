#!/usr/bin/env node

/**
 * Integration test for nanobanana-mcp server
 * Tests that the server can start and respond to MCP protocol requests
 * without actually executing any image operations
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting nanobanana-mcp integration test...\n');

// Test 1: Verify the build output exists
console.log('Test 1: Checking build output...');
const fs = require('fs');
const indexPath = path.join(__dirname, 'dist', 'index.js');
if (!fs.existsSync(indexPath)) {
  console.error('✗ Build output not found. Run "npm run build" first.');
  process.exit(1);
}
console.log('✓ Build output exists\n');

// Test 2: Start the server and test MCP protocol
console.log('Test 2: Testing MCP protocol...');
const server = spawn('node', [indexPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let timeout;
let serverStarted = false;

server.stdout.on('data', (data) => {
  output += data.toString();
  
  // Try to parse JSON response
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        if (response.result && response.result.tools) {
          console.log('✓ Server responded with tools list');
          console.log(`✓ Found ${response.result.tools.length} tools:\n`);
          
          response.result.tools.forEach(tool => {
            console.log(`  • ${tool.name}`);
            console.log(`    ${tool.description}`);
            console.log('');
          });
          
          console.log('✓ All integration tests passed!');
          clearTimeout(timeout);
          server.kill();
          process.exit(0);
        }
      } catch (e) {
        // Not JSON or incomplete, continue
      }
    }
  }
});

server.stderr.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('running on stdio')) {
    console.log('✓ Server started successfully');
    serverStarted = true;
    
    // Send list tools request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    };
    
    console.log('✓ Sending tools/list request\n');
    server.stdin.write(JSON.stringify(request) + '\n');
  } else {
    // Only show stderr if it's not the expected startup message
    if (!msg.includes('running on stdio')) {
      console.error('Server stderr:', msg);
    }
  }
});

server.on('error', (error) => {
  console.error('✗ Failed to start server:', error.message);
  process.exit(1);
});

server.on('exit', (code, signal) => {
  if (!serverStarted) {
    console.error('✗ Server exited before starting properly');
    console.error(`  Exit code: ${code}, Signal: ${signal}`);
    process.exit(1);
  }
});

// Timeout after 10 seconds
timeout = setTimeout(() => {
  console.error('✗ Server did not respond in time');
  console.error('  The server may have started but failed to respond to the tools/list request');
  server.kill();
  process.exit(1);
}, 10000);
