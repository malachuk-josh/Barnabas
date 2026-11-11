import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell, requirePageLeader } from "@/components/AppShell";
import { AdminPeople } from "@/components/AdminPeople";
import Link from "next/link";
import { can } from "@/lib/auth/roles";
import { accessFor } from "@/lib/team";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Barnabas" };

/** Church office → Admin: who's on Barnabas, their access, and how Barnabas thinks. Admins only. */
export default async function AdminPage() {
  const { leader, profile } = await requirePageLeader();
  if (!can(await accessFor(leader), "team.manage")) redirect("/");
  return (
    <AppShell profile={profile}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Church office</span>
          <h1>Admin</h1>
          <p className="muted">Add and remove people, send invites, and set what each person can use. Only admins see this page.</p>
        </div>
      </div>
      <AdminPeople />
      <p className="muted small" style={{ marginTop: 20 }}>
        Barnabas&apos;s model, thinking, tone, web search and voice are in <Link href="/settings#ai">Settings → Barnabas and voice</Link>.
      </p>
    </AppShell>
  );
}
