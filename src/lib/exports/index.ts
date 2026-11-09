import type { Leader } from "../auth/session";
import { can, type Access, type Permission } from "../auth/roles";
import { churchData } from "../chms";
import { toCsv } from "../csv/columns";
import { audit } from "../data/records";
import { addDays, today } from "../dates";
import { loadEvents } from "../events/store";
import { donorSummaries } from "../finance/giving";
import { loadBooks } from "../finance/store";
import { METHOD_LABELS } from "../finance/types";
import { gathering } from "../ops/gatherings";
import { loadServe } from "../serve/store";
import { isActive } from "../people/native";
import { loadPeople } from "../people/store";

/**
 * CSV exports: the directory, serving rosters, event registrations and giving summaries. Each is checked
 * against the leader's role and written to the audit log; cells are escaped so spreadsheets never run them.
 */

export const EXPORT_KINDS = ["people", "rosters", "registrations", "giving", "giving-donors"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_INFO: Record<ExportKind, { label: string; description: string; permission?: Permission; also?: Permission }> = {
  people: { label: "People and households", description: "Everyone in the directory with every field: household, status, contact, address, birthdays, groups and custom fields.", permission: "people.export" },
  rosters: { label: "Serving rosters", description: "Who serves where for the last 12 weeks and the next 12: date, gathering, team, position, co-laborer." },
  registrations: { label: "Event registrations", description: "Every registration for every event, with party size, status, check-in and payment.", permission: "events.manage" },
  giving: { label: "Giving summary", description: "Giving by month and fund, with the number of gifts. No names.", permission: "finance.view" },
  "giving-donors": { label: "Giving by giver", description: "Each giver's total this year and last year, for statements. Pastor and treasurer only.", permission: "giving.donors" },
};

export class ExportError extends Error {}

export function canExport(access: Access, kind: ExportKind) {
  const p = EXPORT_INFO[kind].permission;
  return !p || can(access, p);
}

export async function buildExport(leader: Leader, access: Access, kind: ExportKind, asOf = today()): Promise<{ filename: string; csv: string; rows: number }> {
  if (!canExport(access, kind)) throw new ExportError("Your role doesn't include this export.");
  let header: string[] = [];
  let rows: unknown[][] = [];
  if (kind === "people") {
    const book = await loadPeople(leader.churchId);
    const active = book.people.filter(isActive);
    if (active.length) {
      // The whole People record, so the church can always take its data with it.
      const hh = new Map(book.households.map((h) => [h.id, h.name]));
      header = ["First name", "Last name", "Goes by", "Household", "Place in household", "Status", "Member since", "Email", "Mobile", "Home phone", "Street", "City", "State", "ZIP", "Birthdate", "Anniversary", "Language", "Groups", ...book.fields.map((f) => f.label)];
      rows = active.map((p) => [p.firstName, p.lastName, p.nickname, p.householdId ? hh.get(p.householdId) : "", p.householdRole, p.status, p.membershipDate, p.email, p.phone, p.homePhone, p.address?.street, p.address?.city, p.address?.state, p.address?.zip, p.birthdate, p.anniversary, p.language, book.groups.filter((g) => !g.archivedAt && g.memberIds.includes(p.id)).map((g) => g.name).join("; "), ...book.fields.map((f) => p.custom[f.id])]);
    } else {
      const people = await churchData().listPeople();
      header = ["Name", "First name", "Household", "Email", "Phone", "Preferred language", "Small group"];
      rows = people.map((p) => [p.name, p.firstName, p.household, p.email, p.phone, p.language, p.smallGroup]);
    }
  } else if (kind === "rosters") {
    const book = await loadServe(leader.churchId);
    const from = addDays(asOf, -84);
    const to = addDays(asOf, 84);
    header = ["Date", "Gathering", "Team", "Position", "Co-laborer", "Status"];
    rows = book.assignments
      .filter((a) => a.date >= from && a.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.gathering.localeCompare(b.gathering))
      .map((a) => {
        const t = book.teams.find((x) => x.id === a.teamId);
        return [a.date, gathering(a.gathering)?.label ?? a.gathering, t?.name ?? a.teamId, t?.positions.find((p) => p.id === a.positionId)?.name ?? "", book.volunteers.find((v) => v.id === a.volunteerId)?.name ?? "", a.status];
      });
  } else if (kind === "registrations") {
    const book = await loadEvents(leader.churchId);
    header = ["Event", "Event date", "Name", "Email", "Phone", "Party size", "Status", "Checked in", "Payment", "Registered"];
    rows = book.registrations
      .map((r) => ({ r, ev: book.events.find((e) => e.id === r.eventId) }))
      .filter((x) => x.ev)
      .sort((a, b) => a.ev!.date.localeCompare(b.ev!.date) || a.r.createdAt - b.r.createdAt)
      .map(({ r, ev }) => [ev!.title, ev!.date, r.name, r.email, r.phone, r.partySize, r.status, r.checkedInAt ? "Yes" : "No", r.payment.status, new Date(r.createdAt).toISOString().slice(0, 10)]);
  } else if (kind === "giving") {
    const books = await loadBooks(leader.churchId);
    const funds = new Map(books.chart.funds.map((f) => [f.id, f.name]));
    const agg = new Map<string, { total: number; count: number }>();
    for (const g of books.gifts) {
      const key = `${g.date.slice(0, 7)}|${funds.get(g.fundId) ?? g.fundId}|${METHOD_LABELS[g.method]}`;
      const a = agg.get(key) ?? { total: 0, count: 0 };
      a.total += g.amount;
      a.count++;
      agg.set(key, a);
    }
    header = ["Month", "Fund", "Method", "Gifts", "Total (USD)"];
    rows = [...agg].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [...k.split("|"), v.count, (v.total / 100).toFixed(2)]);
  } else {
    const books = await loadBooks(leader.churchId);
    const year = Number(asOf.slice(0, 4));
    header = ["Giver", "Gifts this year", `Total ${year} (USD)`, `Total ${year - 1} (USD)`, "Last gift"];
    rows = donorSummaries(books.gifts, year).map((d) => [d.name, d.count, (d.total / 100).toFixed(2), (d.previousTotal / 100).toFixed(2), d.lastGift]);
  }
  await audit(leader, { action: "export.csv", detail: `${kind}: ${rows.length} rows` });
  return { filename: `barnabas-${kind}-${asOf}.csv`, csv: toCsv(header, rows), rows: rows.length };
}

export function csvResponse(filename: string, csv: string) {
  return new Response(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
