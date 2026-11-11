import { defineConfig } from "vitest/config";
import path from "node:path";

/** The Barnabas test conversations (evals): real Claude calls, so they run only on request (npm run evals). */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 60 * 60 * 1000,
    env: {
      BARNABAS_SKIP_LEADER_SEED: "1",
      BARNABAS_ADMIN_EMAILS: "eval-admin@example.org",
      // Nothing can leave the sandbox: no store, texting, email or push is configured here.
      TWILIO_ACCOUNT_SID: "",
      RESEND_API_KEY: "",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
      KV_REST_API_URL: "",
      UPSTASH_REDIS_REST_URL: "",
      REDIS_URL: "",
    },
  },
});
