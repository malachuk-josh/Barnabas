import { z } from "zod";
import { config } from "../config";
import { normalizeEmail, normalizePhone } from "../messages/phone";
import { checkMemoryText } from "../policy/privacy";
import { displayName, isActive } from "../people/native";
import { addNote, mergePeople, peopleActor, PeopleError, PersonInput, saveGroup, saveHousehold, savePerson, setArchived, type PeopleActor } from "../people/service";
import { loadPeople } from "../people/store";
import { GROUP_LABELS, HOUSEHOLD_ROLES, MEMBER_LABELS, MEMBER_STATUSES, ROLE_LABELS, type Address, type GroupRecord, type HouseholdRecord, type PeopleBook, type PersonRecord } from "../people/types";
import { gateConfirmed } from "./gate";
import type { ActionLink } from "./links";
import type { ToolContext, ToolResult, ToolSpec } from "./tools";

/**
 * Barnabas's tools for the church directory (the People database). Every change goes through the People
 * service, so its rules hold: editing needs people.edit (pastors, staff); notes follow the care roles and
 * the memory policy. Every change to the directory is confirmed in code (the gate): the first call only
 * proposes, and it runs when the leader says yes and the model calls again with exactly the same details.
 */

const ok = (content: unknown, links?: ActionLink[]): ToolResult => ({ content: typeof content === "string" ? content : JSON.stringify(content), isError: false, ...(links?.length ? { links } : {}) });
const fail = (content: string, links?: ActionLink[]): ToolResult => ({ content, isError: true, ...(links?.length ? { links } : {}) });
const tool = <S extends z.ZodTypeAny>(spec: ToolSpec<S>) => spec;

const href = (id: string) => `/people/${encodeURIComponent(id)}`;
const personLink = (p: PersonRecord): ActionLink => ({ label: `Open ${displayName(p)}'s record`, href: href(p.id) });
const GROUPS_LINK: ActionLink = { label: "Open Groups", href: "/people/groups" };

async function actorFor(ctx: ToolContext): Promise<PeopleActor> {
  return peopleActor(ctx.leader);
}
const NO_EDIT = "Only pastors and staff change the church's People records. Say so kindly; they can ask a pastor or the church office.";

async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PeopleError) return fail(err.message);
    if (err instanceof z.ZodError) return fail(err.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; "));
    throw err;
  }
}

const notConfirmed = (toolName: string, question: string) => fail(`Not confirmed yet. Ask: ${question} Call ${toolName} again with the same details after they say yes.`);

function activePerson(book: PeopleBook, id: string): PersonRecord | ToolResult {
  const p = book.people.find((x) => x.id === id);
  if (!p) return fail(`No one with id ${id} is in the directory. Use find_person first and use the person_id it gives.`);
  if (p.mergedInto) {
    const into = book.people.find((x) => x.id === p.mergedInto);
    return fail(`That record was merged into ${into ? `${displayName(into)} (${into.id})` : "another record"}. Use that id.`);
  }
  return p;
}
/** Someone in the directory now (not archived), for household, group and note changes. */
function livePerson(book: PeopleBook, id: string): PersonRecord | ToolResult {
  const p = activePerson(book, id);
  if (isResult(p) || !p.archivedAt) return p;
  return fail(`${displayName(p)} is archived (out of the directory). Bring them back first with archive_person and archived: false, if the leader wants.`);
}
const isResult = (x: unknown): x is ToolResult => Boolean(x && typeof x === "object" && "isError" in x);

/* ---------- Inputs ---------- */

const S = (max: number) => z.string().trim().max(max);
const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-15.");
const AddressIn = z.object({ street: S(120).optional(), city: S(60).optional(), state: S(30).optional(), zip: S(15).optional() });
const ID = z.string().trim().min(1).max(60);

