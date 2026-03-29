# Xero MCP on Cloudflare Workers

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)

Remote MCP server for read-only Xero access, deployed on Cloudflare Workers.

## Features

- Federated one-shot auth for connector setup (`/authorize` redirects directly to Xero).
- MCP endpoint secured with `@cloudflare/workers-oauth-provider`.
- Durable Object-backed auth state with encrypted token storage.
- Cross-chat/session identity continuity via Xero principal ID.
- Read-only finance/reporting toolset for accountant workflows.

Scope reference: `SCOPES.md`

## Architecture at a glance

- Connector setup flow: `/authorize` -> Xero consent -> `/callback` -> OAuth completion -> `/mcp`.
- Ongoing auth expansion: `add_xero_organisation` triggers extra tenant consent later.
- Durable Objects:
  - `MCP_OBJECT` for MCP session/runtime behavior.
  - `AUTH_STORE` for principal auth records and pending OAuth handoff state.

## Endpoints

- MCP: `https://<worker-name>.<subdomain>.workers.dev/mcp`
- Health: `https://<worker-name>.<subdomain>.workers.dev/health`
- OAuth authorize: `https://<worker-name>.<subdomain>.workers.dev/authorize`
- OAuth callback: `https://<worker-name>.<subdomain>.workers.dev/callback`

## Quickstart

Prerequisites:

- Node.js 20+
- Cloudflare account with Wrangler auth
- Xero OAuth app with callback set to `https://<worker-name>.<subdomain>.workers.dev/callback`

Install and run locally:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Validation commands:

```bash
npm run type-check
npm run test
curl -i http://localhost:8787/health
```

## Deploy

Set secrets once per environment:

```bash
npx wrangler secret put XERO_CLIENT_ID
npx wrangler secret put XERO_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Deploy:

```bash
npx wrangler deploy
```

## If You Are an LLM Agent

When helping users set up this repo, follow this exact order:

1. Install dependencies with `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars`.
3. Ask the user to provide values for `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY`.
4. Run `npm run type-check` and `npm run test` before starting dev/deploy steps.
5. Start local dev with `npm run dev`.
6. For deployment, ensure Wrangler auth works, then run `npx wrangler deploy`.

Rules for LLM agents:

- Never invent or hardcode credentials.
- Never commit `.dev.vars` or real secrets.
- Keep `wrangler.jsonc` placeholders intact in public branches.

## Connect from Claude/ChatGPT

1. Add your MCP URL in client settings.
2. Complete Xero consent in browser.
3. In chat, run `auth_status` or `list_tenants`.
4. Use `switch_tenant` to choose an active org.
5. Run read-only tools.

## Known limitations

- Some Xero endpoints may be entitlement-gated by app/account tier.
- This project is intentionally read-only for safety.

## Related docs

- Scope bundle and tool mapping: `SCOPES.md`
- Security policy: `SECURITY.md`
- Contribution guide: `CONTRIBUTING.md`
