import { describe, expect, it } from "vitest";
import { isAffirmative } from "@/lib/policy/confirm";
import { detectCrisis } from "@/lib/policy/crisis";

describe("confirmation", () => {
  it.each(["Yes", "yeah send it", "Go ahead", "Sounds good", "Sí", "네", "ok, do it"])("accepts %s", (t) => {
    expect(isAffirmative(t)).toBe(true);
  });
  it.each(["No", "wait, change the time", "don't send it yet", "Can you also text Marcus?", "", "hold on"])("rejects %s", (t) => {
    expect(isAffirmative(t)).toBe(false);
  });
});

describe("crisis detection", () => {
  it.each(["I think he might hurt himself", "she said she wants to die", "worried about suicide", "habló de quitarse la vida"])("detects %s", (t) => {
    expect(detectCrisis(t)).toBe(true);
  });
  it.each(["Who needs a call this week?", "The kids team is tired", "Let's plan the food drive"])("ignores %s", (t) => {
    expect(detectCrisis(t)).toBe(false);
  });
});