const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const ADDRESS_JSON = { type: "object", properties: { street: str(), city: str(), state: str(), zip: str() } };
const STATUS_JSON = { type: "string", enum: [...MEMBER_STATUSES], description: MEMBER_STATUSES.map((s) => `${s}: ${MEMBER_LABELS[s]}`).join("; ") };
const ROLE_JSON = { type: "string", enum: [...HOUSEHOLD_ROLES], description: HOUSEHOLD_ROLES.map((r) => `${r}: ${ROLE_LABELS[r]}`).join("; ") };
const LANG_JSON = { type: "string", enum: ["en", "es", "ko"], description: "Written language: en English, es Spanish, ko Korean" };
const CONTACT_PROPS = {
  first_name: str(),
  last_name: str(),
  nickname: str("What they go by, if not their first name"),
  email: str(),
  phone: str("Mobile number"),
  home_phone: str(),
  address: ADDRESS_JSON,
  birthdate: str("yyyy-mm-dd; use 1900 as the year when only the month and day are known"),
  anniversary: str("yyyy-mm-dd"),
  status: STATUS_JSON,
  membership_date: str("yyyy-mm-dd"),
  language: LANG_JSON,
};

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  nickname: "Goes by",
  email: "Email",
  phone: "Mobile",
  homePhone: "Home phone",
  address: "Address",
  birthdate: "Birthday",
  anniversary: "Anniversary",
  status: "Status",
  membershipDate: "Member since",
  language: "Language",
};
const LANGS: Record<string, string> = { en: "English", es: "Spanish", ko: "Korean" };
const addressText = (a?: Address) => (a ? [a.street, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "");
function show(field: string, v: unknown): string {
  if (v === undefined || v === null || v === "") return "(none)";
  if (field === "address") return addressText(v as Address) || "(none)";
  if (field === "status") return MEMBER_LABELS[v as keyof typeof MEMBER_LABELS] ?? String(v);
  if (field === "language") return LANGS[String(v)] ?? String(v);
  if (field === "birthdate" && String(v).startsWith("1900-")) return String(v).slice(5);
  return String(v);
}

/* ---------- Likely duplicates ---------- */

const nameKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").trim();

/** Active people who look like the same person: the same email, the same mobile, or the same name (first name or what they go by). */
export function likelyMatches(book: PeopleBook, who: { firstName: string; lastName?: string; email?: string; phone?: string }, exceptId?: string) {
  const email = normalizeEmail(who.email);
  const phone = normalizePhone(who.phone);
  const full = nameKey(`${who.firstName} ${who.lastName ?? ""}`);
  const out: { person: PersonRecord; why: string }[] = [];
  for (const p of book.people) {
    if (!isActive(p) || p.id === exceptId) continue;
    const why =
      email && p.email === email
        ? "same email"
        : phone && p.phone === phone
          ? "same mobile number"
          : full && (nameKey(`${p.firstName} ${p.lastName}`) === full || (p.nickname && nameKey(`${p.nickname} ${p.lastName}`) === full))
            ? "same name"
            : null;
    if (why) out.push({ person: p, why });
  }
  return out;
}

/* ---------- add_person ---------- */

const AddIn = z.object({
  first_name: S(60).min(1),
  last_name: S(60).optional(),
  nickname: S(40).optional(),
  email: S(200).optional(),
  phone: S(30).optional(),
  home_phone: S(30).optional(),
  address: AddressIn.optional(),
  birthdate: ISO.optional(),
  anniversary: ISO.optional(),
  status: z.enum(MEMBER_STATUSES).optional(),
  membership_date: ISO.optional(),
  language: z.enum(["en", "es", "ko"]).optional(),
  household_id: ID.optional(),
  new_household: S(80).optional(),
  household_role: z.enum(HOUSEHOLD_ROLES).optional(),
  not_a_duplicate: z.boolean().optional(),
});

const addPerson = tool({
  phrase: "Let me check the directory first.",
  def: {
    name: "add_person",
    description:
      "Add someone new to the church directory, with whatever details the leader gave (name, email, mobile, address, birthday, status, household). Checks for likely duplicates first (same name, email or mobile); if any turn up it returns them instead of adding, so ask the leader whether it's one of them. " +
      "Only when they say it's someone new, call again with not_a_duplicate: true. Confirmed in code: the first call only proposes; ask, and call again with the same details after they say yes. For pastors and staff.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        ...CONTACT_PROPS,
        household_id: str("An existing household's id, to add them to it"),
        new_household: str("Name for a new household to start with them, e.g. 'The Rivera Family'"),
        household_role: ROLE_JSON,
        not_a_duplicate: { type: "boolean", description: "true only after the leader said this is someone new, not one of the likely matches" },
      },
      required: ["first_name"],
    },
  },
  schema: AddIn,
  async run(input, ctx) {
    const actor = await actorFor(ctx);
    if (!actor.edit) return fail(NO_EDIT);
    return guard(async () => {
      const draft = {
        firstName: input.first_name,
        lastName: input.last_name ?? "",
        nickname: input.nickname,
        email: input.email,
        phone: input.phone,
        homePhone: input.home_phone,
        address: input.address,
        birthdate: input.birthdate,
        anniversary: input.anniversary,
        status: input.status ?? "regular",
        membershipDate: input.membership_date,
        language: input.language ?? "en",
        householdId: input.new_household ? undefined : input.household_id,
        newHousehold: input.new_household,
        householdRole: input.household_role,
      };
      const parsed = PersonInput.safeParse(draft);
      if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(" "));
      const v = parsed.data;
      const book = await loadPeople(ctx.leader.churchId);
      const household = v.householdId ? book.households.find((h) => h.id === v.householdId && !h.archivedAt) : undefined;
      if (v.householdId && !household) return fail(`There's no household with id ${v.householdId}. Leave it out, or start a new one with new_household.`);
      const key = JSON.stringify([v.firstName, v.lastName, v.nickname, normalizeEmail(v.email), normalizePhone(v.phone), v.homePhone, v.address, v.birthdate, v.anniversary, v.status, v.membershipDate, v.language, v.householdId, v.newHousehold, v.householdRole]);
      const name = [v.nickname || v.firstName, v.lastName].filter(Boolean).join(" ");
      const matches = likelyMatches(book, v);
      if (matches.length && !input.not_a_duplicate) {
        // Recorded as proposed (without consuming a yes): if they say it's someone new and yes to adding, the next call with not_a_duplicate runs.
        ctx.meta.pending = { tool: "add_person", key, turn: ctx.meta.turns };
        return fail(
          JSON.stringify({
            not_added: true,
            likely_matches: matches.slice(0, 5).map((m) => ({ person_id: m.person.id, name: displayName(m.person), why: m.why, status: MEMBER_LABELS[m.person.status] })),
            say: `Don't add them yet. Ask the leader whether ${name} is one of these people already in the directory. If it is, use that person_id (update_person can change their details). Only if they say it's someone new and yes, add them, call add_person again with the same details and not_a_duplicate: true.`,
          }),
          matches.slice(0, 4).map((m) => personLink(m.person)),
        );
      }
      if (!gateConfirmed(ctx, "add_person", key)) {
        const parts = [
          v.email && `email ${normalizeEmail(v.email)}`,
          v.phone && `mobile ${v.phone}`,
          v.homePhone && `home phone ${v.homePhone}`,
          v.address && addressText(v.address) && `address ${addressText(v.address)}`,
          v.birthdate && `birthday ${show("birthdate", v.birthdate)}`,
          v.anniversary && `anniversary ${v.anniversary}`,
          v.membershipDate && `member since ${v.membershipDate}`,
          v.language !== "en" && `writes in ${LANGS[v.language]}`,
          household && `in the ${household.name} household${v.householdRole ? ` (${ROLE_LABELS[v.householdRole]})` : ""}`,
          v.newHousehold && `starting a new household, ${v.newHousehold}${v.householdRole ? ` (${ROLE_LABELS[v.householdRole]})` : ""}`,
        ].filter(Boolean);
        return notConfirmed("add_person", `add ${name} to the church directory as ${MEMBER_LABELS[v.status].toLowerCase()}${parts.length ? `, with ${parts.join("; ")}` : ""}?`);
      }
      const p = await savePerson(actor, draft);
      return ok({ added: true, person_id: p.id, name: displayName(p), say: "Tell them in a sentence that they're in the directory, and offer the link to their record." }, [personLink(p)]);
    });
  },
});

