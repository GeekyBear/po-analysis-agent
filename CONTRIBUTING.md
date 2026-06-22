# Contributing to PO Analysis Agent

Thank you for your interest in contributing! This document outlines the development workflow and guidelines.

## Branch Strategy

This project uses **Git Flow** with three main branches:

- **`main`** — Production releases only. Always stable and deployable.
- **`development`** — Integration branch for features and fixes. Base branch for all feature PRs.
- **`feature/*`** — Feature branches off `development` (e.g., `feature/invoice-validator`, `feature/aicore-provider`).

## Development Workflow

1. **Create a feature branch** off `development`:
   ```bash
   git checkout development
   git pull origin development
   git checkout -b feature/your-feature-name
   ```

2. **Make commits** with clear, descriptive messages:
   ```bash
   git commit -m "feat: add new matching rule for quantity thresholds"
   ```

3. **Push to your branch** and open a **Pull Request** against `development`:
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Tests must pass** before merging:
   ```bash
   npm test
   npm run test:coverage
   ```

5. **Merge into `development`** after review approval.

## Testing

All PRs require passing tests:

```bash
# Run unit and integration tests
npm test

# Check coverage
npm run test:coverage
```

New features should include tests in `test/po-analysis.test.js` or related test files.

## Release Process

When ready to release a stable version:

1. Create a PR from `development` into `main`
2. Ensure all tests pass and coverage is acceptable
3. Update version in `package.json` (semantic versioning: `major.minor.patch`)
4. Merge to `main`
5. Tag the release:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

## Code Guidelines

- Follow the existing code style (see `srv/` for examples)
- Keep matching rules deterministic and testable (see `srv/matching/three-way-match.js`)
- Document AI provider implementations in `srv/ai/`
- Update `docs/ADR.md` for architecture decisions

## Questions?

Feel free to open an issue for discussion before starting work on major features.
