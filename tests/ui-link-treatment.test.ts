import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync("src/ui/styles/global.css", "utf8");
const appStyles = readFileSync("src/ui/App.module.css", "utf8");
const primitiveStyles = readFileSync("src/ui/styles/primitives.css", "utf8");

describe("global link treatment", () => {
  it("uses transparent current-color marker highlights without link underlines", () => {
    expect(globalStyles).toContain("padding: 0.16em 0.55em");
    expect(globalStyles).not.toContain("border: 1px solid currentColor");
    expect(globalStyles).toContain("box-decoration-break: clone");
    expect(globalStyles).toContain("color-mix(in srgb, var(--link-marker-color, currentColor) 9%, transparent)");
    expect(globalStyles).toContain("color-mix(in srgb, var(--link-marker-color, currentColor) 18%, transparent)");
    expect(globalStyles).toContain("color-mix(in srgb, var(--link-marker-color, currentColor) 24%, transparent)");
    expect(globalStyles).not.toContain("color-mix(in srgb, white");
    expect(globalStyles).not.toMatch(/a(?::any-link)?[^{}]*\{[^{}]*text-decoration:\s*underline/s);
  });

  it("does not reintroduce underlines and resets media anchors", () => {
    const productStyles = `${appStyles}\n${primitiveStyles}`;
    expect(productStyles).not.toMatch(/(?:^|[},]\s*)[^{}]*\ba(?::|\.|\[|\s|,)[^{}]*\{[^{}]*text-decoration:\s*underline/gm);
    expect(primitiveStyles).not.toMatch(/\.ui-markdown[^{}]*\ba[^{}]*\{[^{}]*text-decoration-(?:color|thickness):/s);
    expect(appStyles).toMatch(/\.mediaAttachment\s*\{[^}]*padding:\s*0;[^}]*box-decoration-break:\s*slice;/s);
    expect(appStyles).toMatch(/\.mediaFallbackLink\s*\{[^}]*padding:\s*0;[^}]*background:\s*transparent;/s);
    expect(appStyles).toMatch(/\.evidence a\.sourceAccent\s*\{[^}]*padding:\s*0\.16em 0\.55em;/s);
  });

  it("cycles homepage command swatches through all scheme accents with ink foregrounds", () => {
    for (let index = 1; index <= 8; index += 1) {
      expect(appStyles).toContain(`--command-accent: var(--accent-${index})`);
    }
    expect(appStyles).toMatch(/\.commandList p > :first-child\s*\{[^}]*--link-marker-color:\s*var\(--command-accent\);[^}]*color:\s*var\(--ink\)/s);
    expect(appStyles).toMatch(/\.commandListAction\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--command-accent, currentColor\) 20%, var\(--paper\)\);[^}]*color:\s*var\(--ink\)/s);
    expect(appStyles).toMatch(/\.commandListAction:hover,[\s\S]*?background:\s*color-mix\(in srgb, var\(--command-accent, currentColor\) 28%, var\(--paper\)\)/);
    expect(appStyles).toContain("color-mix(in srgb, var(--command-accent, currentColor) 34%, var(--paper))");
    expect(appStyles).toMatch(/\.commandList a\s*\{[^}]*background-color:\s*color-mix\(in srgb, var\(--command-accent, var\(--accent\)\) 20%, var\(--paper\)\)/s);
    expect(appStyles).toContain("color-mix(in srgb, var(--command-accent, var(--accent)) 34%, var(--paper))");
  });

  it("uses one shared responsive three-to-two-to-one evidence grid", () => {
    expect(appStyles).toMatch(/\.evidenceList\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 28rem\), 1fr\)\)/s);
    expect(appStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.evidenceList\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(appStyles).not.toContain("evidenceItemVideo");
    expect(appStyles).not.toContain("56rem");
  });
});