/* ---------- update_person ---------- */

const UpdateIn = z.object({
  person_id: ID,
  first_name: S(60).min(1).optional(),
  last_name: S(60).optional(),
  nickname: S(40).optional(),
  email: S(200).optional(),
  phone: S(30).optional(),
  home_phone: S(30).optional(),
  address: AddressIn.optional(),
  birthdate: ISO.or(z.literal("")).optional(),
  anniversary: ISO.or(z.literal("")).optional(),
  status: z.enum(MEMBER_STATUSES).optional(),
  membership_date: ISO.or(z.literal("")).optional(),
  language: z.enum(["en", "es", "ko"]).optional(),
});

const EDITABLE = ["firstName", "lastName", "nickname", "email", "phone", "homePhone", "address", "birthdate", "anniversary", "status", "membershipDate", "language"] as const;

const updatePerson = tool({
  phrase: "Let me pull up their record.",
  def: {
    name: "update_person",
    description:
      "Change one person's details in the church directory: name, what they go by, email, mobile, home phone, address, birthday, anniversary, status (member, regular attender, visitor…), member-since date or written language. Use the person_id from find_person. " +
      "Send only what changes; an empty string clears a field. Confirmed in code: the first call shows the old and new values to ask about; call again with the same details after they say yes. For pastors and staff.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { person_id: str(), ...CONTACT_PROPS }, required: ["person_id"] },
  },
  schema: UpdateIn,
  async run(input, ctx) {
    const actor = await actorFor(ctx);
    if (!actor.edit) return fail(NO_EDIT);
    return guard(async () => {
      const book = await loadPeople(ctx.leader.churchId);
      const p = livePerson(book, input.person_id);
      if (isResult(p)) return p;
      const before = { firstName: p.firstName, lastName: p.lastName, nickname: p.nickname, email: p.email, phone: p.phone, homePhone: p.homePhone, address: p.address, birthdate: p.birthdate, anniversary: p.anniversary, status: p.status, membershipDate: p.membershipDate, language: p.language };
      const address = input.address ? { ...(p.address ?? {}), ...input.address } : p.address;
      const merged = {
        ...before,
        ...(input.first_name !== undefined && { firstName: input.first_name }),
        ...(input.last_name !== undefined && { lastName: input.last_name }),
        ...(input.nickname !== undefined && { nickname: input.nickname }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.home_phone !== undefined && { homePhone: input.home_phone }),
        ...(input.birthdate !== undefined && { birthdate: input.birthdate }),
        ...(input.anniversary !== undefined && { anniversary: input.anniversary }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.membership_date !== undefined && { membershipDate: input.membership_date }),
        ...(input.language !== undefined && { language: input.language }),
        address,
        householdId: p.householdId,
        householdRole: p.householdRole,
        custom: {},
      };
      const parsed = PersonInput.safeParse(merged);
      if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(" "));
      const after = { ...parsed.data, email: normalizeEmail(parsed.data.email) ?? undefined, phone: normalizePhone(parsed.data.phone) ?? undefined, address: parsed.data.address && Object.values(parsed.data.address).some(Boolean) ? parsed.data.address : undefined };
      const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (a === "" && b === undefined) || (a === undefined && b === "");
      const changes = EDITABLE.filter((k) => !same(k === "address" ? addressText(before.address) : before[k], k === "address" ? addressText(after.address) : after[k])).map((k) => ({ field: k, from: before[k], to: after[k] }));
      if (!changes.length) return ok({ unchanged: true, note: `${displayName(p)}'s record already has those details.` }, [personLink(p)]);
      const summary = changes.map((c) => `${FIELD_LABELS[c.field]}: ${show(c.field, c.from)} → ${show(c.field, c.to)}`).join("; ");
      const clash = likelyMatches(book, { firstName: "", email: after.email, phone: after.phone }, p.id).filter((m) => m.why !== "same name");
      if (!gateConfirmed(ctx, "update_person", JSON.stringify([p.id, changes.map((c) => [c.field, c.to ?? null])]))) {
        const warn = clash.length ? ` (Note: ${clash.map((m) => `${displayName(m.person)} has the ${m.why.replace("same ", "")}`).join(", ")}; ask whether they're the same person before going on.)` : "";
        return fail(`Not confirmed yet. Ask: change ${displayName(p)}'s record: ${summary}?${warn} Call update_person again with the same details after they say yes.`, [personLink(p)]);
      }
      const saved = await savePerson(actor, merged, p.id);
      return ok({ updated: true, person_id: saved.id, name: displayName(saved), changed: summary, say: "Tell them in a sentence what changed, and offer the link." }, [personLink(saved)]);
    });
  },
});

