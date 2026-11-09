import { config } from "../config";
import { DemoChurch } from "./demo";
import { SnapshotChurch } from "./planning-center";
import { hasRealData, loadSnapshot } from "./snapshot";
import type { ChurchData } from "./types";

/**
 * The church database Barnabas reads: the church's real people once they're connected (a Planning Center
 * sync or a CSV import), otherwise the demo church. The snapshot is re-read at most every few seconds.
 */
export class ConnectedChurch implements ChurchData {
  private cached: { at: number; data: ChurchData } | null = null;
  private last = "demo";

  constructor(private readonly churchId = config.churchId, private readonly demo: ChurchData = new DemoChurch(), private readonly ttlMs = 5000) {}

  /** The source seen on the latest read ("demo", "planning_center" or "import"). Use `churchSource()` for a fresh answer. */
  get source() {
    return this.last;
  }

  invalidate() {
    this.cached = null;
  }

  async current(): Promise<ChurchData> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.data;
    const snap = await loadSnapshot(this.churchId).catch(() => null);
    const data = hasRealData(snap) ? new SnapshotChurch(snap, this.demo) : this.demo;
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
