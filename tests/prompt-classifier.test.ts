import { describe, expect, it } from "vitest";
import { classifyPromptInput } from "../src/ui/controllers/prompt-classifier";

describe("classifyPromptInput", () => {
  it.each([
    ["plain question", { kind: "research", value: "plain question" }],
    ["what?", { kind: "research", value: "what?" }],
    ["/link example", { kind: "search", resultKind: "link", query: "example" }],
    [" /image  cats  ", { kind: "search", resultKind: "image", query: "cats" }],
    ["/video documentary", { kind: "search", resultKind: "video", query: "documentary" }],
  ] as const)("classifies %s", (input, expected) => {
    expect(classifyPromptInput(input)).toEqual(expected);
  });
  it("rejects unknown and empty slash commands", () => {
    expect(classifyPromptInput("/search weather")).toEqual({ kind: "invalid", message: "Unknown command: /search" });
    expect(classifyPromptInput("/image")).toEqual({ kind: "invalid", message: "Usage: /image <query>" });
    expect(classifyPromptInput(" ")).toEqual({ kind: "invalid", message: "A prompt is required." });
  });
});