/* ---------- Households ---------- */

function findHousehold(book: PeopleBook, ref: string): HouseholdRecord | ToolResult {
  const live = book.households.filter((h) => !h.archivedAt);
  const byId = live.find((h) => h.id === ref);
  if (byId) return byId;
  const named = live.filter((h) => h.name.toLowerCase() === ref.trim().toLowerCase());
  const loose = named.length ? named : live.filter((h) => h.name.toLowerCase().includes(ref.trim().toLowerCase()));
  if (loose.length === 1) return loose[0];
  if (!loose.length) return fail(`No household called "${ref}". Use same_household_as with someone already in it, or new_household to start one.`);
  return fail(`More than one household matches "${ref}": ${loose.slice(0, 6).map((h) => `${h.name} (${h.id})`).join(", ")}. Ask which, or use same_household_as with someone in it.`);
}

const HouseholdIn = z.object({ person_id: ID, household: S(80).min(1).optional(), same_household_as: ID.optional(), new_household: S(80).min(1).optional(), role: z.enum(HOUSEHOLD_ROLES).default("other") });

const addToHousehold = tool({
  phrase: "Let me look at their household.",
  def: {
    name: "add_to_household",
    description:
      "Put someone in a household in the directory: an existing household (by its name or id), the same household as another person (same_household_as, their person_id), or a new household (new_household, its name). Moves them out of any household they were in. Give their role. " +
      "Confirmed in code: the first call only proposes; ask, and call again with the same details after they say yes. For pastors and staff.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { person_id: str(), household: str("An existing household's name or id"), same_household_as: str("person_id of someone already in the household"), new_household: str("Name for a new household, e.g. 'The Rivera Family'"), role: ROLE_JSON },
      required: ["person_id", "role"],
    },
  },
  schema: HouseholdIn,
  async run(input, ctx) {
    const actor = await actorFor(ctx);
    if (!actor.edit) return fail(NO_EDIT);
    const given = [input.household, input.same_household_as, input.new_household].filter(Boolean).length;
    if (given !== 1) return fail("Give exactly one of household, same_household_as or new_household.");
    return guard(async () => {
      const book = await loadPeople(ctx.leader.churchId);
      const p = livePerson(book, input.person_id);
      if (isResult(p)) return p;
      let h: HouseholdRecord | undefined;
      if (input.household) {
        const found = findHousehold(book, input.household);
        if (isResult(found)) return found;
        h = found;
      } else if (input.same_household_as) {
        const other = livePerson(book, input.same_household_as);
        if (isResult(other)) return other;
        h = other.householdId ? book.households.find((x) => x.id === other.householdId && !x.archivedAt) : undefined;
        if (!h) return fail(`${displayName(other)} isn't in a household yet. Offer to start one (new_household) with both of them.`);
      }
      const current = p.householdId ? book.households.find((x) => x.id === p.householdId) : undefined;
      if (h && current?.id === h.id && p.householdRole === input.role) return ok({ unchanged: true, note: `${displayName(p)} is already in the ${h.name} household as ${ROLE_LABELS[input.role]}.` }, [personLink(p)]);
      const target = h ? `the ${h.name} household` : `a new household, ${input.new_household}`;
      const moving = current && current.id !== h?.id ? ` (moving them out of the ${current.name} household)` : "";
      if (!gateConfirmed(ctx, "add_to_household", JSON.stringify([p.id, h?.id ?? null, input.new_household ?? null, input.role]))) {
        return notConfirmed("add_to_household", `put ${displayName(p)} in ${target} as ${ROLE_LABELS[input.role].toLowerCase()}${moving}?`);
      }
      let saved: HouseholdRecord;
      if (h) {
        const members = book.people.filter((x) => x.householdId === h!.id && x.id !== p.id).map((x) => ({ personId: x.id, role: x.householdRole ?? ("other" as const) }));
        saved = await saveHousehold(actor, { name: h.name, homePhone: h.homePhone, address: h.address, members: [...members, { personId: p.id, role: input.role }] }, h.id);
      } else {
        saved = await saveHousehold(actor, { name: input.new_household!, members: [{ personId: p.id, role: input.role }] });
      }
      return ok({ done: true, person_id: p.id, household: saved.name, household_id: saved.id, role: ROLE_LABELS[input.role], say: "Tell them in a sentence, and offer the link." }, [personLink(p)]);
    });
  },
});

