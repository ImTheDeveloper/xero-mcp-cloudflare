# Contributing

Thanks for your interest in improving this project.

## Development setup

1. Install dependencies:

```bash
npm install
```

2. Create local secrets file from template:

```bash
cp .dev.vars.example .dev.vars
```

3. Run checks:

```bash
npm run type-check
npm run test
```

4. Start local worker:

```bash
npm run dev
```

## Code and PR expectations

- Keep changes focused and small when possible.
- Add or update tests for behavior changes.
- Keep docs in `README.md` aligned with runtime behavior.
- Do not commit secrets, tokens, account IDs, or tenant data.

## Commit guidance

- Use clear commit messages that explain intent.
- Include verification notes for auth-flow changes.
