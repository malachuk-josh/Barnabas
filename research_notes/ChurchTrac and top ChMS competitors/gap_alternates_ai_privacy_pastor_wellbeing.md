# Gap verification for alternate white-space features: (A) privacy-governed AI assistant, (B) pastor and staff wellbeing / care-load tracking

Research date: November 8, 2026. Scope: check whether two backup feature ideas are already on the market, fully or partly, and collect demand evidence. Vendor claims are marked as vendor claims. "Search summary" means the fact came from a search-engine summary of the linked page, not from a full read of the page.

**Bottom line**
- **Candidate A (privacy-governed AI assistant): the gap claim FAILS as stated, and holds only for a narrower version.**
  - Two church platforms already ship the core controls: field- and table-level blocking, PII masking, role-mirrored permissions, and per-query audit logs. They are **MinistryPlatform AI / MP-MCP (ACS Technologies)** and **TouchPoint Software's MCP server**. Rock RMS ships role-based security on AI agents, skills and tools.
  - What remains open:
    - turning a church's *own written AI policy* into enforced rules;
    - detecting sensitive *content* by category (prayer, counseling, minors) inside free-text notes;
    - offering these controls to small and mid-size churches on Planning Center, Pushpay, Tithely, ChurchTrac and similar, where no field-level AI controls or query audit logs are documented;
    - a governance layer that works across vendors.
- **Candidate B (pastor and staff wellbeing / care-load tracking): the gap claim HOLDS, with partial competition from components.**
  - No church management system (ChMS), care tool or pastor-wellness organization found tracks how much care each pastor carries alongside rest and sabbath, flags burnout risk for staff, and alerts elders or the board.
  - The pieces exist separately: task-workload views (Planning Center), an undefined "care team workload" bullet (Church Dashboards + CareNote), care-completion metrics (Undershepherd, CareNote, Notebird), periodic self-assessments (Flourishing in Ministry, WorkWell, Chemistry Staffing), PTO trackers, and Microsoft Viva Insights after-hours metrics.

---

## Candidate A: Do church AI features already include field-level data controls, sensitivity flags, audit logs, or role-based AI permissions?

### Takeaway
Yes, in part. MinistryPlatform AI and TouchPoint already ship most of Candidate A's mechanics:
- MinistryPlatform AI: table and field kill switches, a PII guard, logging of every query, role mirroring.
- TouchPoint: PII redacted by default, audit logging of every tool call, opt-in, write actions off by default.

