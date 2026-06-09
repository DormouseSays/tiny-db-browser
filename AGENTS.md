<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Always add unit test coverage when creating new files or adding large sections to existing files.

Assume a dev server is already running when attempting to test functionality. Only start a new dev server if you don't find one running on port 3000.

## Testing

- Unit/component tests: Vitest (`npm test`). Lives under `src/**`.
- End-to-end tests: Playwright (`npm run test:e2e`, or `npm run test:e2e:ui`). Lives under `e2e/`. The config starts (or reuses) the dev server on port 8000 and a global setup seeds a fixture SQLite database in `e2e/fixtures/` that the tests upload, so a run never depends on the contents of `.data` or the configured presets.