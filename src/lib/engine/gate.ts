import { isAffirmative } from "../policy/confirm";
import type { ConversationMeta } from "../data/conversations";

/**
 * The confirmation gate for outward or destructive actions: the first call records what was proposed in
 * `meta.pending`; it runs only when a later turn calls again with exactly the same details and the
 * leader's words are a clear yes.
 */
export function gateConfirmed(ctx: { meta: ConversationMeta; lastUserText: string }, toolName: string, key: string): boolean {
  const pending = ctx.meta.pending;
  const confirmed = pending?.tool === toolName && pending.key === key && pending.turn < ctx.meta.turns && isAffirmative(ctx.lastUserText);
  if (confirmed) {
    ctx.meta.pending = undefined;
    return true;
  }
  ctx.meta.pending = { tool: toolName, key, turn: ctx.meta.turns };
  return false;
}
