# Clan — Project Kickoff

## What is Clan
A Slack-like app where every teammate is an AI bot. Founders hire a
self-sustaining AI team (Product Owner, Architect, Backend, Designer,
QA etc.), talk to them like Slack colleagues, and bots actually ship
work via GitHub triggers.

## Core Metaphor
You're a founder. Clan is your office. Every channel is a teammate.
Git events trigger the right bot automatically. No technical setup —
pick a team template and go.

## Key Differentiators
- **Audience**: non-technical founders (not developers)
- **Setup**: pick a template, connect GitHub, done
- **Feel**: hiring + working with a team (not configuring agents)
- **Git integration**: core feature, zero config
- Every teammate is a Claude-powered agent

## Team Structure
- **Ops bot**: greeter, employee directory, routes founder to right teammate
- **Rooms**: #standup, #tech-planning, #product-sync, #retrospective
- **Templates**: Startup / Enterprise / Blank (hire at runtime)
- **Git triggers**: PR → Backend reviews, issue tagged `security` → Security audits

## Name
**Clan** — Hindi word for a self-sustaining swarm/horde. Chosen for
raw punch — same unexpected energy as "Slack." Signals Indian roots
without being Indian-coded globally.

## What Was Decided
- Separate repo from `fashion-trend-pipeline`
- Built using thepopebot as the development environment
- Product Owner + Architect roles first, then build
- **Product target (updated 2026-05-30)**: Jhund builds Jhund. The Jhund workspace is connected to the `abhijeetMishra101/jhund` repo. The Guinea Pig Gate is: founder specs a feature in `#product`, sits back, and the team ships it autonomously — PR ready for founder review with no hand-holding required.

## Current Phase
Phases 20–22 shipped. Building toward Guinea Pig Gate via:
- Phase 23: Workspace Context
- Phase 24: Autonomous work loop
- Phase 25: Bot-to-bot messaging
- Phase 26: Escalation + founder notification
See `docs/strategy/2026-05-26-full-vision-gap-analysis.md` for full phase sequence.

## Roles (to configure in thepopebot)

### Product Owner
Business and product strategy. Defines ICP, evaluates monetisation
models, scopes MVP, maps competitors, sequences by user value.
Outputs: Strategic Brief, MVP Recommendation, Assumption Map.

**First question to ask:**
"Who is Clan's primary user and what does their first 10 minutes look like?"

### Architect
Strategic technical lead. Designs module interfaces, identifies
blockers, proposes stack decisions. Does not write implementation code
— outputs specs, ADRs, system diagrams.

**First question to ask:**
"What is the minimum viable tech stack to ship a working Clan prototype?"

### Backend Developer
Implements features. Follows conventions, writes typed minimal code,
no gold-plating.

### ML / Agent Engineer
Owns Claude API integration, prompt design per role, agent
coordination, shared workspace pattern.

### Security Reviewer
Reviews for OWASP top 10, API input handling, exposed secrets,
third-party dep risks.

### Test Engineer
Writes and improves tests. Targets HTTP endpoints, agent behaviour,
git trigger logic.

### Ops Bot (special)
Employee directory. Routes founder to right teammate. Maintains
team templates. Greets new users on onboarding.

## Guinea Pig Project
**Jhund builds Jhund** — the product target is for the Jhund AI team to autonomously build Jhund's own next feature. The Jhund workspace is already connected to `abhijeetMishra101/jhund`. Once Phases 23–26 are complete, the founder specs a feature, hands off, and gets a PR notification when it's done.

The fashion trend pipeline (`~/Developer/fashion-trend-pipeline`) remains a secondary validation target but is no longer the primary guinea pig.
