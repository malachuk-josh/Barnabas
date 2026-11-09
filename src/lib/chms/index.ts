import { ConnectedChurch } from "./connected";
import type { ChurchData } from "./types";

export * from "./types";

let church: ChurchData | null = null;

/**
 * The connected church database: the church's real people from Planning Center or a CSV import when
 * they're connected (`src/lib/chms/connected.ts`), otherwise the demo church. Tests can replace it.
 */
export function churchData(): ChurchData {
  if (!church) church = new ConnectedChurch();
  return church;
}

export function setChurchData(data: ChurchData) {
  church = data;
}

/** After a sync or import: read the snapshot again on the next call. */
export function invalidateChurchData() {
  if (church instanceof ConnectedChurch) church.invalidate();
}

/** "demo", "planning_center" or "import", read fresh. */
export async function churchSource(): Promise<string> {
  const data = churchData();
  if (data instanceof ConnectedChurch) return (await data.current()).source;
  return data.source;
}
