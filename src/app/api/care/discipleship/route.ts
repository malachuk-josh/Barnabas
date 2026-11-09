import { z } from "zod";
import { isResponse, requireLeader } from "@/lib/auth/require";
import { rawBody, respondCare } from "@/lib/care/http";
import { addClass, ClassInput, completeClass, enroll, markAttendance, setPathwayStep, StepInput } from "@/lib/care/service";
import { PATHWAY_STEPS, type PathwayStep } from "@/lib/care/types";
import { careFor, discipleship } from "@/lib/care/views";
import { today } from "@/lib/dates";

export const runtime = "nodejs";

/** The pathway, classes and who's ready for a next step (?step= to filter). */
export async function GET(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const step = new URL(request.url).searchParams.get("step");
    const { book } = await careFor(leader);
    return discipleship(book, today(), (PATHWAY_STEPS as readonly string[]).includes(step ?? "") ? (step as PathwayStep) : undefined);
  });
}

const Id = z.string().min(1).max(60);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set-step"), step: StepInput }),
  z.object({ action: z.literal("add-class"), class: ClassInput }),
  z.object({ action: z.literal("enroll"), classId: Id, key: Id }),
  z.object({ action: z.literal("attendance"), classId: Id, sessionId: Id, key: Id, present: z.boolean() }),
  z.object({ action: z.literal("complete"), classId: Id, key: Id, date: z.string() }),
]);

export async function POST(request: Request) {
  const leader = await requireLeader();
  if (isResponse(leader)) return leader;
  return respondCare(async () => {
    const input = Action.parse(await rawBody(request));
    const { actor } = await careFor(leader);
    switch (input.action) {
      case "set-step":
        return { pathway: await setPathwayStep(actor, input.step) };
      case "add-class":
        return { class: await addClass(actor, input.class) };
      case "enroll":
        return { class: await enroll(actor, input.classId, input.key) };
      case "attendance":
        return { class: await markAttendance(actor, input.classId, input.sessionId, input.key, input.present) };
      case "complete":
        return { class: await completeClass(actor, input.classId, input.key, input.date) };
    }
  });
}
