# Contributing to AgroLens

## Getting started

```bash
corepack enable
pnpm install
pnpm --filter @agrolens/contracts build
```

## Development workflow

1. Create a branch from `main`.
2. Make focused changes; follow YAGNI — smallest correct solution, no speculative
   abstractions.
3. API type changes start in `packages/contracts` (Zod schema first, types inferred).
   Update `apps/api` validation and `apps/web` consumers in the same PR. Mobile
   callers (`apps/mobile/lib`) updated where envelopes/pagination changed.
4. Validate before pushing:

```bash
pnpm turbo run lint typecheck test build
```

plus the affected project's e2e/unit gates listed in `AGENTS.md`.

## Release checks

Run `pnpm install --frozen-lockfile`, `pnpm run format:check`,
`pnpm turbo run lint typecheck test build`, and
`pnpm --filter @agrolens/api config:drift`. Web tests need Chromium (`CHROME_BIN`);
see [the web guide](apps/web/README.md). Validate production Compose with
`docker compose -f deploy/production/docker-compose.prod.yml --env-file deploy/production/.env.example config --quiet`.
Run `flutter analyze && flutter test` from `apps/mobile` and
`python -m pytest tests/ -v` from `services/inference` after installing its test requirements.
Confirm CI, including backend/browser E2E and the production-image build, before deployment.
The browser E2E workflow requires the `E2E_ADMIN_PASSWORD` repository secret.
See the [mobile guide](apps/mobile/README.md#release-readiness) for signed release builds.

## Conventions

- TypeScript strict; Prettier (`printWidth: 100`, single quotes) + ESLint flat config.
- Commit messages: conventional-ish, imperative (`feat:`, `fix:`, `refactor:`,
  `docs:`, `chore:`). Keep commits reviewable.
- Never commit `.env` files, secrets, signing keys, build output, or local auth state.
- Web UI changes must preserve existing user-facing appearance unless the PR
  explicitly declares a visual change.
- Backend schema changes require a generated `apps/api/drizzle/` migration in the
  same PR (inspect it; do not hand-write SQL only).

## Pull requests

- Describe behavior change, validation run, and any migration/ops notes.
- CI (`ci.yml`, `mobile.yml`, `inference.yml`) must be green.
