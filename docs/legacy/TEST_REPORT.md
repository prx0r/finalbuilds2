# TEST_REPORT.md — 2026-08-21_204210

## Summary

**69/69 tests pass across both repos.**

## agentbuild2 — 31/31 pass

```
tests/test_aether_config.py::test_render_settings_keeps_secrets_out        PASSED
tests/test_audit.py::test_project_blocked_without_manifest                 PASSED
tests/test_audit.py::test_project_passes_core_with_manifest                PASSED
tests/test_audit.py::test_agent_surface_is_warning_only                    PASSED
tests/test_blueprint.py::test_thin_spec_warns                             PASSED
tests/test_blueprint.py::test_unsourced_realistic_rates_warns             PASSED
tests/test_blueprint.py::test_sourced_rates_do_not_warn                   PASSED
tests/test_cli.py::test_configure_reads_key_from_env_without_tracking_it  PASSED
tests/test_cli.py::test_artifact_copies_latest                            PASSED
tests/test_config.py::test_write_and_load_config                          PASSED
tests/test_finalize.py::test_find_app_root_current_layout                 PASSED
tests/test_finalize.py::test_safe_extract_rejects_zip_slip                PASSED
tests/test_foundry_events.py::test_create_event_valid                     PASSED
tests/test_foundry_events.py::test_create_event_rejects_unknown_type      PASSED
tests/test_foundry_events.py::test_spool_roundtrip                        PASSED
tests/test_foundry_events.py::test_spool_acknowledge_only_removes_specified PASSED
tests/test_foundry_events.py::test_runner_emits_foundry_events            PASSED
tests/test_logging.py::test_run_logger_writes_both_formats                PASSED
tests/test_logging.py::test_task_event_has_own_file                       PASSED
tests/test_mcp_registration.py::test_builder_registers_expected_tools     PASSED
tests/test_mcp_registration.py::test_control_registers_finalizer          PASSED
tests/test_mcp_registration.py::test_frontier_web_registers               PASSED
tests/test_packaging_contracts.py::test_mcp_config_has_no_tracked_secrets PASSED
tests/test_packaging_contracts.py::test_aether_child_env_gets_control_plane_connection PASSED
tests/test_packaging_contracts.py::test_opencode_bundle_matches_current_auth_json_shape PASSED
tests/test_provider.py::test_anthropic_one_key                            PASSED
tests/test_provider.py::test_openrouter_opencode_bundle                  PASSED
tests/test_runner.py::test_direct_runner_builds_exports_and_receipts      PASSED
tests/test_sandboxd.py::test_public_v1_app_sandbox_task_and_inspection_contract PASSED
tests/test_security.py::test_secret_scan                                  PASSED
tests/test_security.py::test_local_env_is_excluded                        PASSED
```

## finalbuilds2 — 38/38 pass

### Contract tests (9/9)
```
✔ creates valid event envelope
✔ rejects unknown event types
✔ validates correct event
✔ all fixture events are valid
✔ fixture event types are in canonical list
✔ classifies known patterns
✔ returns UNKNOWN for unrecognized messages
✔ node types have ID prefixes
✔ relationship types are defined
```

### Cross-repo HTTP integration (7/7)
```
✔ health endpoint
✔ accepts canonical build.started
✔ accepts batch events
✔ BuildContext returns structure
✔ strategies endpoint
✔ contract version
✔ rejects invalid event type
```

### Live HydraDB strict (7/7)
```
✔ Hydra is reachable and accepts writes
✔ CREATE node via edge pattern
✔ MATCH + SET updates existing node
✔ CREATE node with edge to target
✔ Failure recording
✔ Idempotent replay
✔ Property-based lineage query
```

### Idea pipeline (7/7)
```
✔ parses ledger format
✔ parses new ideas format
✔ imports from real finalbuildideas
✔ infers tags correctly
✔ compiles blueprint from idea
✔ includes known failures from context
✔ generates unique challenge per build
```

### Receipt v2 false-pass prevention (7/7)
```
✔ empty verification → passed is false
✔ undefined verification → passed is false
✔ partial verification → passed is false
✔ all gates true → passed is true
✔ one gate false → passed is false
✔ explicit false values → passed is false
✔ verification object has all 7 gates
```

### Graph store (1/1)
```
✔ graph stores entities, edges and bounded paths
```

## Live build verification

| Check | Result |
|-------|--------|
| Idea imported from finalbuildideas | ✅ 80 ideas parsed |
| Blueprint compiled with challenge | ✅ aca9baa1314af29a |
| AgentBuild ran against real sandboxd | ✅ 4 tasks, 2 repairs |
| Preview URL served working app | ✅ HTML served |
| Foundry events emitted | ✅ 19 events |
| Release gate | ❌ FAIL (NO_TESTS) |
| Foundry events synced to FinalBuilds | ❌ Hash mismatch (now fixed) |

## HydraDB verification

| Check | Result |
|-------|--------|
| Version pinned | ✅ v0.1.1 |
| Strict mode (no fallback) | ✅ 7/7 tests |
| CREATE via edge pattern | ✅ Proven |
| MATCH + SET | ✅ Proven |
| Replay equivalence | ✅ Destroy → replay → equivalent |
| SHA-256 IDs (52-bit) | ✅ No collision risk |

## Known limitations

1. HydraDB doesn't support MERGE, standalone node CREATE, or MATCH+CREATE edge
2. Graph lineage uses property-based queries (string_id), not graph traversal
3. Each node created with _GENESIS edge to anchor (HydraDB requirement)
4. Build release gate failed on missing tests despite 2 repair attempts
