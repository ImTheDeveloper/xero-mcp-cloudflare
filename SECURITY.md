# Security Policy

## Supported scope

This repository contains a Cloudflare Worker MCP server and OAuth integration code.

## Reporting a vulnerability

Please do not open public issues for security-sensitive problems.

- Report privately to the maintainers through your normal private channel.
- Include reproduction steps, impact, and affected files/endpoints.

## Secret handling requirements

- Never commit real credentials (`XERO_CLIENT_SECRET`, API tokens, encryption keys).
- Use `.dev.vars` locally and `wrangler secret put` for deployed environments.
- Rotate secrets immediately if accidental exposure is suspected.
