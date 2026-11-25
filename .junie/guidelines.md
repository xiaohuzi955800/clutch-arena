# Project guidelines

- Keep the game a static HTML/CSS/vanilla JavaScript site with zero dependencies and no build step. Do not add a framework or runtime package.
- Keep user-facing UI text in English.
- Follow the surrounding style: two-space indentation, semicolons, single-quoted JavaScript strings, `var` and IIFEs in the existing browser scripts, and small focused functions. Preserve existing naming and file organization.
- Keep gameplay deterministic where required for seeded duels. Treat local storage and cross-tab messages as untrusted; prefer safe DOM text APIs and validate data.
- Preserve accessibility and responsive behavior, including keyboard operation, visible focus, zoom and reduced-motion preferences.
- Run `node tests/test-logic.js` for logic changes; add focused regression coverage for affected behavior. Use real-browser checks for DOM, input, accessibility and cross-tab behavior that the Node logic tests do not cover.