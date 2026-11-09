import { notFound } from "next/navigation";
import type { RenderCtx } from "@/components/site/Blocks";
import { publicContext } from "@/lib/site/context";
import { siteData } from "@/lib/site/data";
import type { Block } from "@/lib/site/types";

/** The member app's document and block-render context; 404 when there's nothing to show. */
export async function memberContext() {
  const ctx = await publicContext(null);
  if (!ctx.doc) notFound();
  const data = await siteData(ctx.book);
  const render: RenderCtx = { base: ctx.base, suffix: "", data, doc: ctx.doc, pageSlug: "app" };
  return { ...ctx, doc: ctx.doc, data, render };
}

/** A block for a member-app tab, built in code (not stored). */
export const appBlock = <T extends Block>(b: T) => b;
