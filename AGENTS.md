# Tangerine Reading Companion · Codex Agent Instructions

## Positioning

This repository is a local-first personal reading companion built with Vite, React 19, Dexie.js and Leaflet. It is a static frontend with no backend. It preserves reading progress, reader-confirmed memories and personal map positions while enforcing spoiler boundaries.

## Required reading

Before code changes, inspect the current branch, working tree and latest commit, then read:

- `docs/system-capabilities.md` for implemented scope and non-goals.
- `docs/data-sync.md` before changing IndexedDB, backup, import or migration behavior.
- `docs/product-and-architecture.md` before changing books, progress, maps, OCR or spoiler controls.
- `docs/model-prompts.md` before changing prompts or model data permissions.

## Hard boundaries

- Do not change the Dexie schema version unless the user explicitly requests it.
- Backup import is merge-by-key. Missing local records remain; do not implement clear-and-replace.
- Do not persist pasted excerpts, screenshots, OCR text, model contents or spoiler authorization.
- Formal packages use staging, preview and explicit apply. Do not publish unaudited facts or guess reveal boundaries.
- Fictional or ambiguous places must not receive fabricated precise coordinates.
- Runtime models may create bounded candidates and explanations only; they cannot publish formal facts.
- API keys remain in session storage and must not enter exports, logs or source control.

## Verification

Use Node.js `>=20.19.0`. Run checks relevant to the change:

```bash
npm run lint
npm test
npm run build
git diff --check
```

For package work also run `npm run check:packages`; use `npm run check:preset` before a formal apply.

## Documentation and delivery

- README is the authoritative command and structure map.
- Topic documents describe current behavior, provenance, active constraints and unresolved decisions.
- Generated reports belong in ignored `artifacts/`.
- Avoid transition diaries; Git history records implementation history.
- After a verified development batch, commit and push the scoped branch, report branch, commit and PR status, and include a short next step.