/* ---------- Groups ---------- */

function findGroup(book: PeopleBook, ref: string): GroupRecord | ToolResult {
  const live = book.groups.filter((g) => !g.archivedAt);
  const byId = live.find((g) => g.id === ref);
  if (byId) return byId;
  const q = ref.trim().toLowerCase();
  const named = live.filter((g) => g.name.toLowerCase() === q);
  const loose = named.length ? named : live.filter((g) => g.name.toLowerCase().includes(q));
  if (loose.length === 1) return loose[0];
  if (!loose.length) return fail(`No group called "${ref}". Groups: ${live.map((g) => g.name).join(", ") || "none yet"}.`, [GROUPS_LINK]);
  return fail(`More than one group matches "${ref}": ${loose.slice(0, 8).map((g) => `${g.name} (${g.id})`).join(", ")}. Ask which.`);
}

const groupInput = (g: GroupRecord, memberIds: string[], leaderIds: string[]) => ({ name: g.name, kind: g.kind, meets: g.meets, description: g.description, memberIds, leaderIds });

const listGroups = tool({
  phrase: "Let me look at the groups.",
  def: {
    name: "list_groups",
    description:
      "The church's groups (small groups, classes, ministries, teams) with when they meet, who leads and how many are in each. Give group to see one group's members, or person_id to see which groups someone is in. Read-only.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { group: str("A group's name or id, to list its members"), person_id: str("To see the groups one person is in") } },
  },
  schema: z.object({ group: S(80).min(1).optional(), person_id: ID.optional() }),
  async run(input, ctx) {
    const book = await loadPeople(ctx.leader.churchId);
    const nameOf = (id: string) => {
      const p = book.people.find((x) => x.id === id && isActive(x));
      return p ? displayName(p) : null;
    };
    const card = (g: GroupRecord) => ({ group_id: g.id, name: g.name, kind: GROUP_LABELS[g.kind], meets: g.meets ?? null, leaders: g.leaderIds.map(nameOf).filter(Boolean), members: g.memberIds.filter((id) => nameOf(id)).length });
    if (input.group) {
      const g = findGroup(book, input.group);
      if (isResult(g)) return g;
      const members = g.memberIds.map((id) => ({ person_id: id, name: nameOf(id), leader: g.leaderIds.includes(id) || undefined })).filter((m) => m.name).sort((a, b) => a.name!.localeCompare(b.name!));
      return ok({ ...card(g), description: g.description ?? null, people: members.slice(0, 60), more: members.length > 60 ? members.length - 60 : undefined }, [GROUPS_LINK]);
    }
    let groups = book.groups.filter((g) => !g.archivedAt);
    if (input.person_id) {
      const p = activePerson(book, input.person_id);
      if (isResult(p)) return p;
      groups = groups.filter((g) => g.memberIds.includes(p.id) || g.leaderIds.includes(p.id));
      return ok({ person: displayName(p), groups: groups.map((g) => ({ ...card(g), leads: g.leaderIds.includes(p.id) || undefined })) }, [personLink(p), GROUPS_LINK]);
    }
    if (!groups.length) return ok({ groups: [], note: "There are no groups in the directory yet. A pastor or staff member can add them under People → Groups." }, [GROUPS_LINK]);
    return ok({ groups: groups.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40).map(card) }, [GROUPS_LINK]);
  },
});

