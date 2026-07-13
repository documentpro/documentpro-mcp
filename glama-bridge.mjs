#!/usr/bin/env node
/**
 * glama-bridge.mjs
 *
 * Purpose: Glama's quality-scoring pipeline clones this repo and runs a
 * `CMD arguments` command inside a container to start "the server" so it
 * can inspect tool definitions and run coherence checks. Our real MCP
 * server isn't in this repo -- it's remote, at DOCUMENTPRO_MCP_URL
 * (https://api.documentpro.ai/mcp), reached over streamable HTTP with an
 * x-api-key header.
 *
 * This script bridges the two: it opens a client connection to the remote
 * DocumentPro MCP server, then re-exposes that same server over stdio so
 * Glama's container (and anything else that expects a local stdio MCP
 * server) can talk to it.
 *
 * Run it with:
 *   node glama-bridge.mjs
 *
 * Required env vars:
 *   DOCUMENTPRO_API_KEY  - a DocumentPro API key (real, or a scoped test
 *                           key if you have one -- Glama needs the server
 *                           to actually start to run its checks)
 * Optional env vars:
 *   DOCUMENTPRO_MCP_URL  - defaults to https://api.documentpro.ai/mcp
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { proxyServer } from "mcp-proxy";

const MCP_URL = process.env.DOCUMENTPRO_MCP_URL ?? "https://api.documentpro.ai/mcp";
const API_KEY = process.env.DOCUMENTPRO_API_KEY;

if (!API_KEY) {
  console.error(
    "[glama-bridge] Missing DOCUMENTPRO_API_KEY env var. Set it in Glama's " +
      "'Placeholder parameters' field (Dockerfile admin page) so the build " +
      "check can start this server."
  );
  process.exit(1);
}

async function main() {
  // 1. Connect out to the real, remote DocumentPro MCP server.
  const client = new Client(
    { name: "documentpro-mcp-glama-bridge", version: "1.0.0" },
    { capabilities: {} }
  );

  const clientTransport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: {
        "x-api-key": API_KEY,
      },
    },
  });

  await client.connect(clientTransport);
  console.error(`[glama-bridge] Connected to ${MCP_URL}`);

  // 2. Re-expose that connection over stdio, so a local process (Glama's
  //    container, mcp-proxy, an MCP inspector, etc.) can talk to it as if
  //    it were a normal local stdio MCP server.
  //
  // The stdio side must advertise the REMOTE server's capabilities:
  // proxyServer() only registers tool/resource/prompt handlers for
  // capabilities present on `serverCapabilities`, so passing {} here
  // would expose a server with no tools.
  const remoteCapabilities = client.getServerCapabilities() ?? {};

  // `completions` must be declared even though the remote server doesn't
  // support it: mcp-proxy registers its completion/complete handler
  // unconditionally, and SDK >=1.13 refuses that unless the capability is
  // advertised. If a client ever calls it, the remote returns method-not-found.
  const server = new Server(
    { name: "documentpro-mcp", version: "1.0.0" },
    { capabilities: { ...remoteCapabilities, completions: {} } }
  );

  await proxyServer({ server, client, serverCapabilities: remoteCapabilities });

  const serverTransport = new StdioServerTransport();
  await server.connect(serverTransport);

  console.error("[glama-bridge] Bridging remote DocumentPro MCP server over stdio.");
}

main().catch((error) => {
  console.error("[glama-bridge] Fatal error:", error);
  process.exit(1);
});
