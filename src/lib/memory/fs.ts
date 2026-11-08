import { kv } from "../store";
import { MEMORY_ROOT, MemoryPathError, isRoot, normalizeMemoryPath } from "./paths";

/**
 * A leader's memory directory, stored as one Redis key per markdown file plus an index set.
 * Command semantics and return strings follow Claude's memory tool (memory_20250818).
 */

export const LIMITS = {
  maxFileChars: 20_000,
  maxTotalChars: 200_000,
  maxFiles: 200,
  viewChars: 16_000,
};

export type MemoryScope = { churchId: string; leaderId: string };

export type WriteCheck = (text: string, path: string) => string | null;

export class MemoryFS {
  private prefix: string;

  /**
   * @param scope taken from the authenticated session, never from the path Claude sends.
   * @param check returns an error message when text breaks the church's memory policy.
   * @param onTouch records which conversation changed which file (for "forget this conversation").
   */
  constructor(
    scope: MemoryScope,
    private readonly check: WriteCheck = () => null,
    private readonly onTouch: (path: string) => Promise<void> = async () => {},
  ) {
    this.prefix = `mem:${scope.churchId}:${scope.leaderId}`;
  }

  private fileKey(path: string) {
    return `${this.prefix}:file:${path}`;
  }
  private indexKey() {
    return `${this.prefix}:index`;
  }

  async paths(): Promise<string[]> {
    return (await kv().smembers(this.indexKey())).sort();
  }

  async read(path: string): Promise<string | null> {
    return kv().get(this.fileKey(normalizeMemoryPath(path)));
  }

  private async isDirectory(path: string) {
    if (isRoot(path)) return true;
    return (await this.paths()).some((p) => p.startsWith(`${path}/`));
  }

  private async totalChars(excluding?: string) {
    let total = 0;
    for (const p of await this.paths()) {
      if (p === excluding) continue;
      total += (await kv().get(this.fileKey(p)))?.length ?? 0;
    }
    return total;
  }

  private async write(path: string, text: string) {
    if (isRoot(path)) throw new MemoryPathError("Can't write to the /memories directory itself.");
    if (path.split("/").length > 6) throw new MemoryPathError("Memory folders can be at most four levels deep.");
    if (text.length > LIMITS.maxFileChars) {
      throw new MemoryPathError(`That file would be over ${LIMITS.maxFileChars} characters. Split it or trim it.`);
    }
    const existing = await this.paths();
    if (!existing.includes(path) && existing.length >= LIMITS.maxFiles) {
      throw new MemoryPathError("Memory is full. Delete or merge files that are no longer useful.");
    }
    if ((await this.totalChars(path)) + text.length > LIMITS.maxTotalChars) {
      throw new MemoryPathError("Memory is full. Delete or merge files that are no longer useful.");
    }
    await kv().set(this.fileKey(path), text);
    await kv().sadd(this.indexKey(), path);
    await this.onTouch(path);
  }

  private policy(text: string, path: string) {
    const problem = this.check(text, path);
    if (problem) throw new MemoryPathError(problem);
  }

  private static numbered(path: string, content: string, start = 1, end?: number) {
    const lines = content.replace(/\n$/, "").split("\n");
    const last = end === undefined || end === -1 ? lines.length : Math.min(end, lines.length);
    const out: string[] = [];
    for (let i = Math.max(1, start); i <= last; i++) {
      out.push(`${String(i).padStart(6, " ")}\t${lines[i - 1] ?? ""}`);
    }
    return `Here's the content of ${path} with line numbers:\n${out.join("\n")}`;
  }

  async view(rawPath: string, viewRange?: [number, number]): Promise<string> {
    const path = normalizeMemoryPath(rawPath);
    const content = await kv().get(this.fileKey(path));
    if (content !== null) {
      if (viewRange) return MemoryFS.numbered(path, content, viewRange[0], viewRange[1]);
      if (content.length > LIMITS.viewChars) {
        const shown = MemoryFS.numbered(path, content.slice(0, LIMITS.viewChars));
        return `${shown}\n[File truncated at ${LIMITS.viewChars} characters. Use view_range to read the rest.]`;
      }
      return MemoryFS.numbered(path, content);
    }
    if (await this.isDirectory(path)) {
      const depth = path.split("/").length;
      const lines = [`${MemoryFS.size(await this.dirChars(path))}\t${path}`];
      for (const p of await this.paths()) {
        if (!p.startsWith(`${path}/`)) continue;
        if (p.split("/").length > depth + 2) continue;
        const size = (await kv().get(this.fileKey(p)))?.length ?? 0;
        lines.push(`${MemoryFS.size(size)}\t${p}`);
      }
      return `Here're the files and directories up to 2 levels deep in ${path}, excluding hidden items and node_modules:\n${lines.join("\n")}`;
    }
    return `The path ${path} does not exist. Please provide a valid path.`;
  }

  private async dirChars(path: string) {
    let total = 0;
    for (const p of await this.paths()) {
      if (isRoot(path) || p.startsWith(`${path}/`)) total += (await kv().get(this.fileKey(p)))?.length ?? 0;
    }
    return total;
  }

