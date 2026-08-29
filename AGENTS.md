# Repository Guidelines

## Project Structure & Module Organization

This is a zero-dependency browser prototype. The root contains the entry page and static assets:

- `index.html` — page structure, task drawer, identity switcher, and create-task modal.
- `app.js` — DOM rendering and user interactions.
- `app-state.js` — task model, permissions, status transitions, timeline events, and `localStorage` persistence.
- `styles.css` — responsive black-and-white wireframe styling.
- `tests/state.test.js` — executable state-machine tests.
- `README.md` — local usage notes.

Keep domain behavior in `app-state.js`; keep DOM concerns in `app.js`. Do not add backend or framework dependencies without updating this guide.

## Build, Test, and Development Commands

There is no build step or package manager configuration. Serve the prototype locally with:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. Run the state tests on macOS with:

```bash
osascript -l JavaScript tests/state.test.js
```

The test command should finish with `state tests passed`.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, single-quoted JavaScript strings, and small named functions. Follow the existing ES5-compatible style (`var`, function declarations, and IIFEs). Use `camelCase` for JavaScript variables/functions, `UPPER_SNAKE_CASE` for constants, and kebab-case for CSS classes. Escape user-provided text before inserting it into HTML. Keep visible product copy in Simplified Chinese unless a bilingual label is intentional.

## Testing Guidelines

Add tests for every status transition, permission rule, persistence behavior, and edge case. Name tests after the behavior they prove, for example `publisher approval closes a task`. Prefer testing `app-state.js` directly and run the full test command before handoff. Manually check the empty list, long titles, mobile layout, identity switching, and refresh persistence in a browser.

## Commit & Pull Request Guidelines

No Git history is present in this workspace, so no existing commit convention can be confirmed. Use short imperative subjects such as `Add reopened task flow`. Pull requests should describe user-visible behavior, list verification commands, mention storage/schema changes, and include desktop/mobile screenshots for UI changes.

## Architecture & Configuration Notes

The browser is the only runtime. Tasks and the current user are stored under the app’s `localStorage` key; never store credentials or secrets there. All state-changing actions must pass through the permission checks in `app-state.js`.
