# Decisions — 2026-05-26

Retroactive log bootstrapped from Phase 17 smoke test session.

---

## 09:00 [PO + ARCH] — Phase 17 declared provisionally complete

**Decided**: Phase 17 smoke test is complete with 3 pending items (standup cron, magic link from scratch, action cap 80% warning). These are P1 and do not block the guinea pig test.
**Context**: Full smoke test run confirmed feature pipeline Stage 1→7, thread replies, multi-bot routing, and plan approval all working.
**Docs updated**:
- `docs/strategy/2026-05-26-phase-17-smoke-test-outcomes.md` (created)
**Downstream triggers**:
- [x] Architect notified: Phase 18 plan needed
**Confirmed**: yes

---

## 09:30 [ARCH] — Phase 18 v1.1 backlog sequenced

**Decided**: Four items form the v1.1 backlog, sequenced as 18-A through 18-D. Channel membership UI is first (highest founder impact). QA gate fix already spawned as background task.
**Context**: Bugs and gaps found during Phase 17 smoke test.
**Docs updated**:
- `docs/architecture/2026-05-26-phase-18-plan.md` (created)
**Downstream triggers**:
- [x] Backend Developer: owns 18-B (QA gate), 18-C (SMTP), 18-D (seed migration)
- [x] Frontend Engineer: owns 18-A (channel membership UI)
- [ ] Test Engineer: define test coverage for all 18-* use cases
**Confirmed**: yes

---

## 10:15 [UX] — "+ Add teammate" is a broken affordance

**Decided**: "+ Add teammate" in channel header must become an inline dropdown scoped to the channel, not a link to workspace Settings. Copy changes to "+ Add" with dropdown header "Add to #[channel]". This is v1.1, not a v1.0 blocker.
**Context**: Founder noticed during smoke test that clicking the link went to Settings instead of adding a bot to the current channel.
**Docs updated**:
- `docs/architecture/2026-05-26-phase-18-plan.md` (Phase 18-A section covers this)
**Downstream triggers**:
- [x] Architect: confirmed 18-A scope
- [ ] Frontend Engineer: implement dropdown picker
**Confirmed**: yes

---

## 10:45 [PO] — Phase 19 scoped: Role Decision Accountability

**Decided**: A new phase (19) will make all roles self-documenting and self-triggering. Two tracks: (A) fix development roles in Claude Code to follow decision-action contracts; (B) build the same capability into Jhund product as the `record_decision` bot tool + #decisions channel.
**Context**: Founder observed that chasing roles for documentation and cross-role follow-up is the same friction their customers will feel. Product and process must solve the same problem.
**Docs updated**:
- `docs/strategy/2026-05-26-phase-19-role-decision-accountability.md` (created)
- `docs/architecture/2026-05-26-phase-19-design.md` (created)
- `docs/decisions/README.md` (created)
- `docs/decisions/2026-05-26-decisions.md` (this file)
**Downstream triggers**:
- [ ] Architect: design the `record_decision` tool + `decision_events` table (done — see Phase 19 design doc)
- [ ] ML Agent Engineer: implement RECORD_DECISION_TOOL + system prompt updates
- [ ] Backend Developer: migration 007 + lib/decisions/ module + API routes
- [ ] Test Engineer: define test coverage for UC-19-01 through UC-19-08
- [ ] PO: run pre-phase gate (use case list defined above in strategy doc)
**Confirmed**: yes

---

## Retroactive Decisions (from earlier phases — summary only)

These were made before the decision log existed. Captured here for continuity.

| Date | Role | Decision |
|------|------|----------|
| 2026-05-21 | ARCH | PRs #69-71: normalise actions array, empty actions fallback, fix ThreadPanel fetch URL |
| 2026-05-21 | PO | Phase 16B (autonomous dispatch) declared complete after PRs merged and smoke tested |
| 2026-05-20 | ARCH | Phase 16 feature stage model: 7 stages, gate_events table, advanceStage() + checkGate() pattern |
| 2026-05-12 | PO + ARCH | Phase 17 is the real ship gate. Phases 14-16 merged. No new code — checklist only |
| 2026-04-21 | PO | ICP confirmed: non-technical founders, not developers. Jhund feels like hiring, not configuring |
| 2026-04-21 | ARCH | Stack: Next.js 14, Supabase, Anthropic SDK, Vercel. PRs only, never direct push to main |
