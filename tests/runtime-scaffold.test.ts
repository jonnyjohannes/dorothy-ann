// @vitest-environment node

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("runtime scaffold", () => {
  it("pins the Node and fuzzy-ranking runtime contracts", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      engines: { node: string };
      dependencies: Record<string, string>;
    };

    expect(packageJson.engines.node).toBe("22.x");
    expect(packageJson.dependencies.fzf).toBe("0.5.2");
  });

  it("includes both server-only prompt assets in the Vercel function", async () => {
    const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8")) as {
      functions: Record<string, { includeFiles: string }>;
    };

    expect(vercel.functions["api/index.ts"].includeFiles).toBe("{ASSESSOR.md,SYNTHESIZER.md}");
  });
});
