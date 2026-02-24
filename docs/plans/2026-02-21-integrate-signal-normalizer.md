# Integrate Signal Normalizer (Parallel A/B) Implementation Plan

Created: 2026-02-21
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

> **Status Lifecycle:** PENDING → COMPLETE → VERIFIED
> **Iterations:** Tracks implement→verify cycles (incremented by verify phase)
>
> - PENDING: Initial state, awaiting implementation
> - COMPLETE: All tasks implemented
> - VERIFIED: All checks passed
>
> **Approval Gate:** Implementation CANNOT proceed until `Approved: Yes`
> **Worktree:** Set at plan creation (from dispatcher). `Yes` uses git worktree isolation; `No` works directly on current branch (default)
> **Type:** `Feature` or `Bugfix` — set at planning time, used by dispatcher for routing

## Summary

**Goal:** Run the signal-normalizer skill's scoring system in parallel alongside the current SignalGenerator, logging both scores for A/B comparison without affecting live trading decisions.

**Architecture:** Hybrid parallel approach — create a `SignalNormalizer` class implementing the skill's standardized schema (7-tier classification, priority hierarchy, conservative multipliers), wire it into `SignalAnalysisAgent` to run alongside the existing `SignalGenerator`, and log both results to the audit log for comparison analysis.

**Tech Stack:** TypeScript, Jest, existing indicator infrastructure

## Scope

### In Scope

- New `SignalNormalizer` class with skill's scoring logic
- Parallel execution in `SignalAnalysisAgent.generateSignal()`
- Audit log entries with both current and normalized scores
- Comparison analysis script to evaluate scoring differences
- Tests for the new normalizer

### Out of Scope

- Replacing the current SignalGenerator (deferred until A/B data collected)
- Changing trading decisions based on normalized scores
- Modifying existing indicator outputs

## Prerequisites

- TypeScript compilation passing (verified)
- Existing 14 indicators working in SignalAnalysisAgent
- Audit logging infrastructure in place

## Context for Implementer

- **Patterns to follow:** Follow the `SignalGenerator` pattern at `src/core/SignalGenerator.ts` — constructor with config, `generate()` method taking indicator results
- **Conventions:** All new files in `src/core/`, tests in `test/`, TypeScript strict mode, no `any` types in public APIs
- **Key files:**
  - `src/core/SignalGenerator.ts` — current composite scoring (482 lines)
  - `src/agents/signal-analysis-agent.ts` — calls SignalGenerator at line 225
  - `src/config/indicator-weights.ts` — V6_OPTIMIZED_WEIGHTS, SCORE_CAPS, SIGNAL_CLASSIFICATIONS
  - `src/types.ts` — CompositeSignal interface
  - `.claude/skills/signal-normalizer/SKILL.md` — skill specification
- **Gotchas:**
  - `SignalGenerator.getStrengthMultiplier()` already has experiment framework hook — normalizer should NOT use MultiplierExperiment, it uses its own fixed multipliers
  - `CompositeSignal.indicatorScores` is `Record<string, number>` (recently changed from Map)
  - Score caps differ: current system caps at ±220, skill caps at ±130 (with microstructure)
- **Domain context:** The signal-normalizer skill defines more conservative multipliers (very_strong=1.2x vs current 1.5x) and a priority hierarchy (divergence > crossover > zone > level). Running in parallel lets us collect data on whether the conservative approach produces better trade outcomes.

## Runtime Environment

- **Start command:** `cd cypherscoping-agent && ENABLE_SIGNAL_NORMALIZER=true node dist/cli.js scan --json`
- **Verify parallel execution:**
  1. Run analysis: `node dist/cli.js analyze ETHUSDTM`
  2. Check audit log: `tail -f runtime/audit.log | grep parallel_score_comparison`
  3. Expected: JSON entries with both `currentScore` and `normalizedScore` fields
- **Run comparison analysis:** `node ../scripts/compare-scoring-systems.js`
- **Output location:** `runtime/audit.log` (append-only JSONL format)
- **Environment variables:**
  - `ENABLE_SIGNAL_NORMALIZER` (default: `true`) — controls parallel scoring
  - `TRADING_MODE=paper` (required for testing)
  - `ENTRY_GATE_THRESHOLD=75` (current threshold)

## Progress Tracking

**MANDATORY: Update this checklist as tasks complete. Change `[ ]` to `[x]`.**

- [x] Task 1: Create SignalNormalizer class
- [x] Task 2: Create NormalizedCompositeSignal type
- [x] Task 3: Integrate parallel scoring into SignalAnalysisAgent
- [x] Task 4: Create comparison analysis script

**Total Tasks:** 4 | **Completed:** 4 | **Remaining:** 0

## Implementation Tasks

### Task 1: Create SignalNormalizer Class

**Objective:** Implement the signal-normalizer skill's scoring logic as a TypeScript class that takes the same indicator results as SignalGenerator but applies the skill's multipliers, priority hierarchy, and 7-tier classification.

**Dependencies:** None

**Files:**