const GroupChangeIn = z.object({ person_id: ID, group: S(80).min(1), as_leader: z.boolean().optional() });

const addToGroup = tool({
  phrase: "Let me find that group.",
  def: {
    name: "add_to_group",
    description:
      "Add someone to a group (small group, class, ministry, team) in the directory, by the group's name or id; as_leader: true makes them one of its leaders. Confirmed in code: the first call only proposes; ask, and call again with the same details after they say yes. For pastors and staff.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { person_id: str(), group: str("The group's name or id (list_groups)"), as_leader: { type: "boolean" } }, required: ["person_id", "group"] },
  },
  schema: GroupChangeIn,
  async run(input, ctx) {
    const actor = await actorFor(ctx);
    if (!actor.edit) return fail(NO_EDIT);
    return guard(async () => {
      const book = await loadPeople(ctx.leader.churchId);
      const p = livePerson(book, input.person_id);
      if (isResult(p)) return p;
      const g = findGroup(book, input.group);
      if (isResult(g)) return g;
      const leader = Boolean(input.as_leader);
      const already = g.memberIds.includes(p.id) && (!leader || g.leaderIds.includes(p.id));
      if (already) return ok({ unchanged: true, note: `${displayName(p)} is already in ${g.name}${leader ? " as a leader" : ""}.` }, [personLink(p), GROUPS_LINK]);
      if (leader && g.leaderIds.length >= 10) return fail(`${g.name} already has ten leaders, the most a group can have.`);
      if (!gateConfirmed(ctx, "add_to_group", JSON.stringify([p.id, g.id, leader]))) {
        return notConfirmed("add_to_group", `add ${displayName(p)} to ${g.name}${leader ? " as a leader" : ""}?`);
      }
      await saveGroup(actor, groupInput(g, [...new Set([...g.memberIds, p.id])], leader ? [...new Set([...g.leaderIds, p.id])] : g.leaderIds), g.id);
      return ok({ added: true, person: displayName(p), group: g.name, as_leader: leader || undefined, say: "Tell them in a sentence." }, [personLink(p), GROUPS_LINK]);
    });
  },
});