  private static size(chars: number) {
    if (chars < 1024) return `${chars}B`;
    return `${(chars / 1024).toFixed(1)}K`;
  }

  async create(rawPath: string, fileText: string): Promise<string> {
    const path = normalizeMemoryPath(rawPath);
    this.policy(fileText, path);
    // Claude's tool description says create "creates or overwrites"; overwriting is allowed.
    await this.write(path, fileText);
    return `File created successfully at: ${path}`;
  }

  async strReplace(rawPath: string, oldStr: string, newStr = ""): Promise<string> {
    const path = normalizeMemoryPath(rawPath);
    const content = await kv().get(this.fileKey(path));
    if (content === null) return `Error: The path ${path} does not exist. Please provide a valid path.`;
    const count = content.split(oldStr).length - 1;
    if (!oldStr || count === 0) {
      return `No replacement was performed, old_str \`${oldStr}\` did not appear verbatim in ${path}.`;
    }
    if (count > 1) {
      const lines = content
        .split("\n")
        .map((line, i) => (line.includes(oldStr) ? i + 1 : 0))
        .filter(Boolean);
      return `No replacement was performed. Multiple occurrences of old_str \`${oldStr}\` in lines: ${lines.join(", ")}. Please ensure it is unique`;
    }
    this.policy(newStr, path);
    const updated = content.replace(oldStr, () => newStr);
    await this.write(path, updated);
    return `The memory file has been edited.\n${MemoryFS.numbered(path, updated)}`;
  }

  async insert(rawPath: string, insertLine: number, insertText: string): Promise<string> {
    const path = normalizeMemoryPath(rawPath);
    const content = await kv().get(this.fileKey(path));
    if (content === null) return `Error: The path ${path} does not exist`;
    const lines = content.split("\n");
    if (!Number.isInteger(insertLine) || insertLine < 0 || insertLine > lines.length) {
      return `Error: Invalid \`insert_line\` parameter: ${insertLine}. It should be within the range of lines of the file: [0, ${lines.length}]`;
    }
    this.policy(insertText, path);
    lines.splice(insertLine, 0, insertText.replace(/\n$/, ""));
    await this.write(path, lines.join("\n"));
    return `The file ${path} has been edited.`;
  }

  async delete(rawPath: string): Promise<string> {
    const path = normalizeMemoryPath(rawPath);
    if (isRoot(path)) return "Error: The /memories directory itself can't be deleted.";
    const all = await this.paths();
    const targets = all.filter((p) => p === path || p.startsWith(`${path}/`));
    if (!targets.length) return `Error: The path ${path} does not exist`;
    await kv().del(...targets.map((p) => this.fileKey(p)));
    await kv().srem(this.indexKey(), ...targets);
    for (const p of targets) await this.onTouch(p);
    return `Successfully deleted ${path}`;
  }

  async rename(rawOld: string, rawNew: string): Promise<string> {
    const oldPath = normalizeMemoryPath(rawOld);
    const newPath = normalizeMemoryPath(rawNew);
    if (isRoot(oldPath)) return "Error: The /memories directory itself can't be renamed.";
    const all = await this.paths();
    const sources = all.filter((p) => p === oldPath || p.startsWith(`${oldPath}/`));
    if (!sources.length) return `Error: The path ${oldPath} does not exist`;
    if (all.some((p) => p === newPath || p.startsWith(`${newPath}/`))) {
      return `Error: The destination ${newPath} already exists`;
    }
    for (const src of sources) {
      const dest = newPath + src.slice(oldPath.length);
      const content = (await kv().get(this.fileKey(src))) ?? "";
      await kv().set(this.fileKey(dest), content);
      await kv().sadd(this.indexKey(), dest);
      await kv().del(this.fileKey(src));
      await kv().srem(this.indexKey(), src);
      await this.onTouch(src);
      await this.onTouch(dest);
    }
    return `Successfully renamed ${oldPath} to ${newPath}`;
  }

  /** Runs one memory tool command. Errors come back as text so Claude can recover. */
  async run(input: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    try {
      const command = input.command;
      let text: string;
      switch (command) {
        case "view": {
          const range = Array.isArray(input.view_range) ? (input.view_range as [number, number]) : undefined;
          text = await this.view(String(input.path ?? MEMORY_ROOT), range);
          break;
        }
        case "create":
          text = await this.create(String(input.path), String(input.file_text ?? ""));
          break;
        case "str_replace":
          text = await this.strReplace(String(input.path), String(input.old_str ?? ""), input.new_str === undefined ? "" : String(input.new_str));
          break;
        case "insert":
          text = await this.insert(String(input.path), Number(input.insert_line), String(input.insert_text ?? ""));
          break;
        case "delete":
          text = await this.delete(String(input.path));
          break;
        case "rename":
          text = await this.rename(String(input.old_path), String(input.new_path));
          break;
        default:
          return { text: `Error: unknown command ${String(command)}`, isError: true };
      }
      return { text, isError: text.startsWith("Error:") };
    } catch (err) {
      const message = err instanceof MemoryPathError ? err.message : "That memory operation failed.";
      return { text: `Error: ${message}`, isError: true };
    }
  }
}
