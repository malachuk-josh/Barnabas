import { ConnectedChurch } from "./connected";
import type { ChurchData } from "./types";

export * from "./types";

let church: ChurchData | null = null;

/**
 * The church database: Barnabas's own People database once it has anyone in it (the native adapter,
 * `src/lib/people/native.ts`), otherwise the demo church (`src/lib/chms/connected.ts`). Tests can replace it.
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

/** "demo" or "native" (the church's own People database), read fresh. */
export async function churchSource(): Promise<string> {
  const data = churchData();
  if (data instanceof ConnectedChurch) return (await data.current()).source;
  return data.source;
}
