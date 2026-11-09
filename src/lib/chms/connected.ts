import { config } from "../config";
import { NativeChurch } from "../people/native";
import { loadPeople } from "../people/store";
import { DemoChurch } from "./demo";
import type { ChurchData } from "./types";

/**
 * The church database Barnabas reads: its own People database (`src/lib/people`) once it has anyone in
 * it, otherwise the demo church (the published leaders and schedule, no made-up congregation). Re-read at
 * most every few seconds; edits and imports call `invalidateChurchData()`.
 */
export class ConnectedChurch implements ChurchData {
  private cached: { at: number; data: ChurchData } | null = null;
  private last = "demo";

  constructor(private readonly churchId = config.churchId, private readonly demo: ChurchData = new DemoChurch(), private readonly ttlMs = 3000) {}

  /** The source seen on the latest read ("demo" or "native"). Use `churchSource()` for a fresh answer. */
  get source() {
    return this.last;
  }

  invalidate() {
    this.cached = null;
  }

  async current(): Promise<ChurchData> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.data;
    const book = await loadPeople(this.churchId).catch(() => null);
    const data = book && book.people.length > 0 ? new NativeChurch(book, this.demo) : this.demo;
    this.cached = { at: Date.now(), data };
    this.last = data.source;
    return data;
  }

  async leadership() { return (await this.current()).leadership(); }
  async listPeople() { return (await this.current()).listPeople(); }
  async getPerson(id: string) { return (await this.current()).getPerson(id); }
  async findPeople(q: string) { return (await this.current()).findPeople(q); }
  async teams() { return (await this.current()).teams(); }
  async serving(since: string) { return (await this.current()).serving(since); }
  async attendance(since: string) { return (await this.current()).attendance(since); }
  async rosters(from: string, to: string) { return (await this.current()).rosters(from, to); }
  async events(from: string, to: string) { return (await this.current()).events(from, to); }
}