- Create: `src/core/SignalNormalizer.ts`
- Test: `test/signal-normalizer.test.ts`

**Key Decisions / Notes:**

- Use the skill's strength multipliers: very_strong=1.2, strong=1.0, moderate=0.7, weak=0.5, extreme=1.1
- Implement 4-tier signal priority hierarchy from skill: Divergence (×1.2), Crossover/Pattern/Breakout (×1.0), Zone/Momentum (×0.7), Level (×0.5)
- Use 7-tier score classification: EXTREME_BUY (≥90), STRONG_BUY (≥70), BUY (≥50), NEUTRAL (-19 to 19), SELL, STRONG_SELL, EXTREME_SELL
- Score range: -130 to +130 (matching skill spec for live trading with microstructure)
- Accept the same `IndicatorResults` and microstructure inputs as `SignalGenerator.generate()`
- The `normalize()` method validates signals conform to the standardized schema: `{type, direction, strength, message, metadata}`
- Follow the `SignalGenerator` class structure at `src/core/SignalGenerator.ts:65`

**Definition of Done:**

- [ ] `SignalNormalizer` class created with `normalize()` and `generateComposite()` methods
- [ ] Strength multipliers match skill spec (1.2/1.0/0.7/0.5/1.1)
- [ ] 7-tier classification implemented and tested with boundary values (scores at 90, 70, 50, 19, -19, -50, -70, -90)
- [ ] Unit test provides indicator results with multiple conflicting signals (e.g., divergence + level for same indicator), verifies `getHighestPrioritySignal()` returns the divergence signal (priority 1) over the level signal (priority 4); test covers all 4 tiers
- [ ] Unit tests pass covering: (1) `normalize()` validates signal schema — missing fields and invalid direction/strength values throw errors, (2) multiplier application, (3) tier classification boundaries, (4) priority ordering across all 4 tiers, (5) edge cases (empty signals, null values)
- [ ] TypeScript compiles with no errors

**Verify:**

- `cd cypherscoping-agent && npm test -- --testPathPattern signal-normalizer` — normalizer tests pass
- `npm run build` — TypeScript compiles clean

### Task 2: Create NormalizedCompositeSignal Type

**Objective:** Define the TypeScript type for the normalized scoring output, extending CompositeSignal with normalizer-specific fields so both scoring systems can be compared.

**Dependencies:** Task 1

**Files:**

- Modify: `src/types.ts`
- Test: (covered by Task 1 and Task 3 tests)

**Key Decisions / Notes:**

- Add `NormalizedCompositeSignal` interface with: `normalizedScore`, `normalizedTier`, `normalizedConfidence`, `signalPriorityBreakdown`, `strengthMultipliersUsed`
- Add optional `normalizedResult` field to existing `CompositeSignal` interface so both scores travel together
- Keep backward compatible — `normalizedResult` is optional, existing code unaffected
- Reference existing CompositeSignal at `src/types.ts:~line 30`

**Definition of Done:**

- [ ] `NormalizedCompositeSignal` interface exported from types.ts
- [ ] `CompositeSignal` extended with optional `normalizedResult?: NormalizedCompositeSignal`
- [ ] `NormalizedCompositeSignal` importable by `src/core/SignalNormalizer.ts` and `src/agents/signal-analysis-agent.ts` (verified by TypeScript compilation)
- [ ] TypeScript compiles with no errors (existing code still works)

**Verify:**

- `npm run build` — compiles with no type errors
- Existing tests still pass: `npm test`

### Task 3: Integrate Parallel Scoring into SignalAnalysisAgent

**Objective:** Wire the SignalNormalizer into SignalAnalysisAgent so it runs in parallel with SignalGenerator on every scan, attaching normalized results to the CompositeSignal output and logging both scores to the audit log.

**Dependencies:** Task 1, Task 2

**Files:**

- Modify: `src/agents/signal-analysis-agent.ts` (add normalizer call after line 225)
- Test: `test/signal-analysis-parallel.test.ts`

**Key Decisions / Notes:**

- Import and instantiate `SignalNormalizer` in `SignalAnalysisAgent` constructor alongside `signalGenerator`
- In `generateSignal()` method (line 185), after `signalGenerator.generate()` call at line 225, also call `signalNormalizer.generateComposite()` with the same `indicatorResults` and `microstructure`
- Attach normalized result to the CompositeSignal via `signal.normalizedResult`
- Add audit log entry comparing both scores: `{ eventType: 'parallel_score_comparison', correlationId: <uuid>, payload: { currentScore, normalizedScore, currentTier, normalizedTier, agreement }, timestamp: <iso8601> }`
- Guard with `ENABLE_SIGNAL_NORMALIZER` env var (default: true for paper trading)
- Error handling contract: In `generateSignal()` at line ~226, wrap `signalNormalizer.generateComposite()` in try-catch. On error: (1) log to audit with `eventType: "normalizer_error"`, correlationId, error.message, error.stack; (2) set `signal.normalizedResult = undefined`; (3) continue with existing signal unchanged

**Definition of Done:**

