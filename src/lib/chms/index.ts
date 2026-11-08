import { DemoChurch } from "./demo";
import type { ChurchData } from "./types";

export * from "./types";

let church: ChurchData | null = null;

/** The connected church database. Only the demo church exists in this build. */
export function churchData(): ChurchData {
  if (!church) church = new DemoChurch();
  return church;
}

export function setChurchData(data: ChurchData) {
  church = data;
}
