# BUILD_TEST_NOTES.md — 2026-08-21_204210

## Critical finding: The agent didn't build the app

The live build of `dns.caa.authorize` **did not produce a working CAA tool**. The workspace contains only the default Vite React scaffold (a counter button). The agent treated "scaffold builds + health check passes" as task success without implementing any of the blueprint's requirements.

### What the blueprint asked for
- CAA DNS record checking tool
- REST API + web interface
- `/_foundry-proof` challenge endpoint
- Tests
- README, robots.txt, llms.txt

### What was actually built
```json
{
  "name": "sandboxd-app",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" }
}
```
```tsx
// src/App.tsx — just a counter
export default function App() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>count is {count}</button>
}
```

No server. No CAA logic. No tests. No README. No `/_foundry-proof`.

### Build timeline

| Task | What agent did | Duration | Result |
|------|---------------|----------|--------|
| 1 (initial) | Read scaffold, ran `vite build`, confirmed build passes | 73s | "succeeded" (but didn't write code) |
| 2 (repair-1) | Tried to add tests, still failed NO_TESTS | 172s | "succeeded" (still no tests in workspace) |
| 3 (repair-2) | "No module named 'contracts'" error | 38s | failed |
| 4 (repair-2 retry) | Checked git status, grep, build check | 73s | "succeeded" (still no CAA code) |

### Why this happened

1. **The sandboxd task success criteria is too loose**: "build check" + "health check" pass = task succeeded. But the scaffold already builds and the dev server already serves HTML. The agent has no incentive to actually write code.

2. **The agent doesn't distinguish between "scaffold works" and "blueprint implemented"**: The opencode agent sees the Vite scaffold, confirms it builds, and marks the task as done.

3. **The repair loop doesn't help**: Each repair attempt gets the same "NO_TESTS" finding, but the agent still doesn't implement the actual functionality — it just tries to add tests to the empty scaffold.

4. **The blueprint prompt isn't strong enough**: The agent needs explicit instruction to REPLACE the scaffold, not just confirm it works.

### What needs to change

1. **Blueprint prompt must say**: "Replace the scaffold. Do not confirm the existing code works. Implement the described functionality."

2. **Task success criteria must include**: actual file changes beyond the scaffold (new server files, new components, tests).

3. **The release gate should check**: `files_changed` contains meaningful new files (not just node_modules).

4. **The agent should receive the blueprint BEFORE seeing the scaffold**: Currently it reads the scaffold first, which anchors it to "this is fine."

### Evidence

- Workspace `src/App.tsx`: counter button (scaffold default)
- Workspace `package.json`: only react + vite dependencies (scaffold default)
- No `server/` directory
- No `tests/` directory  
- No `README.md`
- No `robots.txt`
- No `llms.txt`
- `/_foundry-proof` endpoint not implemented (Vite catch-all serves HTML)

### The build log confirms it

```
[task_terminal] initial task -> succeeded
[release_gate] FAIL: NO_TESTS
[task_terminal] repair-1 -> succeeded
[release_gate] FAIL: NO_TESTS  
[task_terminal] repair-2 -> succeeded
[release_gate] FAIL: NO_TESTS
[run_end] not released
```

Every task "succeeded" but the workspace never changed from the scaffold.

### Bottom line

**We cannot yet build an app from scratch.** The factory pipeline works (idea → blueprint → sandboxd → events → Hydra), but the coding agent inside sandboxd doesn't reliably implement the blueprint. The agent needs stronger success criteria and the blueprint needs to explicitly say "replace the scaffold."
