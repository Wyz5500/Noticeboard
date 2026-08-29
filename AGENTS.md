# Repository Guidelines

## Project Structure & Module Organization

This is a zero-dependency browser prototype. The browser is the only runtime; there is no package manager, build step, backend, or framework.

- `index.html` — page structure, navigation, task board, identity switcher, detail drawer, and create-task modal.
- `app.js` — DOM rendering, hash-route synchronization, form handling, style selection, and user interactions.
- `app-state.js` — task model, demo users, permissions, status transitions, timeline events, route helpers, filtering, and task `localStorage` persistence.
- `style-preferences.js` — visual-style registry, token validation, style preference persistence, and CSS custom-property application.
- `style-configs/*.js` — one complete visual-style configuration per file. See `style-configs/README.md` before adding a style.
- `styles.css` — shared layout, component styles, responsive rules, accessibility states, and style-specific decoration rules.
- `tests/state.test.js` — state-machine, permissions, route, filtering, and task persistence tests.
- `tests/style.test.js` — style registry, token contract, persistence, page wiring, and theme CSS tests.
- `README.md` — user-facing setup, behavior, storage, and verification notes.

Keep domain behavior in `app-state.js` and DOM concerns in `app.js`. Keep visual preference behavior in `style-preferences.js` and theme values in `style-configs/`. Do not add backend, framework, package, or network-font dependencies without updating this guide and the README.

## Development and Verification Commands

There is no build step. Serve the prototype locally with:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. For the complete automated check, run from the repository root on macOS:

```bash
osascript -l JavaScript tests/state.test.js
osascript -l JavaScript tests/style.test.js
git diff --check
```

The test commands should finish with `state tests passed` and `style tests passed`. After UI or interaction changes, manually check the empty list, long titles, mobile layout, identity switching, style switching, refresh persistence, task drawer, create-task modal, and Escape-key dismissal in a browser.

## Coding Style & Naming Conventions

Application JavaScript uses two-space indentation, semicolons, single-quoted strings, small named functions, `var`, function declarations, and IIFEs to preserve the existing ES5-compatible style. Use `camelCase` for JavaScript variables and functions, `UPPER_SNAKE_CASE` for constants, and kebab-case for CSS classes. Test files may use the syntax already supported by the macOS JavaScriptCore runner.

Escape user-provided text before inserting it into HTML. Keep visible product copy in Simplified Chinese unless a bilingual label is intentional. Preserve the existing script load order in `index.html`: state, style registry, all style configurations, then the app.

## State, Permissions, and Storage

All task state changes must pass through the permission checks in `app-state.js`; do not duplicate permission rules in DOM handlers. The current workflow is:

`未开始` → `进行中` → `已完成` → `关闭`

From `已完成`, the publisher can either approve and close the task or reopen it. A `重新打开` task can be accepted again by any known user, or closed directly by its publisher. Any known user can publish a task; the current assignee alone can mark an in-progress task complete; only the publisher can approve, reopen, or close their task.

Task state and current user are stored as JSON under `minecraft-guild-board-state`. The visual preference is independent and stored under `minecraft-guild-board-style`; invalid or missing style IDs fall back to `swiss-international`. Never store credentials, tokens, or secrets in `localStorage`.

The “mine” scope is based on the last valid actor in the task timeline, not only on `task.assignee`. If a state schema changes, update its load fallback, related tests, and the README storage notes together.

## Testing Guidelines

Add tests for every new status transition, permission rule, route behavior, filtering rule, persistence behavior, style token, and relevant edge case. Name tests after the behavior they prove, for example `publisher approval closes a task`. Prefer testing domain behavior directly through `app-state.js` or `style-preferences.js`; use string-level page and CSS assertions only for integration contracts already covered by the existing style tests. Run both test files and `git diff --check` before handoff.

## Documentation and Change Guidelines

Update `README.md` when user-visible behavior, commands, storage keys, supported styles, or project structure changes. Update `style-configs/README.md` when the style configuration contract or theme-authoring constraints change. Keep this file aligned with the actual module boundaries, test commands, and persistence model.

## Commit and Pull Request Guidelines

Use short imperative commit subjects, such as `Add reopened task flow`. Pull requests should describe user-visible behavior, list verification commands, mention storage or schema changes, and include desktop/mobile screenshots for UI changes. Do not include screenshots for documentation-only changes unless they clarify a related behavioral change.

## Safety and Scope

Preserve unrelated work in the working tree. Avoid destructive commands and broad file operations. Keep changes within the requested scope, and do not introduce external services or dependencies without explicit documentation and review.