const removeFromGroup = tool({
  phrase: "Let me find that group.",
  def: {
    name: "remove_from_group",
    description:
      "Take someone out of a group in the directory (and off its leaders), by the group's name or id; with as_leader: true they stay a member and only stop leading it. Confirmed in code: the first call only proposes; ask, and call again with the same details after they say yes. For pastors and staff.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { person_id: str(), group: str("The group's name or id (list_groups)"), as_leader: { type: "boolean", description: "true: they stop leading but stay in the group" } }, required: ["person_id", "group"] },
  },
  schema: GroupChangeIn,
  async run(input, ctx) {
    const actor = await actorFor(ctx);
    if (!actor.edit) return fail(NO_EDIT);
    return guard(async () => {
      const book = await loadPeople(ctx.leader.churchId);
      const p = livePerson(book, input.person_id);
      if (isResult(p)) return p;
      const g = findGroup(book, input.group);
      if (isResult(g)) return g;
      const onlyLeading = Boolean(input.as_leader);
      if (onlyLeading ? !g.leaderIds.includes(p.id) : !g.memberIds.includes(p.id) && !g.leaderIds.includes(p.id)) {
        return ok({ unchanged: true, note: `${displayName(p)} ${onlyLeading ? "doesn't lead" : "isn't in"} ${g.name}.` }, [personLink(p), GROUPS_LINK]);
      }
      if (!gateConfirmed(ctx, "remove_from_group", JSON.stringify([p.id, g.id, onlyLeading]))) {
        return notConfirmed("remove_from_group", onlyLeading ? `have ${displayName(p)} stop leading ${g.name} (staying in the group)?` : `take ${displayName(p)} out of ${g.name}?`);
      }
      const leaders = g.leaderIds.filter((x) => x !== p.id);
      await saveGroup(actor, groupInput(g, onlyLeading ? g.memberIds : g.memberIds.filter((x) => x !== p.id), leaders), g.id);
      return ok({ removed: true, person: displayName(p), group: g.name, still_member: onlyLeading || undefined, say: "Tell them in a sentence." }, [personLink(p), GROUPS_LINK]);
    });
  },
});

/* ---------- Notes ---------- */

const addPersonNote = tool({
  phrase: "Let me add that to their record.",
  def: {
    name: "add_person_note",
    description:
      "Add a short note to someone's record in the directory, for the pastors, deacons and staff who follow up (e.g. 'Prefers a call to a text'). private: true makes it pastors-only. Notes follow the church's privacy policy: no health, counseling, family conflict, addiction, legal or money details, codes or children's details; keep it to a minimal follow-up. " +
      "Confirmed in code: the first call only proposes; ask, and call again with the same details after they say yes.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { person_id: str(), text: str("The note, one or two plain sentences"), private: { type: "boolean", description: "Pastors only" } }, required: ["person_id", "text"] },
  },
  schema: z.object({ person_id: ID, text: S(1000).min(1), private: z.boolean().default(false) }),
  async run(input, ctx) {
    if (ctx.meta.offRecord) return fail("This conversation is off the record, so nothing is written down, not even a note on someone's record. Say so; they can add it on the person's page.");
    const actor = await actorFor(ctx);
    if (!actor.notes) return fail("Pastors, deacons and staff keep notes on people. Say so kindly.");
    if (input.private && !actor.privateNotes) return fail("Only pastors keep private notes. Offer to add it as an ordinary note, or leave it out.");
    const problem = checkMemoryText(input.text, { allowSensitive: config.allowSensitiveMemory });
    if (problem) return fail(problem.replace(/^Not saved/, "Not saved to the note"));
    return guard(async () => {
      const book = await loadPeople(ctx.leader.churchId);
      const p = livePerson(book, input.person_id);
      if (isResult(p)) return p;
      if (!gateConfirmed(ctx, "add_person_note", JSON.stringify([p.id, input.text, input.private]))) {
        return notConfirmed("add_person_note", `add this ${input.private ? "private (pastors-only) " : ""}note to ${displayName(p)}'s record: "${input.text}"?`);
      }
      await addNote(actor, p.id, { text: input.text, private: input.private });
      return ok({ added: true, person: displayName(p), private: input.private || undefined, say: "Tell them in a few words that it's on their record." }, [personLink(p)]);
    });
  },
});

/* ---------- Archive and merge ---------- */

const archivePerson = tool({
  phrase: "Let me pull up their record.",
  def: {
    name: "archive_person",
    description:
      "Take someone out of the church directory (archive them: their history stays, nothing is deleted, and it can be undone), or bring an archived person back with archived: false. Use for people who've moved away or left; for someone who is a duplicate, use merge_people instead. " +
      "Confirmed in code: the first call only proposes; ask, and call again with the same details after they say yes. For pastors and staff.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { person_id: str(), archived: { type: "boolean", description: "true (default) to archive, false to bring them back" } }, required: ["person_id"] },
  },
  schema: z.object({ person_id: ID, archived: z.boolean().default(true) }),
  async run({ person_id, archived }, ctx) {
    const actor = await actorFor(ctx);
    if (!actor.edit) return fail(NO_EDIT);
    return guard(async () => {
      const book = await loadPeople(ctx.leader.churchId);
      const p = activePerson(book, person_id);
      if (isResult(p)) return p;
      if (Boolean(p.archivedAt) === archived) return ok({ unchanged: true, note: archived ? `${displayName(p)} is already archived.` : `${displayName(p)} is in the directory.` }, [personLink(p)]);
      if (!gateConfirmed(ctx, "archive_person", JSON.stringify([p.id, archived]))) {
        const groups = book.groups.filter((g) => !g.archivedAt && g.memberIds.includes(p.id)).map((g) => g.name);
        return notConfirmed(
          "archive_person",
          archived
            ? `take ${displayName(p)} (${MEMBER_LABELS[p.status].toLowerCase()}) out of the directory? Their record is archived, not deleted: their history stays${groups.length ? ` and they stay listed in ${groups.join(", ")}` : ""}, and they can be brought back from People → Archived.`
            : `bring ${displayName(p)} back into the directory?`,
        );
      }
      await setArchived(actor, p.id, archived);
      return ok({ archived, person: displayName(p), say: archived ? "Tell them it's done and that it can be undone from the person's page." : "Tell them they're back in the directory." }, [personLink(p)]);
    });
  },
});

