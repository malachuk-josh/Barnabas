/**
 * Runs the Barnabas test conversations against the real Claude API and grades them.
 *   npm run evals                        all scenarios
 *   EVAL_ONLY=grief-voice,crisis npm run evals
 *   EVAL_TRIALS=3 npm run evals          each scenario three times (behavior varies run to run)
 * Needs ANTHROPIC_API_KEY. Writes evals/results/<time>.json and evals/results/latest.json, and prints
 * a comparison with the previous latest.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, it } from "vitest";
import { setClaude, type ClaudeClient } from "@/lib/engine/claude";
import { freshStore } from "../tests/helpers";
import { useFixtureChurch } from "../tests/fixtures";
import { aiGrade, runChecks, runScenario, transcriptText, type Grade, type Transcript } from "./harness";
import { SCENARIOS } from "./scenarios";

/** Dollars per million tokens: input, output, cache read, cache write. */
const PRICES: Record<string, { in: number; out: number; read: number; write: number }> = {
  opus: { in: 4, out: 20, read: 0.2, write: 5 },
  sonnet: { in: 2, out: 10, read: 0.1, write: 2.5 },
  haiku: { in: 0.1, out: 0.5, read: 0.01, write: 0.125 },
};
const tier = (model: string) => (model.includes("haiku") ? "haiku" : model.includes("sonnet") ? "sonnet" : "opus");

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
const spend = { dollars: 0, calls: 0 };
function add(model: string, u: Usage) {
  const p = PRICES[tier(model)]!;
  spend.calls++;
  spend.dollars += (u.input_tokens * p.in + u.output_tokens * p.out + (u.cache_read_input_tokens ?? 0) * p.read + (u.cache_creation_input_tokens ?? 0) * p.write) / 1e6;
}

/** The real client, counting what each call costs. */
function meteredClient(real: Anthropic): ClaudeClient {
  return {
    beta: {
      messages: {
        stream: ((params: Anthropic.Beta.MessageCreateParamsStreaming, opts?: Anthropic.RequestOptions) => {
          const s = real.beta.messages.stream(params, opts);
          const final = s.finalMessage.bind(s);
          s.finalMessage = async () => {
            const m = await final();
            add(m.model, m.usage as Usage);
            return m;
          };
          return s;
        }) as ClaudeClient["beta"]["messages"]["stream"],
        create: ((params: Anthropic.Beta.MessageCreateParamsNonStreaming, opts?: Anthropic.RequestOptions) =>
          real.beta.messages.create(params, opts).then((m) => {
            if ("usage" in m) add(m.model, m.usage as Usage);
            return m;
          })) as ClaudeClient["beta"]["messages"]["create"],
      },
    },
  };
}

type Result = {
  id: string;
  title: string;
  tags: string[];
  trial: number;
  pass: boolean;
  checks: { name: string; pass: boolean; note?: string }[];
  grade: Grade | null;
  transcript: Transcript;
};

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

describe.skipIf(!hasKey)("Barnabas evals", () => {
  it("runs every scenario and grades it", async () => {
    const real = new Anthropic();
    setClaude(meteredClient(real));
    const only = process.env.EVAL_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
    const trials = Math.max(1, Number(process.env.EVAL_TRIALS ?? 1));
    const scenarios = SCENARIOS.filter((s) => !only?.length || only.includes(s.id));
    const results: Result[] = [];

    for (const s of scenarios) {
      for (let trial = 1; trial <= trials; trial++) {
        freshStore();
        useFixtureChurch();
        let transcript: Transcript = { turns: [] };
        let checks: Result["checks"] = [];
        let grade: Grade | null = null;
        try {
          const run = await runScenario(s);
          transcript = run.transcript;
          checks = await runChecks(s, run.transcript, run.ctx);
          grade = await aiGrade(real, s, run.transcript).catch((err) => {
            checks.push({ name: "AI grader", pass: false, note: `grader failed: ${err instanceof Error ? err.message : String(err)}` });
            return null;
          });
        } catch (err) {
          checks.push({ name: "ran", pass: false, note: err instanceof Error ? err.message : String(err) });
        }
        const pass = checks.every((c) => c.pass) && (!grade || (grade.overall.pass && grade.criteria.every((c) => c.pass)));
        results.push({ id: s.id, title: s.title, tags: s.tags, trial, pass, checks, grade, transcript });
        console.log(`${pass ? "PASS" : "FAIL"}  ${s.id}${trials > 1 ? ` #${trial}` : ""}`);
        if (!pass) {
          for (const c of checks.filter((c) => !c.pass)) console.log(`      x ${c.name}: ${c.note}`);
          for (const c of grade?.criteria.filter((c) => !c.pass) ?? []) console.log(`      x ${c.criterion}: ${c.note}`);
          if (grade && !grade.overall.pass) console.log(`      x overall: ${grade.overall.note}`);
          console.log(
            transcriptText(transcript)
              .split("\n")
              .map((line) => `      | ${line}`)
              .join("\n"),
          );
        }
      }
    }

    const dir = path.resolve(process.cwd(), "evals/results");
    mkdirSync(dir, { recursive: true });
    const latest = path.join(dir, "latest.json");
    const previous = existsSync(latest) ? (JSON.parse(readFileSync(latest, "utf8")) as { results: Result[] }) : null;
    const summary = {
      at: new Date().toISOString(),
      passed: results.filter((r) => r.pass).length,
      total: results.length,
      dollars: Math.round(spend.dollars * 100) / 100,
      calls: spend.calls,
    };
    const out = { summary, results };
    writeFileSync(path.join(dir, `${summary.at.replace(/[:.]/g, "-")}.json`), JSON.stringify(out, null, 2));
    writeFileSync(latest, JSON.stringify(out, null, 2));

    console.log(`\n${summary.passed}/${summary.total} passed · about $${summary.dollars} (${summary.calls} calls)`);
    if (previous) {
      const rate = (rs: Result[], id: string) => {
        const mine = rs.filter((r) => r.id === id);
        return mine.length ? mine.filter((r) => r.pass).length / mine.length : null;
      };
      const changes = scenarios
        .map((s) => ({ id: s.id, before: rate(previous.results, s.id), after: rate(results, s.id) }))
        .filter((c) => c.before !== null && c.before !== c.after);
      console.log(
        changes.length
          ? `Changed since the last run:\n${changes.map((c) => `  ${c.id}: ${Math.round(c.before! * 100)}% -> ${Math.round((c.after ?? 0) * 100)}%`).join("\n")}`
          : "No scenario changed since the last run.",
      );
    }
  }, 60 * 60 * 1000);
});
