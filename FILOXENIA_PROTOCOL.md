# Filoxenia Protocol Specification
### Version 0.1 — Foundation

The Filoxenia Protocol defines a standard format for a shared, living document between a human and AI — called a Filoxenia Document — and a standard API through which AI tools can read from and write to it.

Any AI tool, agent, or application can become Filoxenia-compatible by implementing this specification.

## The Filoxenia Document

Stored locally at: ~/.filoxenia/context.md

Human-readable markdown. Plain text. No proprietary format. Openable in any editor.

## Five Sections

- ## Arc — human voice, direction
- ## Stack — human voice, what is being built
- ## Decisions — human voice, meaningful choices
- ## Beliefs — human voice, how you see the world
- ## Mirror — AI voice, what it notices

## The API

Local HTTP server at http://localhost:7777

GET /context — full context as JSON
GET /context/scoped?for={intent} — scoped by intent
POST /mirror — AI writes back into the document
GET /health — daemon status

## Privacy

All data lives at ~/.filoxenia/ on your machine.
The daemon never makes outbound connections.
No telemetry. No cloud. Yours entirely.

## The Three Principles

1. The host opens the door willingly — your data, your choice
2. The guest brings something in return — AI gives back, not just takes
3. The encounter changes both — genuine relationship, not a service

φιλοξενία — love of the stranger