const MERGE_FIELDS = ["nickname", "email", "phone", "homePhone", "address", "birthdate", "anniversary", "membershipDate", "householdId"] as const;

const mergePeopleTool = tool({
  phrase: "Let me compare the two records.",
  def: {
    name: "merge_people",
    description:
      "Merge a duplicate record into the one to keep: the kept record fills its blank details from the duplicate, and the duplicate's groups, attendance, notes, shepherding, serving and giving links move to the kept record; the duplicate is retired. Use the person_ids from find_person. " +
      "Confirmed in code: the first call shows exactly who is kept and what moves; ask, and call again with the same details after they say yes. For pastors and staff.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { keep_id: str("The record to keep"), duplicate_id: str("The duplicate, merged into the kept one") }, required: ["keep_id", "duplicate_id"] },
  },
  schema: z.object({ keep_id: ID, duplicate_id: ID }),
  async run({ keep_id, duplicate_id }, ctx) {
    const actor = await actorFor(ctx);
    if (!actor.edit) return fail(NO_EDIT);
    if (keep_id === duplicate_id) return fail("Those are the same record. Pick two different people.");
    return guard(async () => {
      const book = await loadPeople(ctx.leader.churchId);
      const keep = activePerson(book, keep_id);
      if (isResult(keep)) return keep;
      const drop = activePerson(book, duplicate_id);
      if (isResult(drop)) return drop;
      if (keep.archivedAt || drop.archivedAt) return fail("One of them is archived. Bring them back into the directory first (archive_person with archived: false), then merge.");
      if (!gateConfirmed(ctx, "merge_people", JSON.stringify([keep.id, drop.id]))) {
        const fills = MERGE_FIELDS.filter((k) => !keep[k] && drop[k]).map((k) => (k === "householdId" ? `household (${book.households.find((h) => h.id === drop.householdId)?.name ?? "theirs"})` : `${FIELD_LABELS[k].toLowerCase()} ${show(k, drop[k])}`));
        const groups = book.groups.filter((g) => !g.archivedAt && g.memberIds.includes(drop.id) && !g.memberIds.includes(keep.id)).map((g) => g.name);
        const attendance = book.attendance.filter((a) => a.personId === drop.id).length;
        const notes = book.notes.filter((n) => n.personId === drop.id).length;
        const moves = [
          fills.length && `fills in ${fills.join(", ")}`,
          groups.length && `adds them to ${groups.join(", ")}`,
          attendance && `moves ${attendance} attendance record${attendance === 1 ? "" : "s"}`,
          notes && `moves ${notes} note${notes === 1 ? "" : "s"}`,
        ].filter(Boolean);
        const differ = displayName(keep) !== displayName(drop) ? ` The names differ (${displayName(keep)} and ${displayName(drop)}), so make sure they're the same person.` : "";
        return fail(
          `Not confirmed yet. Ask: merge ${displayName(drop)} (${drop.id}) into ${displayName(keep)} (${keep.id})? ${displayName(keep)}'s record is kept, with its own details unchanged; the merge ${moves.length ? `${moves.join("; ")}, and ` : ""}points any shepherding, serving and giving records at it. The duplicate is retired and leaves the directory.${differ} Call merge_people again with the same details after they say yes.`,
          [personLink(keep), personLink(drop)],
        );
      }
      const kept = await mergePeople(actor, keep.id, drop.id);
      return ok({ merged: true, kept: { person_id: kept.id, name: displayName(kept) }, retired: drop.id, say: "Tell them in a sentence which record was kept, and offer the link." }, [personLink(kept)]);
    });
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PEOPLE_TOOLS: ToolSpec<any>[] = [addPerson, updatePerson, addToHousehold, listGroups, addToGroup, removeFromGroup, addPersonNote, archivePerson, mergePeopleTool];

export const PEOPLE_TOOL_NAMES = PEOPLE_TOOLS.map((t) => t.def.name as string);
