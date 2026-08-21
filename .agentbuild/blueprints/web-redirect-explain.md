# Blueprint: web.redirect.explain

## What to build

Resolve a URL's redirect chain and explain each transition structurally: status code, location target, HTTP→HTTPS movement, host changes, loops and final canonical destination.

## Pain replaced

curl -I, browser DevTools, redirect-checker websites, manual inspection.

## Technical requirements

- React + Vite frontend (sandbox default)
- Node.js backend API on the same port
- Include README.md, robots.txt, sitemap.xml, llms.txt
- Include at least one test for core deterministic behavior
- Bind dev server to 0.0.0.0 on the sandbox-provided port
- Semantic accessible HTML
- Never hardcode credentials

## Invariant

Build the complete tool. Include tests. Deploy preview.

## Deterministic success checks

- The app builds without errors
- The preview URL serves a working page
- Core functionality is implemented (not just a shell)
