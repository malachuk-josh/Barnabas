import { redirect } from "next/navigation";
import { Briefing } from "@/components/Briefing";
import { Talk } from "@/components/Talk";
import { TopBar } from "@/components/TopBar";
import { currentLeader } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const leader = await currentLeader();
  if (!leader) redirect("/signin");
  return (
    <>
      <TopBar name={leader.name} />
      <main className="wrap">
        <div className="home">
          <Talk />
          <Briefing />
        </div>
      </main>
    </>
  );
}
