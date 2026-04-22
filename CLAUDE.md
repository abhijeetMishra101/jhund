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
- Fashion Trend Pipeline is the first guinea pig to run on Clan

## Immediate Next Steps
1. Install thepopebot locally
2. Configure Product Owner role → validate business idea, ICP, monetisation
3. Configure Architect role → tech stack, MVP scope, system design
4. Build Clan
5. Migrate fashion project to run on Clan as first guinea pig

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
`~/Developer/fashion-trend-pipeline` — an AI fashion pipeline with
6 modules (M1 done, M2–M6 pending). Will be migrated to run inside
Clan once the product is live. Its roles (Architect, Backend, ML,
Security, Test, Product) are already defined as Claude Code slash
commands in that repo.