Planning Center and Rock have partial controls: admin limits on who can connect, user-permission inheritance, and some vendor-hardcoded exclusions. Pushpay, Subsplash, Tithely and Gloo document little beyond permission inheritance and policy templates. No vendor turns a church's own AI policy into enforced rules, and none documents category-specific handling of prayer requests, counseling records or minors' data (beyond Planning Center's hardcoded Check-Ins exclusions). The gap claim fails as stated and holds only for a narrower "policy-as-code, content-aware, cross-vendor, small-church" version.

### Cited Findings

#### Checks of the two earlier search claims
- **Claim 1: "Pushpay offers only an AI-policy document generator."** Partly confirmed.
  - Pushpay's AI Policy Generator produces a custom AI policy *document*. — [Pushpay AI Policy](https://pushpay.com/ai-policy/) (search result title: "Create a Custom AI Policy for Your Church in Minutes")
  - Pushpay's AI Profile Summaries do pull staff notes into an AI summary. A third-party listing says they run "inside the same ChMS permissions" and do not train on church data (search summary).
  - No Pushpay documentation found describes AI-specific field exclusion, sensitivity flags, AI audit logs, or toggles for which roles may use AI. Details below.
- **Claim 2: "Planning Center's 2026 connectors send church data to general-purpose AI tools."** Confirmed, with nuance.
  - The Planning Center MCP sends data to ChatGPT or Claude in real time, within the user's permissions, and under admin limits on who can connect and which products.
  - Planning Center warns that unless the church is on a commercial plan with Anthropic or OpenAI, "these companies can use your conversations to train their models by default." — [Planning Center help: Connect AI tools](https://help.planningcenter.com/en/151880-connect-ai-tools-to-planning-center.html)

#### Planning Center (Ask AI, AI list builder, MCP connectors)
- **Ask AI permissions:** "Ask AI only sees what you already have permission to see, and that's true for everyone on your team." "If you can't see it, Ask AI can't either." It "can look things up, but it can't make changes in your account." — [Planning Center AI page](https://www.planningcenter.com/ai)
- **Ask AI cannot be turned off.** FAQ answer to whether it can be turned off: "Not right now." — [Planning Center AI page](https://www.planningcenter.com/ai)
- **MCP admin controls:**
  - "Org admins can specify who is allowed to connect the Planning Center MCP."
  - They "receive a notification the first time someone connects the MCP."
  - They can "limit which products you want the MCP to access."
  - Through the MCP, AI tools can also create People notes (a write action).
  - — [Planning Center AI page](https://www.planningcenter.com/ai)
- **Connection access levels:** the default is "All users"; admins can change it to "Specific users" or "Organization admins only." Admins "can see who connected and when, and disconnect any user's access." "This doesn't grant anyone a new level of access." — [Planning Center help: Connect AI tools](https://help.planningcenter.com/en/151880-connect-ai-tools-to-planning-center.html)
- **Not on either page:** audit logs or per-query logging, sensitivity flags, field-level exclusion, and any guidance on pastoral care notes or minors. — [Planning Center help](https://help.planningcenter.com/en/151880-connect-ai-tools-to-planning-center.html); [Planning Center AI page](https://www.planningcenter.com/ai)
- **Hardcoded exclusion for Check-Ins (Aug 4, 2026):** "Sensitive fields like security codes, medical notes, and emergency contacts are never included in AI responses." The page says nothing specific about children's data. The exclusion is set by the vendor, not configured by the church. — [Planning Center changelog: Connect your AI tools to Check-Ins](https://www.planningcenter.com/changelog/picolabs/new-ask-your-ai-tools-about-check-ins-attendance-and-headcounts)
- **Training:** "Planning Center and our contractors are prohibited from using your information to train models." — [Planning Center AI page](https://www.planningcenter.com/ai)
- **Timeline:** MCP announced August 2026. — [Planning Center blog](https://www.planningcenter.com/blog/announcing-the-planning-center-mcp-connect-chatgpt-claude-and-other-ai-tools)

#### Pushpay (AI Profile Summaries, Nurture, AI Policy Generator)
- **AI Profile Summaries** combine giving history, attendance, groups, serving status and staff notes into one view. — [Pushpay releases](https://pushpay.com/product/releases/); also search summary of [faith.tools: Pushpay](https://faith.tools/app/pushpay)
- **Privacy claims (search summary):**
  - A Pushpay FAQ says no PII used for AI is exposed to external processors.
  - A third-party listing says summaries run inside ChMS permissions and do not train on church data.
  - — [How Pushpay Builds AI for Faith Communities](https://support.pushpay.com/s/article/How-Pushpay-Builds-AI-for-Faith-Communities); [faith.tools: Pushpay](https://faith.tools/app/pushpay)
  - The Pushpay support page did not render when fetched (JavaScript-only portal), so these claims are unverified.
- **Note visibility (non-AI):**
  - ChMS notes can be set to "Appropriate leaders," "People admins" (Full Read), or "Only me" (Complete package only).
  - The confidential pastoral-care guide says the privacy setting defaults to "This Process Only."
  - Profile Notes are visible to everyone with Full Read unless restricted. The guide is about 3.5 years old.
  - — [Pushpay: Notes in ChMS](https://support.pushpay.com/s/article/Getting-Started-Notes); [Pushpay: Managing Confidential Notes for Pastoral Care](https://support.pushpay.com/s/article/Managing-Confidential-Notes-for-Pastoral-Care) (search summary)
- **Not found:** any source confirming that AI Profile Summaries exclude confidential care notes, or any AI audit log or per-role AI toggle. No Nurture privacy or AI-governance documentation surfaced.

#### Rock RMS (v19 AI Agents, MCP agents, Spark Connected Services)
- **Security on agents, skills and tools:**
  - Admins can "set security on an agent to dictate who can and can't use the agent."
  - Users also need access to each skill, and must have access to a tool before they can use it or even see it.
  - The developer guide advises weighing "how much data you are adding to the context."
  - It does not mention logging or auditing of AI interactions, PII handling, or sensitive data.
  - — [Rock developer docs: AI Agents](https://community.rockrms.com/developer/ai-agents)
- **Defaults (search summary):** new agents default to "RSR - Rock Administrator" security, and marking an agent Public is not enough to secure it. — [Rock developer docs: Agents](https://community.rockrms.com/developer/ai-agents/agents)
- **MCP agents (search summary):** each person authenticates with their own Rock login, so the agent can only access what that person can see. By default only the "RSR - Rock Administration" role has access. — [Rock docs: Set Up an MCP Agent](https://community.rockrms.com/documentation/core-concepts/rock-fundamentals/ai/set-up-an-mcp-agent)
- **Usage tracking:** Rock release notes describe "Spark Connected Services, which enables AI features in Rock with configurable spending limits and usage tracking." Usage tracking here means cost metering; it is not shown to be a data-access audit. — [Rock release notes (search snippet, prior notes)](https://rockrms.com/releasenotes?version=)
- **Prayer moderation:** an AI provider can auto-approve or reject prayer comments and remove last names from prayer requests. This is the only content-level redaction found in a church ChMS. — [Rock prayer docs](https://community.rockrms.com/documentation/engagement/prayer/prayer-requests/administer-prayer-requests)
- **Third-party plugins:**
  - Agent 9 (by 9embers) "is only available to users in the Rock Administrative security role" because it can access sensitive ministry data (search summary). — [Rock Shop: Agent 9](https://www.rockrms.com/rockshop/plugin/221); [9embers blog](https://9embers.com/blog/rock-rms-ai-assistant)
  - Simple Donation's PowerPack is another AI agent for Rock; its controls were not verified. — [PowerPack](https://www.simpledonation.com/powerpack)

#### MinistryPlatform AI and MP-MCP (ACS Technologies): the closest match to Candidate A
- **Table and field controls:** "Turn any table — or individual field — off entirely." "Pastoral notes too sensitive? Lock the whole table." Field toggles cover "a single column like SSN or notes," and hidden data becomes "invisible." The page summarizes: "Exclude Tables. Mask or Block Fields." — [MinistryPlatform AI](https://ai.ministryplatform.com/)
- **Audit trail:** "Every query and every data point logged — customer-reviewable." Each entry shows "the question, the tables touched, the rows returned, the user behind it." It is labeled "Open log · export-ready." — [MinistryPlatform AI](https://ai.ministryplatform.com/)
- **Roles:** access "Mirrors your existing MP roles — enforced at the API." Rules sit with the data, "not in a separate prompt-engineered policy." — [MinistryPlatform AI](https://ai.ministryplatform.com/)
- **PII Guard and response inspection:** "Every response inspected before it reaches the conversation." PII Guard scrubs "what your role isn't allowed to see — in real time, with logging." — [MinistryPlatform AI](https://ai.ministryplatform.com/)
- **Training and storage:** "Never trains any model." "Your congregation is not training data." Context is labeled "Ephemeral." — [MinistryPlatform AI](https://ai.ministryplatform.com/)
- **Status:** the page says "MinistryPlatform AI is generally available." — [MinistryPlatform AI](https://ai.ministryplatform.com/)
- **MP-MCP help page (updated Nov 6, 2026):**
  - "permissions are enforced by the Platform itself — not by the AI."
  - Admins can "hide entire tables from the AI, mask specific fields," "turn off individual capabilities," and "disable the connection entirely."
  - The PII guard is on by default and "hides personally identifiable information, like emails, phone numbers." "Responses are inspected, and sensitive fields are masked before they reach the AI model."
  - "Activity is logged and can be reviewed by your organization."
  - Claude is "Recommended"; ChatGPT is "In Beta"; Gemini and Copilot are not supported.
  - Access requires a Production instance "with an AI subscription," "granted per organization, by request."
  - — [ACST help: MP-MCP](https://help.acst.com/en/ministryplatform/help-topics/integrations/mp-mcp-ai-for-ministryplatform)
- **Launch release (May 7, 2026):** lists "Data response inspection," role-based permissions, audit trails and table-level controls. Data is "retrieved live, securely returned, and not stored or used to train AI models." A Pioneer Program was open to the first 50 churches. No pricing given. — [ACST press release](https://www.acstechnologies.com/company/news/acst-launches-ministry-platform-ai-bringing-secure-ministry-aware-ai-to-churches/)
- **MP-MCP launch (July 2026):** a search summary of the release says a 90-day pioneer program ran with 64 churches before GA in August, and calls the model "guest, not admin." — [Business Wire, Jul 14, 2026](https://www.businesswire.com/news/home/20260714844354/en/); [01net mirror](https://www.01net.it/acst-launches-mp-mcp-giving-churches-a-secure-way-to-use-ai-with-their-ministryplatform-data/)
- **Not addressed** on any MinistryPlatform page: counseling records or minors' data specifically. Controls are structural (table, field, role); none detects content categories inside free text. — [MinistryPlatform AI](https://ai.ministryplatform.com/); [ACST help](https://help.acst.com/en/ministryplatform/help-topics/integrations/mp-mcp-ai-for-ministryplatform)

#### TouchPoint Software (MCP server): second close match
- **Scale:** the MCP server exposes "70+ tools" across people, involvements, attendance, events and giving. — [TouchPoint AI](https://www.touchpointsoftware.com/features/ai-church-management-software/)
- **Permissions:** "MCP extends your existing permissions; it never bypasses them." Each connection needs a Personal Access Token and the McpAccess role. — [TouchPoint AI](https://www.touchpointsoftware.com/features/ai-church-management-software/)
- **PII redaction:** "Contact information and PII remain redacted by default unless explicit roles allow otherwise." Finance data stays finance-gated. — [TouchPoint AI](https://www.touchpointsoftware.com/features/ai-church-management-software/)
- **Audit:** "Every tool call made through the TouchPoint MCP server is written to the audit log." — [TouchPoint AI](https://www.touchpointsoftware.com/features/ai-church-management-software/)
- **Admin controls:**
  - MCP is a per-church opt-in and "is not on by default."
  - Admins acknowledge data handling when they first enable it.
  - "Allow Write Actions" is off by default.
  - "TouchPoint never uses your church's data to train AI models." Data sent to the AI provider falls under that provider's terms.
  - — [TouchPoint AI](https://www.touchpointsoftware.com/features/ai-church-management-software/)
- **Not addressed:** pastoral care, counseling or minors specifically. — [TouchPoint AI](https://www.touchpointsoftware.com/features/ai-church-management-software/)

#### Other ChMS and AI vendors
- **ChurchApps B1 (search summary):** Claude connects through MCP limited to the scopes of an admin-created API key. It can see one church's data, cannot reach admin-only endpoints, and offers a read-only starter scope set. — [ChurchApps support: Claude](https://support.churchapps.org/docs/b1-admin/integrations/claude)
- **Subsplash Trends AI (Mar 2026):** its only listed permission feature is access roles for "trusted leaders to protect sensitive, personal data." Subsplash also offers a free AI Policy Toolkit (a document). — [Subsplash: Introducing Trends AI](https://www.subsplash.com/blog/introducing-trends-ai); [Subsplash: How to build a church AI policy](https://subsplash.com/blog/how-to-build-a-church-ai-policy)
- **Tithely:**
  - TithelyAI was announced in Aug 2025 as a dashboard assistant "ensuring privacy, security, and role-based access," with launch planned for 2026. — [RNS, Aug 26, 2025](https://religionnews.com/2025/08/26/from-giving-apps-to-tap-giving-and-ai-insights-tithely-unveils-innovations-to-help-churches-simply-serve/)
  - faith.tools (Oct 2026) lists a "read-only MCP integration for asking ChatGPT, Claude, or Gemini questions about your church data." — [faith.tools: Tithely (prior notes)](https://faith.tools/app/tithely)
  - No Tithely documentation on field exclusion or audit for the MCP connector was found.
- **Gloo:** its data-privacy FAQ (dated Mar 16, 2023) says Gloo may handle sensitive information about faith, religion, family, health and finances. No Gloo AI-specific permission or audit controls were found. Critics describe Gloo as a behavioral-analytics platform. — [Gloo Trust Center / Data privacy FAQ](https://gloo.com/legal/data-privacy-faq); [Gloo AI docs: Trust](https://docs.gloo.com/learn-more/trust); [Privacy Guides forum](https://discuss.privacyguides.net/t/how-churches-use-data-and-ai-as-engines-of-surveillance/30221)
- **Aligned (aligned.church):** publishes an "AI Privacy Checklist for Churches" and an AI-policy guide with a template. These are guidance content, not enforcement. Its guidance says pastoral counseling notes and crisis details should not go into general-purpose AI. — [Aligned: AI Privacy Checklist](https://aligned.church/blog/ai-privacy-checklist-churches); [Aligned: AI Policy for Churches](https://aligned.church/blog/ai-policy-for-churches)
- **PrayerTrack AI:** described in a vendor-authored buyer guide as having "confidentiality controls." Not verified. — [Aligned: AI Pastoral Care Tools buyer guide](https://aligned.church/blog/ai-pastoral-care-tools)
- **ChurchAI:** no privacy, redaction or audit documentation was found in this pass.

#### Church data-privacy vendors and horizontal tools
- A search for church AI redaction tools found no product that automatically redacts pastoral-care notes. Guidance across sources is to keep identifying details out of AI rather than redact automatically. — [Aligned: AI Privacy Checklist](https://aligned.church/blog/ai-privacy-checklist-churches); [ChurchWest: 5 AI Risks](https://www.churchwest.com/blog/5-ai-risks-every-church-leader-should-know/); [Church Executive: AI, privacy and faithful stewardship](https://churchexecutive.com/archives/ai-privacy-and-faithful-stewardship-what-church-leaders-need-to-know)
- Horizontal, non-church vendors market MCP audit trails and governance (for example Tray.ai, Gravitee, hoop.dev). These are general-purpose, not church-aware. — [Tray.ai: MCP audit trail](https://tray.ai/automate/mcp-audit-trail/); [Gravitee: MCP audit trails](https://www.gravitee.io/corpus/gen-917/business-reporting/model-context-protocol-audit-trails.html)

#### Near-match summary for Candidate A

| Product | What it does (governance) | Where it falls short of Candidate A |
|---|---|---|
| MinistryPlatform AI / MP-MCP (ACST) | Table and field kill switches; PII Guard; response inspection; role mirroring at the API; per-query audit log (question, tables, rows, user); no training. GA. | Large-church ChMS only, and needs an AI subscription. Structural controls only: no content-category detection (prayer, counseling, minors in free text) and no mapping from the church's written AI policy. No pricing published. |
| TouchPoint MCP | PII redacted by default by role; audit log of every tool call; opt-in; write actions off by default; McpAccess role. | TouchPoint customers only. No category-specific handling of care, counseling or minors data; no policy-as-code. |
| Rock RMS v19 AI | Security on agents, skills and tools; per-user MCP authentication; admin-only defaults; spend limits and usage tracking; AI removes last names in prayer. | No documented AI query audit log or field-level AI exclusion; self-hosted complexity; large churches. |
| Planning Center Ask AI / MCP | Permission inheritance; admin limit on who connects; first-connect notification; product scoping; Check-Ins medical notes and security codes hardcoded out. | No query audit log; no church-configurable field exclusion or sensitivity flags; Ask AI cannot be turned off; data flows to consumer ChatGPT or Claude with default training unless the user opts out. |
| Pushpay AI Profile Summaries / Nurture | Reportedly runs inside ChMS permissions; note visibility levels; free AI Policy Generator (a document). | No documented AI field exclusion, AI audit log or AI role toggles; the policy is not enforced in code. |
| Subsplash Trends AI | Access roles for trusted leaders; free AI Policy Toolkit (a document). | No field controls or audit documented. |
| Tithely (TithelyAI, MCP) | Announced role-based access; read-only MCP. | Controls undocumented; general availability of TithelyAI unconfirmed. |
| ChurchApps B1 | Scoped API keys; read-only option. | No audit or sensitivity features documented. |

#### Auditable list of what was checked (Candidate A)
- **Planning Center:** AI page, MCP help article, Check-Ins AI changelog, MCP blog.
- **Pushpay:** AI support article (did not render), notes and confidential-notes guides (search summary), releases page, AI Policy page.
- **Rock RMS:** developer AI Agents docs, MCP agent docs (search summary), prayer docs (prior notes), Agent 9 and PowerPack plugin listings.
- **MinistryPlatform:** AI marketing site, MP-MCP help page, May 2026 and July 2026 press releases.
- **TouchPoint:** AI feature page.
- **Others:** ChurchApps B1 Claude docs (search summary); Subsplash Trends AI and AI policy posts; Tithely RNS announcement and faith.tools listing; Gloo privacy FAQ and trust docs; Aligned privacy checklist and policy guide; ChurchAI (nothing found).
- **General search:** "church AI data privacy redaction pastoral care notes tool," which found no redaction product.

### Inferences
- **The core mechanics of Candidate A are no longer white space.** Field and table blocking, PII masking, role mirroring and query audit logs exist at MinistryPlatform and TouchPoint, and MinistryPlatform even uses "pastoral notes" as its marketing example. Pitching "we block sensitive fields and log AI queries" as novel would not survive diligence.
- **A narrower version may still be open:**
  1. **Policy-as-code.** Load the church's AI policy (for example, one made with Pushpay's or Subsplash's free tools) and enforce it as rules by data category, role and use case. No vendor found turns the policy document into enforcement; MinistryPlatform explicitly avoids "prompt-engineered policy" but relies on admins toggling tables by hand.
  2. **Content-aware sensitivity classification.** Detect counseling, crisis, prayer and minor-related content inside general free-text notes. All shipped controls are structural (table, field, role); MinistryPlatform's PII guard targets contact data.
  3. **Small and mid-size churches.** Planning Center, Pushpay, Tithely and ChurchTrac users have no documented query audit or field-level AI controls, and Planning Center routes data to consumer AI tools with default training unless the user opts out.
  4. **Cross-vendor governance.** A governance proxy in front of each ChMS's MCP (Planning Center, Tithely, Rock, MinistryPlatform). This would be harder to defend, since horizontal MCP-governance vendors exist.
- **Fast-follower risk is high.** Planning Center already hardcodes exclusions (medical notes, security codes) and controls who can connect. Adding audit logs and field toggles would be a small step for it.

### Gaps
- Could not read Pushpay's "How Pushpay Builds AI" support article (JavaScript-only page). Whether AI Profile Summaries exclude "Only me" or "This Process Only" care notes is unconfirmed.
- MinistryPlatform AI and MP-MCP pricing is not published. The audit-log export format and schema are undocumented beyond the marketing description.
- No Tithely help-center documentation for the MCP connector was found. Whether TithelyAI reached general availability in 2026 is unconfirmed.
- No documentation was found on Nurture's privacy controls, ChurchAI's governance, or Gloo AI's role controls.
- Whether Rock writes AI interactions to an audit log (beyond cost and usage tracking) is not documented in the pages read.
- No independent security audit of any vendor's AI controls was found. All governance claims are vendor statements.

---

## Candidate A: What evidence of demand exists (church privacy concerns about AI, AI policy adoption)?

### Takeaway
Demand is well documented. In the Barna/Pushpay study of 1,306 church leaders (fielded Nov–Dec 2025, published Mar 2026), 83% are concerned about data privacy, but only 5% of churches have AI guidelines. On the supply side, vendors now lead their AI pages with security, which confirms the demand but also explains why the core features are already built.

### Cited Findings
- **Barna/Pushpay study (published Mar 26, 2026):**
  - "Eighty-three percent say they are concerned about data privacy."
  - "only 5 percent of churches currently have AI guidelines."
  - "just a third (33%) say that their church is currently using AI in any part of its ministry or operations."
  - 51% worry about plagiarism or integrity in message preparation; 49% about loss of authenticity in preaching.
  - Sample: 1,306 U.S. church leaders (1,027 answered all questions), surveyed Nov 11–Dec 8, 2025.
  - — [Barna: How Church Leaders Are Using AI](https://www.barna.com/research/church-leaders-ai-usage-concerns/)
- **Framing of the 83%:**
  - Pushpay materials state 64% believe an AI policy is important but only 5% have one. — [Pushpay AI Policy](https://pushpay.com/ai-policy/); [GlobeNewswire, Mar 9, 2026](https://www.globenewswire.com/news-release/2026/03/09/3251986/0/en/Pushpay-and-Barna-Group-s-2026-State-of-Church-Technology-Report-Shows-Church-Tech-Has-Moved-Past-Adoption-Now-Alignment-Is-What-Matters.html) (search summary)
  - MinistryWatch frames the 83% as "at least some concern about privacy and security." — [MinistryWatch](https://ministrywatch.com/the-new-church-tech-divide-is-missional-not-digital/)
  - Pushpay's press framing calls data privacy leaders' "number one fear" about AI adoption. That ranking is press framing, not a separate statistic.
- **Related headline:** 65% of pastors worry AI could displace their spiritual guidance. — [Christianity Daily](https://www.christianitydaily.com/news/65-of-pastors-worry-ai-could-displace-their-spiritual-guidance.html)
- **Vendor signals of demand:** Pushpay and Subsplash both give away AI-policy tools, and ACST's launch copy is titled "Secure, Ministry-Aware AI." — [Pushpay AI Policy](https://pushpay.com/ai-policy/); [Subsplash AI policy](https://subsplash.com/blog/how-to-build-a-church-ai-policy); [ACST press release](https://www.acstechnologies.com/company/news/acst-launches-ministry-platform-ai-bringing-secure-ministry-aware-ai-to-churches/)
- **Concrete risk a governance layer addresses:** Planning Center states that unless churches are on commercial AI plans, OpenAI and Anthropic "can use your conversations to train their models by default." — [Planning Center help](https://help.planningcenter.com/en/151880-connect-ai-tools-to-planning-center.html)

### Inferences
- The 5% policy-adoption rate means most churches have no policy to enforce yet. A "policy-as-code" product would first need to help write the policy (as Pushpay and Subsplash already do for free) and then enforce it. Bundling both steps is the defensible wedge.
- The 83% concern, combined with Planning Center sending data to consumer AI tools that train by default unless the user opts out, gives smaller churches a concrete reason to want a governed AI layer.

### Gaps
- No willingness-to-pay data for AI governance features was found.
- No breakdown of the 83% by church size, denomination or role was found.

---

## Candidate B: Do any ChMS, pastor-care tools, or pastor-wellness organizations track staff care load or pastor wellbeing?

### Takeaway
No product found combines what Candidate B describes:
- per-pastor care load (open cases, hospital visits, counseling, crisis calls, hours);
- rest and sabbath tracking;
- burnout-risk flags for staff;
- prompts to elders or the board.

The gap claim holds, but each component exists in isolation:
- **Planning Center:** a Workflow "Assignees" tab showing task counts per person.
- **Church Dashboards + CareNote:** an undefined "care team workload" bullet.
- **Care tools (Undershepherd, CareNote, Notebird):** care completion and response metrics.
- **Self-assessments:** Flourishing in Ministry, the CRC's WorkWell app, Chemistry Staffing's staff health assessment, Restor(y), Church Encourager.
- **Relational care from organizations:** Standing Stone, and Barna's Resilient Pastor CoLab with an assessment hosted by Gloo.
- **Generic HR and workplace tools:** PTO and sabbatical trackers; Viva Insights after-hours metrics.

All the burnout-risk features found in church tools target volunteers (Holy Insights, Vitals), not pastors.

### Cited Findings

#### ChMS vendors
- **Planning Center:**
  - The Workflows "Assignees" tab lets you see "everyone's workload across all your workflows" in one place, listing each person's assigned cards with overdue, snoozed and ready counts.
  - Help docs say to sort columns "to find out who has the heaviest workload." This counts tasks only, with no hours, care type, rest or wellbeing. Prior notes date it to Apr 2026; the changelog page shows no date.
  - — [Planning Center changelog: Workflow Assignees tab](https://planningcenter.com/changelog/people/new-workflow-assignees-tab); [Planning Center help: Workflow overview](https://help.planningcenter.com/en/workflow-overview.html)
- **Pushpay:**
  - Its pastoral-burnout blog (updated Jun 11, 2026) says "No piece of technology can 'solve' or prevent pastor burnout on its own."
  - It positions automation (People snapshots, Needs, the LEAD app, donor dashboards, reporting) as reducing stressors.
  - It names no feature that tracks pastor or staff care load, hours, days off, sabbath or wellbeing, or that alerts boards.
  - — [Pushpay: How ChurchStaq can help with pastoral burnout](https://pushpay.com/blog/how-churchstaq-can-help-with-pastoral-burnout/)
- **Pushpay Nurture:** care task lists aimed at congregants, telling staff "who needs attention." No staff wellbeing features were found. — [Christian Post on Nurture](https://christianpost.com/news/nurture-promises-to-help-churches-care-for-engage-members.html) (prior notes)
- **ChurchTrac:** pastoral care is assembled from Note Types, reminders, tasks and automations, not a dedicated care-pipeline module. No staff wellbeing feature. — prior notes, `churchtrac_features.md`, section 18
- **Rock RMS, MinistryPlatform, Realm:** pastoral care exists (Rock Connections rebuilt in v19; care data in the MinistryPlatform schema; a Realm solution page), but no staff care-load or pastor-wellbeing feature surfaced in these searches or in prior notes. — prior notes, `realm_rock_ministryplatform.md`; [ACST press release](https://www.acstechnologies.com/company/news/acst-launches-ministry-platform-ai-bringing-secure-ministry-aware-ai-to-churches/)

#### Care tools and dashboards (closest partial matches)
- **Church Dashboards (with CareNote):**
  - Lists "Hospital & home visits, Care team workload, Follow-up reminders" under Pastoral Care, with an "exclusive CareNote integration."
  - "Care team workload" is not defined, and there is no wellbeing, sabbath, burnout or board-alert feature.
  - Price: $50/month or $299/year per campus, with a 30-day trial. The product was "launching right now" (2026).
  - — [Church Dashboards](https://www.churchdashboards.app/)
- **CareNote:** tracks each care request from intake to reporting. Volunteers can have email-only access, and teams can send "exactly their slice of a report to elders." The reports cover congregational care, not the pastor's time off. — [CareNote](https://www.carenote.app/) (search summary)
- **Undershepherd:** "task assignment so elders, deacons, and staff can share the load." Its guide says care software can measure "care frequency, response times, and completion rates." — [Undershepherd guide](https://undershepherd.app/pastoral-care-tracking-software-guide/) (search summary)
- **Notebird:** care workflows and reporting, from $12 per user per month (Capterra). One reviewer at a church of over 3,000 members reports up to "a couple hundred" open care cases at a time. — [Capterra: Notebird](https://capterra.com/p/10019047/Notebird/); [Software Advice reviews](https://www.softwareadvice.com/church/notebird-profile/reviews/) (search summary)
- **Holy Insights:** "burnout risk" sits under Volunteer Intelligence ("Bench strength, burnout risk, and who you could recruit next") in the MAX tier ($80/mo). It covers volunteers only, and the page does not describe its signals. — [Holy Insights](https://www.holyinsights.org/)
- **Vitals:** a volunteer health dashboard with "burnout alerts." Volunteers only. — [Vitals](https://vitals.church/) (search summary)

#### Pastor-wellness organizations and assessments
- **Flourishing in Ministry Assessment** (Matt Bloom's project): a free personal wellbeing profile with recommended practices. The project reports more than 20,000 clergy surveys. A waiting-list note may be stale. — [CRCNA: Flourishing in Ministry Study](https://www.crcna.org/pcr/pastors/flourishing-ministry-study); [Wesleyan FIM research PDF](https://cdn.resources.wesleyan.org/wesleyanrc/wp-content/uploads/FIM-Flourishing-in-Ministry.pdf) (search summary)
- **CRC Pastor Church Resources "WorkWell (Wellbeing Practices)" app:** view a wellbeing profile and recommended practices after a roughly 20-minute assessment. It is a personal tool with no care-load or board features. — [CRCNA](https://www.crcna.org/pcr/pastors/flourishing-ministry-study) (search summary)
- **Restor(y) Clergy Wellbeing Assessment:** a short self-survey of emotional, mental and physical wellbeing aimed at avoiding burnout. — [Restor(y)](https://www.restorycenter.com/resources/p/clergy-wellbeing-assessment) (search summary)
- **Church Encourager Pastoral Health Assessment:** a yes/no self-check (prayer, rest, family time, joy, confidant) that works as lead generation for a free call. — [Church Encourager](https://churchencourager.com/pastoral-health-assessment-tool/) (search summary)
- **Anago Partners Pastoral Burnout Self-Assessment:** a free personal tool that emails a summary. — [Anago Partners](https://anagopartners.org/pastoral-burnout) (search summary)
- **Chemistry Staffing Church Staff Health Assessment:**
  - Gives leaders insight into *staff* wellbeing across seven areas; the pastor predicts staff answers and the predictions are compared with actual responses.
  - The 2024 report costs $995; a 2023 version is free.
  - This is the closest org-level staff-health tool, but it is periodic and survey-based, with no care-load or rest tracking.
  - — [Chemistry Staffing](https://www.chemistrystaffing.com/health-assessment/) (search summary)
- **Barna "The Resilient Pastor" CoLab:** a five-week virtual program covering self-care and "building a resilient staff." The assessment is "hosted by our technology partner Gloo." It is a cohort program, not ongoing tracking. — [Barna Resilient Pastor CoLab](https://www.barna.com/resilientpastorcolab) (search summary)
- **Standing Stone Ministry:**
  - Pairs pastors and spouses with veteran "shepherds" in "a monthly rhythm of support," at no charge, and includes a "Wholeness Inventory" covering eight areas of formation.
  - It is relational care, not software. Its 98% success figure is self-reported.
  - — [MinistryWatch: Standing Stone spotlight](https://ministrywatch.com/ministry-spotlight-standing-stone-ministry/); [MinistryWatch: Who shepherds the shepherds](https://ministrywatch.com/who-shepherds-the-shepherds/) (search summary)
- **Gloo:** lists a "Soul Care for Ministry Leaders and Their Spouses" offering (title only seen). — [Gloo Impact](https://impact.gloo.us/offering/soul-care-for-ministry-leaders-and-their-spouses/)

#### General workplace and HR tools churches use
- **Microsoft Viva Insights:**
  - Quiet time, quiet days, after-hours schedule-send suggestions, and org-level policies to mute after-hours notifications.
  - Managers can see the percentage of employees working after hours for more than three hours a week.
  - It measures email and calendar patterns only, with no ministry care categories.
  - — [Microsoft Support: Quiet time in Viva Insights](https://support.microsoft.com/en-US/viva/insights/quiet-time-in-viva-insights); [Microsoft Tech Community, 2022](https://techcommunity.microsoft.com/t5/viva-insights-blog/microsoft-viva-insights-new-productivity-and-wellbeing/ba-p/3648904); [Microsoft Learn](https://learn.microsoft.com/en-us/training/modules/design-productivity-wellbeing-experiences-viva-insights/2-measure-workplace-patterns-viva-insights) (search summary)
- **PTO and sabbatical trackers:** Day Off (custom "sabbatical leave" types), Time Off Cloud (sabbatical reminders), Built (a church PTO and timesheet case study), OrangeHRM (a church HR case study), and payroll suites (Gusto, APS, MinistryWorks). They track leave balances, not care load or burnout. — [Day Off](https://day-off.app/?p=14443); [Time Off Cloud](https://static-copy-of-old-timeoffcloud-site-2022-10-27.pages.dev/industries/faith-based-organizations); [Built: Davisville Church](https://www.builtapp.com/success-stories/davisville-church/); [OrangeHRM: Agincourt](https://orangehrmlive.com/why-orangehrm/our-customers/case-studies/agincourt-case-study); [Gusto: church payroll](https://gusto.com/resources/guides/best-church-payroll) (search summary)
- **Sabbath tracking:** the only sabbath-tracking app found was a personal design concept on Dribbble ("an app I'm currently making with Flutter"). — [Dribbble: Sabbath Tracking App](https://dribbble.com/shots/21176375-Sabbath-Tracking-App)
- **Time logging:** a pastor on NAD Ministerial recommends a generic timer app to log hours by task "for keeping track of my time and avoiding burnout." — [NAD Ministerial](https://www.nadministerial.com/stories/2022/5/1/apps-that-add-to-a-pastors-work-health)

#### Near-match summary for Candidate B

| Product | What it does | Where it falls short |
|---|---|---|
| Planning Center Workflows Assignees tab | Count of cards per staff member (overdue, snoozed, ready); sortable by heaviest load. | Tasks only. No care types (hospital, counseling, crisis), hours, rest or sabbath, burnout signal or board prompt. |
| Church Dashboards + CareNote | "Care team workload," hospital and home visit metrics, follow-up reminders. | Undefined; no wellbeing, rest or burnout flags or board alerts; new (2026). Closest commercial near-match, so verify with a demo. |
| Undershepherd / CareNote / Notebird | Care case tracking, shared load across elders, deacons and staff, completion and response metrics, reports to elders. | Measure care delivered to members, not the caregiver's load or wellbeing. |
| Holy Insights / Vitals | Burnout risk and alerts. | Volunteers only. |
| Chemistry Staffing Staff Health Assessment | Survey-based staff wellbeing across seven areas, compared against the pastor's predictions. | Periodic survey; no ongoing care-load or rest data; no alerts. |
| Flourishing in Ministry / WorkWell / Restor(y) / Church Encourager / Anago | Personal clergy wellbeing self-assessments and practices. | Self-report snapshots; no workload data; no board view. |
| Standing Stone / Resilient Pastor CoLab (Gloo assessment) | Relational shepherding; cohort program plus assessment. | Human services, not tracking software. |
| Viva Insights; PTO trackers (Day Off and others) | After-hours metrics; leave and sabbatical balances. | Not ministry-aware; no care categories or burnout model; separate from the ChMS. |

#### Auditable list of what was checked (Candidate B)
- **Planning Center:** Assignees changelog and help.
- **Pushpay:** burnout blog; Nurture (prior notes).
- **ChMS from prior notes:** ChurchTrac, Rock, MinistryPlatform, Realm.
- **Care tools:** Church Dashboards, Holy Insights, Vitals, CareNote, Undershepherd, Notebird.
- **Assessments:** Flourishing in Ministry, CRC WorkWell, Restor(y), Church Encourager, Anago, Chemistry Staffing.
- **Organizations:** Barna Resilient Pastor CoLab, Standing Stone, Gloo Soul Care.
- **General tools:** Viva Insights; Day Off, Time Off Cloud, Built, OrangeHRM, Gusto, APS, MinistryWorks.
- **Search:** queries for sabbath-tracking apps.
- **Not found by name:** "Pastor Care Network," "Soul Care" as an app, and "Thriving Pastor" apps. Lifeway pastor resources and the Focus on the Family pastoral care line were searched but did not surface.

### Inferences
- **The gap holds for the full feature set.** Nothing found ties each pastor's care caseload (by type), hours, days off and sabbath into a burnout-risk signal with an escalation path to elders.
- **The volunteer-burnout tools (Holy Insights, Vitals) suggest fast-follower risk.** Vendors already modeling volunteer burnout could extend it to staff. Church Dashboards + CareNote is the most likely to add a "care team workload" view per caregiver, if it hasn't already.
- **Data capture is the main design problem.** Pastors log care events inconsistently, and monitoring pastors' hours raises trust and consent issues. This is inferred, and is also flagged in one search summary. A design where the pastor owns the data and chooses what to share, with board-level aggregates only, would set the product apart from Viva Insights-style monitoring.
- **There is a natural pairing with care tools.** Care-case data already logged in Notebird, CareNote, Nurture or ChMS notes could feed per-caregiver load automatically, which lowers the logging burden.

### Gaps
- Church Dashboards' "Care team workload" was not defined on its site. It could be closer to Candidate B than it looks; a demo or vendor contact is needed.
- No pages were found for "Pastor Care Network," a "Soul Care" app or "Thriving Pastor" apps. Lifeway's pastor resources and Focus on the Family's pastoral care line were not verified.
- Rock RMS plugins (the Rock Shop) were not searched for staff care-load plugins.
- No willingness-to-pay data was found, nor data on whether boards or elders would buy a pastor-wellbeing tool (a likely buyer-versus-user split).

---

## Candidate B: What evidence of demand exists (pastor burnout data)?

### Takeaway
Pastor strain is lower than its 2022 peak but still significant:
- **Barna (Jan 2026):** 24% of senior pastors seriously considered leaving full-time ministry in the past year, down from about 42% in 2022. Barna calls this "stabilization, not full recovery."
- **Lifeway (2025):** 57% find the role "frequently overwhelming," 34% feel isolated, 67% feel on call 24 hours a day, and only 78% rest at least one day a week (down from 85% in 2015). Actual attrition is about 1.2% a year.
- **Barna/Gloo (2026, secondary sources):** 52% of pastors get no professional support.

### Cited Findings
- **Barna (Jan 27, 2026):**
  - 24% of U.S. senior Protestant pastors seriously considered leaving full-time ministry in the past year, down from "roughly two in five" in 2022.
  - The drop "does not indicate that pastors are suddenly thriving"; "The data points to stabilization, not full recovery."
  - Younger pastors are "particularly" vulnerable. Retention "is not simply about personal resilience."
  - — [Barna: Pastors Quitting Ministry](https://www.barna.com/trends/pastors-quitting-ministry-barna-data/)
- **Barna peak figure:** 42% in March 2022 (510 pastors surveyed). 56% of those who considered quitting cited "the immense stress of the job." — [Barna: 38% of U.S. Pastors Have Thought About Quitting](https://www.barna.com/research/pastors-well-being/); [Christian Post](https://www.christianpost.com/news/fewer-pastors-now-feel-like-quitting-study-finds.html) (search summary)
- **Sample for the 24% figure:** the Barna page gives none. Secondary sources say a Dec 2025 survey of 410+ Protestant senior pastors. — [Family Council, Mar 30, 2026](https://familycouncil.org/2026/03/30/fewer-pastors-considering-quitting-ministry-research-shows/) (search summary)
- **Conflicting report:** a Christian Today article attributes a 42% figure to Barna/Gloo data from June 2025, which conflicts with the other sources' 2022 dating. — [Christian Today](https://www.christiantoday.com/news/as-pastors-burn-out-a-new-book-offers-a-way-back-to-wholeness)
- **Barna/Gloo 2026 State of the Church (May 5, 2026; secondary, since the primary release returned 403):**
  - Pastors score 76 versus 71 for U.S. adults on flourishing.
  - 52% of pastors get no professional support.
  - Feelings of inadequacy fell from 64% (2023) to 44% (2026).
  - Emotional resilience rose while job satisfaction declined.
  - — [Business Wire, May 5, 2026](https://www.businesswire.com/news/home/20260505827606/en/Pastors-Emotional-Resilience-Rises-as-Job-Satisfaction-Declines-New-Research-Finds); [Christian Today](https://www.christiantoday.com/news/pastors-faring-worse-than-others-in-relationships-and-well-being-but-most-dont-get-help); [WORLD](https://wng.org/sift/most-u-s-pastors-dont-receive-needed-professional-support-study-finds-1749842021) (search summary)
- **Lifeway Research (2025, more than 1,500 evangelical and Black Protestant pastors):**
  - 1.2% leave ministry each year for reasons other than retirement or death (1.3% in 2015, 1.5% in 2021).
  - Predecessors left over church conflict (23%) and burnout (22%).
  - 67% feel on call 24 hours a day (84% in 2015).
  - 57% find the role "frequently overwhelming."
  - 34% feel isolated.
  - 78% rest at least one day a week (85% in 2015).
  - — [Christianity Today, Jun 3, 2025](https://www.christianitytoday.com/2025/06/pastor-leave-church-rate-ministry-burnout-survey)
- **Hartford Institute (fall 2023 survey):** about 53% of clergy had seriously considered leaving ministry since 2020. A separate figure of 44% had considered leaving their current congregation. These measure different things. — [Christian Post](https://christianpost.com/news/a-third-of-pastors-who-leave-ministry-cite-burnout-conflict.html); [Christianity Daily](https://www.christianitydaily.com/news/over-half-of-us-clergy-contemplate-leaving-ministry-study-finds.html); [WABE/AP](https://www.wabe.org/us-pastors-struggle-with-post-pandemic-burnout-survey-shows-half-considered-quitting-since-2020/) (search summary)
- **Older figures that circulate in vendor marketing:**
  - Pushpay's blog cites Lifeway (84% on call, 53% "frequently overwhelming," 48% say demands are "more than they can handle"), a Schaeffer Institute claim that most pastors work 50–70 hours a week, and a Duke claim.
  - These are older or less verifiable than the 2025 Lifeway data above.
  - — [Pushpay blog](https://pushpay.com/blog/how-churchstaq-can-help-with-pastoral-burnout/)
- **Hours versus satisfaction:** an ARDA analysis found life satisfaction barely varied with hours (69% for those working under 20 hours versus 71% at 50 or more). This argues against using hours alone as a burnout proxy. — [ARDA: Are Members of the Clergy Miserable?](https://thearda.com/categories/ahead-of-the-trend/are-members-of-the-clergy-miserable) (search summary)

### Inferences
- **The demand signal is real but has softened since 2022.** The pitch should rest on the persistent structural numbers (57% overwhelmed, 34% isolated, 67% always on call, 22% of departures from burnout, 52% with no professional support) rather than the 2022 crisis peak.
- **The falling rest rate makes "days off and sabbath" a measurable, defensible metric.** Lifeway shows 78% resting weekly, down from 85% in 2015.
- **Hours alone are a poor proxy (ARDA).** A burnout signal should weight the type and intensity of care (crisis and counseling), isolation, and missed rest, not just hours. This supports Candidate B's design of a care-type caseload plus rest.

### Gaps
- Barna's primary page gives no sample size or field dates for the 24% figure, and no age breakdowns.
- The Barna/Gloo May 2026 release could not be fetched (403), so its figures rely on secondary coverage.
- No data was found on how much care work (hospital visits, counseling, crisis calls) the average pastor carries per week, or on staff other than senior pastors (associate pastors, ministry directors).
- No survey was found on whether elders or boards want visibility into pastor workload, or on pastors' willingness to share it.
