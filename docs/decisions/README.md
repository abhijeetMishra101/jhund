# Decision Log

Append-only record of all decisions made across all roles.

## Format

One file per day: `YYYY-MM-DD-decisions.md`

Each entry:
```
## HH:MM [ROLE] — Decision Title
**Decided**: One sentence.
**Context**: What prompted this.
**Docs updated**: list of files
**Downstream triggers**: which roles were notified and why
**Confirmed**: yes / implicit / pending
```

## Rules

- Decisions only — not analysis or recommendations
- Append only — never edit past entries
- Every role is responsible for writing its own entries
- Cross-role triggers are listed and marked done when actioned
