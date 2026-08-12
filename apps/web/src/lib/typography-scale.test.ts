import { describe, expect, test } from "bun:test";

const stylesheetUrl = new URL("../app/globals.css", import.meta.url);

describe("typography scale", () => {
  test("defines the complete hand-crafted interface scale", async () => {
    const stylesheet = await Bun.file(stylesheetUrl).text();

    expect(stylesheet).toContain("--text-xs: 0.75rem;");
    expect(stylesheet).toContain("--text-sm: 0.875rem;");
    expect(stylesheet).toContain("--text-base: 1rem;");
    expect(stylesheet).toContain("--text-lg: 1.125rem;");
    expect(stylesheet).toContain("--text-xl: 1.25rem;");
    expect(stylesheet).toContain("--text-2xl: 1.5rem;");
    expect(stylesheet).toContain("--text-3xl: 1.875rem;");
    expect(stylesheet).toContain("--text-4xl: 2.25rem;");
    expect(stylesheet).toContain("--text-5xl: 3rem;");
    expect(stylesheet).toContain("--text-6xl: 3.75rem;");
    expect(stylesheet).toContain("--text-7xl: 4.5rem;");
  });

  test("routes every font size through a scale token", async () => {
    const stylesheet = await Bun.file(stylesheetUrl).text();
    const declarations = stylesheet.match(/font-size:\s*[^;]+;/g) ?? [];

    expect(declarations.length).toBeGreaterThan(0);
    expect(
      declarations.filter(
        (declaration) =>
          !/^font-size:\s*var\(--text-[a-z0-9-]+\);$/.test(declaration),
      ),
    ).toEqual([]);
  });

  test("routes every explicit line height through a leading token", async () => {
    const stylesheet = await Bun.file(stylesheetUrl).text();
    const declarations = stylesheet.match(/line-height:\s*[^;]+;/g) ?? [];

    expect(declarations.length).toBeGreaterThan(0);
    expect(
      declarations.filter(
        (declaration) =>
          !/^line-height:\s*var\(--leading-[a-z0-9-]+\);$/.test(declaration),
      ),
    ).toEqual([]);
  });
});
