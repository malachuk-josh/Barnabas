import type { Metadata } from "next";
import { requirePageLeader } from "@/components/AppShell";
import { FamiliesView } from "@/components/ops/FamiliesView";
import { KidsNoAccess } from "@/components/ops/KidsViews";
import { KIDS_TABS, OpsFrame } from "@/components/ops/OpsFrame";
import { kidsFor } from "@/lib/kids/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Families · Barnabas" };

export default async function FamiliesPage() {
  const { leader, profile } = await requirePageLeader();
  const { actor, book } = await kidsFor(leader);
  if (!actor.station) return <KidsNoAccess profile={profile} />;
  // Medical notes and full phone numbers only for kids admins.
  const families = book.households
    .map((h) => ({
      ...h,
      guardians: h.guardians.map((g) => ({ ...g, phone: actor.admin ? g.phone : g.phone ? `…${g.phone.replace(/\D/g, "").slice(-4)}` : undefined })),
      children: h.children.map((c) => ({ ...c, medical: actor.admin ? c.medical : undefined })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <OpsFrame profile={profile} eyebrow="Kids" title="Families" intro={actor.admin ? "Each family once: guardians, children, allergies and medical notes, and who may pick them up. Medical notes stay here; they're never on labels or shown to Barnabas." : "Families on file. Kids admins add and edit them."} tabs={KIDS_TABS}>
      <FamiliesView families={families} rooms={book.rooms.map((r) => ({ id: r.id, name: r.name }))} admin={actor.admin} />
    </OpsFrame>
  );
}
