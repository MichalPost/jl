---
name: Test Runner
slug: test-runner
version: 1.0.0
description: Write and run tests across languages and frameworks.
---

# test-runner

Write and run tests across languages and frameworks.

## Framework Selection

| Language | Unit Tests | Integration | E2E |
|----------|-----------|-------------|-----|
| TypeScript/JS | Vitest (preferred), Jest | Supertest | Playwright |
| Python | pytest | pytest + httpx | Playwright |
| Swift | XCTest | XCTest | XCUITest |

## Quick Start by Framework

### Vitest (TypeScript / JavaScript)
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
})
```

```bash
npx vitest              # Watch mode
npx vitest run          # Single run
npx vitest --coverage   # With coverage
```

### Jest
```bash
npm install -D jest @types/jest ts-jest
```
