# dorothy-ann 🚌✨

> **a research desk with receipts — fast lookups, cited answers, and Markdown reports.**

Dorothy Ann is a browser-based lookup and research chat app inspired by the Magic School Bus kid who always had the answer because she had **done the research**.

Ask a quick question. Open the evidence. Go deeper when it matters. Keep the sources. Export the answer as Markdown.

No field trip required (though curiosity is strongly encouraged).

## what it does

- ⚡ **lookup mode** for quick, ranked web results
- 🔎 **research mode** for bounded, source-backed answers
- 💬 **chat mode** for follow-up questions grounded in the topic
- 🧾 **Dorothy Ann reports** that export as portable Markdown
- 🗂️ **browser-local topics** backed by IndexedDB
- 🔐 **small private research desk** with passphrase access
- 🧪 **fixture mode** so the app can be developed without live provider credentials

The alpha keeps the architecture deliberately portable: Brave handles discovery, the application owns extraction and evidence handling, Anthropic handles synthesis, and the core application stays behind provider-neutral interfaces.

## project status

This repository currently contains the implementation plan and repository guide. The app is being built in small, verifiable steps from the [Dorothy Ann v1.0.0-alpha plan](docs/plans/dorothy-ann-v1.0.0-alpha.md).

## screenshots

The visual tour will land here once the first browser build has something photogenic to show.

## documentation

- [Implementation plan](docs/plans/dorothy-ann-v1.0.0-alpha.md) — product behavior, architecture, contracts, UX states, and build ledger
- [Repository guide](AGENTS.md) — working boundaries, verification habits, and agent instructions

## the north star

> “According to my research…”

Dorothy Ann is the energy: curious, prepared, a little intense about sources, and ready to explain how she knows.

---

made with curiosity, citations, and a tiny yellow bus. <|°_°|>
