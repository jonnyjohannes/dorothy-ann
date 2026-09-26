// @vitest-environment node

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FileSystemPromptSource, SystemPromptUnavailableError } from "../server/runtime/system-prompts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function promptUrls(assessor: string | Uint8Array, synthesizer: string | Uint8Array) {
  const directory = await mkdtemp(join(tmpdir(), "dorothy-prompts-"));
  temporaryDirectories.push(directory);
  const assessorPath = join(directory, "ASSESSOR.md");
  const synthesizerPath = join(directory, "SYNTHESIZER.md");
  await writeFile(assessorPath, assessor);
  await writeFile(synthesizerPath, synthesizer);
  return {
    assessor: pathToFileURL(assessorPath),
    synthesizer: pathToFileURL(synthesizerPath),
    assessorPath,
  };
}

describe("FileSystemPromptSource", () => {
  it("loads exact UTF-8 content once and returns an immutable catalog", async () => {
    const urls = await promptUrls("  assessor markdown\n", "synthesizer markdown\n\n");
    const source = new FileSystemPromptSource(urls);
    const first = await source.load();
    await writeFile(urls.assessorPath, "changed");
    const second = await source.load();

    expect(first).toEqual({ assessor: "  assessor markdown\n", synthesizer: "synthesizer markdown\n\n" });
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("loads the committed root assets", async () => {
    const catalog = await new FileSystemPromptSource().load();
    expect(catalog.assessor).toBe(await readFile(new URL("../ASSESSOR.md", import.meta.url), "utf8"));
    expect(catalog.assessor).toContain("For a single factual, navigational, or current-state problem, prefer one focused search over decomposition.");
    expect(catalog.assessor).toContain("two distinct usable extracted source IDs");
    expect(catalog.assessor).toContain("Bare search results, snippets, source catalog metadata, and repeated snapshots of one ID do not count.");
    expect(catalog.assessor).toContain("not** a demand that sources agree");
    expect(catalog.assessor).toContain("both supported and contradictory or qualifying observations");
    expect(catalog.assessor).toContain("each explicit material obligation");
    expect(catalog.assessor).toContain("without a two-source quota");
    expect(catalog.assessor).toContain("Fresh retrieval is mandatory for time-sensitive requests.");
    expect(catalog.assessor).not.toContain("at least four materially independent sources overall");
    expect(catalog.synthesizer).toBe(await readFile(new URL("../SYNTHESIZER.md", import.meta.url), "utf8"));
    expect(catalog.synthesizer).toContain("**`initial`** — begin exactly with `According to my research`");
    expect(catalog.synthesizer).toContain("**`follow_up`** — answer directly");
    expect(catalog.synthesizer).toContain("when they disagree, explain the competing accounts");
    expect(catalog.synthesizer).toContain("not** a fixed citation quota");
    expect(catalog.synthesizer).toContain("[[cite:SourceId]]");
    expect(catalog.synthesizer).toContain("The application, not you, owns transcript separators.");
  });

  it.each([
    ["empty", "   \n"],
    ["invalid UTF-8", new Uint8Array([0xc3, 0x28])],
    ["oversized", "x".repeat(32 * 1024 + 1)],
  ])("rejects %s content with a bounded role-only error", async (_label, content) => {
    const urls = await promptUrls(content, "valid");
    const error = await new FileSystemPromptSource(urls).load().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SystemPromptUnavailableError);
    expect(error).toMatchObject({ code: "system_prompt_unavailable", role: "assessor" });
    expect((error as Error).message).toBe("system_prompt_unavailable:assessor");
    expect((error as Error).message).not.toContain(urls.assessorPath);
  });

  it("rejects a missing asset without exposing its path", async () => {
    const urls = await promptUrls("valid", "valid");
    const missing = pathToFileURL(join(tmpdir(), "missing-synthesizer.md"));
    const error = await new FileSystemPromptSource({ ...urls, synthesizer: missing }).load().catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "system_prompt_unavailable", role: "synthesizer" });
    expect((error as Error).message).toBe("system_prompt_unavailable:synthesizer");
    expect((error as Error).message).not.toContain(missing.pathname);
  });
});
