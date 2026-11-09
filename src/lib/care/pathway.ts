import { daysBetween, friendlyDate } from "../dates";
import { PATHWAY_LABELS, PATHWAY_STEPS, type Pathway, type PathwayStep } from "./types";

/**
 * "Next steps": people ready for the next step on the discipleship pathway, each with the reason.
 * Rules, checked in this order:
 *   Discover Faith    came back a second time, or first visited 4+ weeks ago; not in the class, not baptized
 *   Baptism           made a salvation decision; not baptized yet
 *   Membership class  baptized; hasn't taken the membership class and isn't a member
 *   Membership        finished the membership class; not a member yet
 *   Group             first visited 3+ months ago; not in a Growth Group or Life Group
 *   Serving           a member or in a group, attending 6+ months; not serving yet
 */
export type NextStep = {
  key: string;
  name: string;
  personId?: string;
  guestId?: string;
  step: PathwayStep;
  label: string;
  reason: string;
};

const short = (iso: string) => friendlyDate(iso).replace(/^\w+, /, "");

export function nextStepsFor(p: Pathway, asOf: string): NextStep[] {
  const s = p.steps;
  const out: NextStep[] = [];
  const add = (step: PathwayStep, reason: string) =>
    out.push({ key: p.key, name: p.name, personId: p.personId, guestId: p.guestId, step, label: PATHWAY_LABELS[step], reason });
  const since = s.first_visit ? daysBetween(s.first_visit, asOf) : null;

  if (s.first_visit && !s.discover_faith && !s.baptism) {
    if ((p.visits ?? 0) >= 2) add("discover_faith", `Came back for a second visit (first visit ${short(s.first_visit)})`);
    else if (since !== null && since >= 28) add("discover_faith", `First visited ${short(s.first_visit)}, about ${Math.floor(since / 7)} weeks ago`);
  }
  if (s.salvation && !s.baptism) add("baptism", `Salvation decision ${short(s.salvation)}; not baptized yet`);
  if (s.baptism && !s.membership_class && !s.membership) add("membership_class", `Baptized ${short(s.baptism)}; not a member yet`);
  if (s.membership_class && !s.membership) add("membership", `Finished the membership class ${short(s.membership_class)}; ready to join`);
  if (since !== null && since >= 90 && !s.group) add("group", `Attending since ${short(s.first_visit!)} (${Math.floor(since / 30)} months); not in a group yet`);
  if ((s.membership || s.group) && since !== null && since >= 180 && !s.serving) add("serving", `${s.membership ? "A member" : "In a group"}, attending ${Math.floor(since / 30)} months; not serving yet`);
  return out;
}

export function nextSteps(pathways: Pathway[], asOf: string, step?: PathwayStep): NextStep[] {
  const order = new Map(PATHWAY_STEPS.map((s, i) => [s, i]));
  return pathways
    .flatMap((p) => nextStepsFor(p, asOf))
    .filter((n) => !step || n.step === step)
    .sort((a, b) => order.get(a.step)! - order.get(b.step)! || a.name.localeCompare(b.name));
}

/** The furthest step someone has reached, for the pathway table. */
export function furthestStep(p: Pathway): PathwayStep | null {
  for (let i = PATHWAY_STEPS.length - 1; i >= 0; i--) if (p.steps[PATHWAY_STEPS[i]]) return PATHWAY_STEPS[i];
  return null;
}
