import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody } from "@/lib/finance/http";
import { respondPeople } from "@/lib/people/http";
import { isActive } from "@/lib/people/native";
import {
  addField, addNote, archiveGroup, AttendanceInput, duplicates, FieldInput, GroupInput, HouseholdInput, mergePeople, NoteInput, peopleFor, PersonInput, personView, recordAttendance,
  removeField, removeNote, saveGroup, saveHousehold, savePerson, setArchived,
} from "@/lib/people/service";

export const runtime = "nodejs";

/** The directory as this leader may see it (contacts and notes by role), with ?q= to search. */
export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondPeople(async () => {
    const { actor, book } = await peopleFor(leader);
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
    const archived = url.searchParams.get("archived") === "1";
    const people = book.people
      .filter((p) => !p.mergedInto && (archived ? Boolean(p.archivedAt) : isActive(p)))
      .map((p) => personView(book, actor, p))
      .filter((p) => !q || `${p.name} ${p.firstName} ${p.household?.name ?? ""}`.toLowerCase().includes(q));
    return { people, edit: actor.edit, duplicates: actor.edit ? duplicates(book).length : 0 };
  });
}

const Id = z.string().min(1).max(60);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("person"), id: Id.optional(), person: PersonInput }),
  z.object({ action: z.literal("archive"), id: Id, archived: z.boolean() }),
  z.object({ action: z.literal("household"), id: Id.optional(), household: HouseholdInput }),
  z.object({ action: z.literal("merge"), keepId: Id, dropId: Id }),
  z.object({ action: z.literal("group"), id: Id.optional(), group: GroupInput }),
  z.object({ action: z.literal("group-archive"), id: Id }),
  z.object({ action: z.literal("attendance"), attendance: AttendanceInput }),
  z.object({ action: z.literal("note"), personId: Id, note: NoteInput }),
  z.object({ action: z.literal("note-remove"), id: Id }),
  z.object({ action: z.literal("field"), field: FieldInput }),
  z.object({ action: z.literal("field-remove"), id: Id }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondPeople(async () => {
    const input = Action.parse(await rawBody(request));
    const { actor } = await peopleFor(leader);
    switch (input.action) {
      case "person":
        return { id: (await savePerson(actor, input.person, input.id)).id };
      case "archive":
        return { id: (await setArchived(actor, input.id, input.archived)).id };
      case "household":
        return { id: (await saveHousehold(actor, input.household, input.id)).id };
      case "merge":
        return { id: (await mergePeople(actor, input.keepId, input.dropId)).id };
      case "group":
        return { id: (await saveGroup(actor, input.group, input.id)).id };
      case "group-archive":
        return archiveGroup(actor, input.id);
      case "attendance":
        return recordAttendance(actor, input.attendance);
      case "note":
        return { id: (await addNote(actor, input.personId, input.note)).id };
      case "note-remove":
        return removeNote(actor, input.id);
      case "field":
        return { id: (await addField(actor, input.field)).id };
      case "field-remove":
        return removeField(actor, input.id);
    }
  });
}