- [ ] SignalNormalizer instantiated in SignalAnalysisAgent constructor
- [ ] `generateSignal()` calls both scorers and attaches normalized result
- [ ] Audit log entry written on each scan with both scores
- [ ] `ENABLE_SIGNAL_NORMALIZER` env var controls parallel scoring
- [ ] Try-catch wraps normalizer call; on error logs `normalizer_error` audit event and continues with main signal unchanged
- [ ] Integration test in `test/signal-analysis-parallel.test.ts`: (1) mocks 14 indicator results, (2) calls `SignalAnalysisAgent.generateSignal()`, (3) asserts `signal.normalizedResult` is defined with `normalizedScore`/`normalizedTier` fields, (4) asserts audit log received `parallel_score_comparison` event with both `currentScore` and `normalizedScore` fields
- [ ] TypeScript compiles

**Verify:**

- `npm test` — all existing + new tests pass
- `npm run build` — compiles clean
- Manual: Run `node dist/cli.js analyze ETHUSDTM`, grep `runtime/audit.log` for `parallel_score_comparison`, verify JSON contains `{ eventType: "parallel_score_comparison", correlationId, payload: { currentScore, normalizedScore, currentTier, normalizedTier, agreement }, timestamp }`

### Task 4: Create Comparison Analysis Script

**Objective:** Create a Node.js script that reads the audit log, extracts parallel score comparisons, and generates a summary report showing how the normalized scoring differs from the current system.

**Dependencies:** Task 3

**Files:**

- Create: `scripts/compare-scoring-systems.js`

**Key Decisions / Notes:**

- Read `cypherscoping-agent/runtime/audit.log` and filter for `parallel_score_comparison` events
- Calculate metrics: score correlation, tier agreement rate, mean absolute difference, cases where normalized would have blocked/allowed a trade differently
- Output format: console summary + optional JSON export
- Follow existing script pattern in `scripts/compare-multipliers.js`

**Definition of Done:**

- [ ] Script reads audit log and extracts comparison data
- [ ] Reports: score correlation, tier agreement %, mean score difference, trade decision divergences
- [ ] Handles three cases: (1) empty/missing audit.log outputs "No comparison data found", (2) <10 comparison events outputs summary with small-sample warning, (3) ≥10 events outputs full metrics
- [ ] Runs without errors when executed with `node scripts/compare-scoring-systems.js`

**Verify:**

- `node scripts/compare-scoring-systems.js` — runs without error, outputs "No comparison data found" or metrics summary

## Testing Strategy

- **Unit tests:** SignalNormalizer class — `normalize()` validation, multiplier application, tier classification, priority ordering, boundary values, empty inputs
- **Integration tests:** SignalAnalysisAgent with mocked indicators — verify both scorers run, `normalizedResult` attached, audit log `parallel_score_comparison` event emitted
- **Manual verification:** Run a market scan, verify audit log contains `parallel_score_comparison` entries with expected JSON structure

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Normalizer errors crash main scoring path | Low | High | In `SignalAnalysisAgent.generateSignal()` at line ~226, wrap `signalNormalizer.generateComposite()` in try-catch. On error: log `normalizer_error` audit event with correlationId, error.message, error.stack; set `signal.normalizedResult = undefined`; continue with existing signal unchanged. Verified by integration test that asserts main signal returned when normalizer throws. |
| Performance impact from running two scorers | Low | Low | Both are CPU-only math operations on already-fetched data; <1ms additional per scan |
| Audit log grows faster with comparison entries | Med | Low | Comparison entries are small (~200 bytes each); existing log rotation handles this |

## Goal Verification

### Truths (what must be TRUE for the goal to be achieved)

- Signal-normalizer scoring runs on every market scan without affecting current trading decisions
- Both current and normalized scores are logged to the audit log for comparison
- The normalized scorer uses the skill's conservative multipliers (1.2/1.0/0.7/0.5/1.1), not the current production multipliers
- A comparison script can analyze scoring differences from the audit log

### Artifacts (what must EXIST to support those truths)

- `src/core/SignalNormalizer.ts` — implements skill's scoring logic with 7-tier classification
- `src/types.ts` — `NormalizedCompositeSignal` interface and `CompositeSignal.normalizedResult` field
- `test/signal-normalizer.test.ts` — unit tests for normalizer
- `test/signal-analysis-parallel.test.ts` — integration tests for parallel scoring
- `scripts/compare-scoring-systems.js` — analysis script

### Key Links (critical connections that must be WIRED)

- `SignalAnalysisAgent.generateSignal()` → calls both `signalGenerator.generate()` AND `signalNormalizer.generateComposite()` on the same indicator results
- `CompositeSignal.normalizedResult` → populated by normalizer, passed through to audit log
- Audit log `parallel_score_comparison` events → readable by comparison script

## Open Questions

- None — scope is clear: parallel A/B comparison only, no trading decision changes

### Deferred Ideas

- Switch trading decisions to normalized scoring (after sufficient A/B data)
- Dashboard widget showing scoring system comparison in real-time
- Automated promotion when normalized scoring proves superior over N trades
