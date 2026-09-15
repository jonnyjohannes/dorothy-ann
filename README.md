# Dorothy Ann

Dorothy Ann, the browser-based lookup and research chat app inspired by the Magic School Bus kid who always had the answer because she had **done the research**.

Ask a quick question. Open the evidence. Go deeper when it matters. Keep the sources. Export the answer as Markdown.

> Step inside, it's a wilder ride!

## what it does

- ⚡ **lookup mode** for quick, ranked web results
- 🔎 **research mode** for bounded, source-backed answers
- 💬 **chat mode** for follow-up questions grounded in the topic
- 🧾 **Dorothy Ann reports** that export as portable Markdown
- 🗂️ **browser-local topics** backed by IndexedDB
- 🔐 **small private research desk** with passphrase access
- 🧪 **fixture mode** so the app can be developed without live provider credentials

The architecture stays deliberately portable: Brave handles discovery, the application owns extraction and evidence handling, Anthropic handles synthesis, and the core application stays behind provider-neutral interfaces.

## project status

Dorothy Ann v1.0.0 is launched and serving as a real browser default search engine. The completed [v1.0.0 plan](docs/plans/dorothy-ann-v1.0.0.md) records the adaptive research behavior, verification, and release state; focused patches can follow real-world use.

## screenshots

The visual tour will land here once the first browser build has something photogenic to show.

## documentation

- [v1.0.0 plan](docs/plans/dorothy-ann-v1.0.0.md) — adaptive research behavior, architecture, verification, and release record
- [v1.0.0-alpha2 plan](docs/plans/dorothy-ann-v1.0.0-alpha2.md) — persistent workspace and browser shell milestone
- [v1.0.0-alpha1 plan](docs/plans/dorothy-ann-v1.0.0-alpha1.md) — foundational product and implementation specification
- [Repository guide](AGENTS.md) — working boundaries, verification habits, and agent instructions

## the north star

> “According to my research…”

Dorothy Ann is the energy: curious, prepared, a little intense, and ready to share what she has learned.

---

made with curiosity, citations, and Miss Frizzle's timeless wisdom. <|°_°|>
