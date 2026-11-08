import { beforeEach, describe, expect, it } from "vitest";
import { MemoryFS } from "@/lib/memory/fs";
import { MemoryPathError, normalizeMemoryPath, slug } from "@/lib/memory/paths";
import { checkMemoryText } from "@/lib/policy/privacy";
import { freshStore } from "./helpers";

describe("memory paths", () => {
  it("accepts paths under /memories", () => {
    expect(normalizeMemoryPath("/memories/core.md")).toBe("/memories/core.md");
    expect(normalizeMemoryPath("/memories//people/ana-lopez.md")).toBe("/memories/people/ana-lopez.md");
  });

  it.each(["/etc/passwd", "/memories/../secrets.env", "/memories/%2e%2e/x", "memories\\..\\x", "/memories/a/./b", "", "/other/memories/x"])(
    "rejects %s",
    (p) => {
      expect(() => normalizeMemoryPath(p)).toThrow(MemoryPathError);
    },
  );

  it("slugs names", () => {
    expect(slug("Ana López")).toBe("ana-lopez");
    expect(slug("Jin-woo Park")).toBe("jin-woo-park");
  });
});

describe("MemoryFS", () => {
  beforeEach(() => freshStore());
  const scope = { churchId: "demo", leaderId: "l1" };

  it("creates, views, edits, inserts, renames and deletes", async () => {
    const fs = new MemoryFS(scope);
    expect((await fs.run({ command: "view", path: "/memories" })).text).toContain("Here're the files and directories");
    expect((await fs.run({ command: "create", path: "/memories/core.md", file_text: "Leads youth\nPrefers texts\n" })).text).toBe(
      "File created successfully at: /memories/core.md",
    );
    const view = await fs.run({ command: "view", path: "/memories/core.md" });
    expect(view.text).toContain("     1\tLeads youth");
    expect((await fs.run({ command: "str_replace", path: "/memories/core.md", old_str: "Prefers texts", new_str: "Prefers calls" })).text).toContain(
      "The memory file has been edited.",
    );
    expect(await fs.read("/memories/core.md")).toContain("Prefers calls");
    expect((await fs.run({ command: "insert", path: "/memories/core.md", insert_line: 0, insert_text: "# Dana\n" })).text).toBe(
      "The file /memories/core.md has been edited.",
    );
    expect((await fs.read("/memories/core.md"))!.startsWith("# Dana\n")).toBe(true);
    expect((await fs.run({ command: "rename", old_path: "/memories/core.md", new_path: "/memories/about.md" })).text).toBe(
      "Successfully renamed /memories/core.md to /memories/about.md",
    );
    expect((await fs.run({ command: "delete", path: "/memories/about.md" })).text).toBe("Successfully deleted /memories/about.md");
    expect(await fs.paths()).toEqual([]);
  });

  it("reports duplicate and missing old_str", async () => {
    const fs = new MemoryFS(scope);
    await fs.create("/memories/x.md", "a\na\n");
    expect((await fs.run({ command: "str_replace", path: "/memories/x.md", old_str: "a", new_str: "b" })).text).toContain("Multiple occurrences");
    expect((await fs.run({ command: "str_replace", path: "/memories/x.md", old_str: "zzz", new_str: "b" })).text).toContain("did not appear verbatim");
  });

  it("refuses traversal and the root directory", async () => {
    const fs = new MemoryFS(scope);
    expect((await fs.run({ command: "create", path: "/memories/../../x", file_text: "hi" })).isError).toBe(true);
    expect((await fs.run({ command: "delete", path: "/memories" })).isError).toBe(true);
  });

  it("keeps leaders apart", async () => {
    await new MemoryFS(scope).create("/memories/core.md", "Dana's notes");
    expect(await new MemoryFS({ churchId: "demo", leaderId: "l2" }).read("/memories/core.md")).toBeNull();
  });

  it("enforces the write policy", async () => {
    const fs = new MemoryFS(scope, (text) => checkMemoryText(text, { allowSensitive: false }));
    const r = await fs.run({ command: "create", path: "/memories/people/grace.md", file_text: "Grace has cancer" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("health details");
  });
});

describe("privacy policy", () => {
  const strict = { allowSensitive: false };
  it("blocks secrets always", () => {
    expect(checkMemoryText("The door code is 4471", { allowSensitive: true })).toContain("passwords and codes");
    expect(checkMemoryText("card 4111 1111 1111 1111", strict)).toContain("card or account numbers");
  });
  it("blocks sensitive pastoral details unless the church allows them", () => {
    expect(checkMemoryText("They are getting a divorce", strict)).toContain("family conflict");
    expect(checkMemoryText("They are getting a divorce", { allowSensitive: true })).toBeNull();
  });
  it("allows minimal follow-ups", () => {
    expect(checkMemoryText("Check on Grace after her recovery, by Friday", strict)).toBeNull();
    expect(checkMemoryText("Prefers texts before 9am", strict)).toBeNull();
  });
});
