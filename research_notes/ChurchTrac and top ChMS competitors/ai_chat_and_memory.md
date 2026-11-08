# AI Chat and Persistent Memory in Church Management Software and Church AI Products (as of Nov 8, 2026)

Research note scope: in-product AI chat and conversational assistants, whether any product keeps memory across sessions and learns a ministry leader's context, and voice conversation support (Q6). Field-level AI privacy controls and audit logs are covered by another researcher and appear here only where they bear on memory.

Labeling used below: **SHIPPED** = vendor documentation or changelog shows it live. **PILOT/BETA** = limited availability. **ANNOUNCED** = promised, not live. **3P** = claim found only on a third-party site (mostly the faith.tools directory) and not confirmed on a vendor page.

Source caveats:
- Several vendor pages (Pushpay press releases on GlobeNewswire, OpenAI help center, help.tithe.ly, religionnews.com) returned HTTP 403 to the fetch tool. Claims from those pages come from search-result excerpts, and they are marked as such.
- faith.tools is a third-party directory. Its pages were "checked Oct 22, 2026" and contain some internal inconsistencies.

---

## Q1. Which of the six core products (ChurchTrac, Planning Center, Tithely/Breeze, Pushpay ChurchStaq, Realm, Rock RMS) have AI chat today, what can it do, status, tier, and memory?

### Takeaway
**Exact count: 2 of 6 have a shipped, in-product conversational AI assistant as of Nov 8, 2026.**
- **Planning Center (Ask AI):** clearly generally available in every product since Oct 20, 2026.
- **Rock RMS (Chat agent):** documented in the v19 docs, but sources conflict on whether it is out of preview.

The other four:
- **Tithely/Breeze:** "TithelyAI" assistant is in limited pilot only.
- **Pushpay:** its only conversational data feature ("AI for Giving Data" with follow-ups) is listed by Pushpay as coming Spring 2027. A "Genny" assistant appears only in a third-party listing.
- **Realm and ChurchTrac:** no AI chat.

None of the six documents an assistant that learns from a user's conversations. Planning Center comes closest: Ask AI saves conversation history and takes a static role description the user types into settings.

### Summary table

| Product | In-product AI chat? | What it does | Status / date | Tier / price | Memory / personalization |
|---|---|---|---|---|---|
| Planning Center | **Yes: Ask AI** | Product how-to Q&A, plus account-data lookups within the user's permissions. Cannot make changes. | Help-center chatbot Jul 27, 2026. In every product sidebar Oct 20, 2026 (SHIPPED). | Not stated | Saved conversation history. User-entered role/work details in settings. No learned memory documented. |
| Planning Center | External chat via MCP (ChatGPT, Claude, etc.) | Reads 8 products. Only writes are People notes and form fill-out. | Blog Aug 20, 2026. Getting-started guide calls it a "PicoLabs experiment." | Not stated | Memory lives in the third-party AI tool |
| Rock RMS | **Yes: Chat agent (sparkles icon)** plus MCP agents and a mobile voice agent | Lookups and updates (e.g., log a note). Admin-configurable skills and tools. | v19 docs updated Aug 10, 2026. Agent core tools added in pre-alpha 20.0.7, Aug 19, 2026. "Preview" vs "shipped in v19.4" conflict. | Rock is free. AI runs through Spark Connected Services with spending limits (usage-based). | Context anchors (current person or group) only. No cross-session memory documented. |
| Pushpay ChurchStaq | **Not confirmed** | AI Profile Summaries (one-shot), AI People Search (one-shot). AI for Giving Data with follow-ups is ANNOUNCED for Spring 2027. "Genny" support assistant is 3P only. | Profile Summaries ~Sep 15–23, 2026 | Not stated | None documented |
| Tithely / Breeze | **No (pilot only)** | TithelyAI = natural-language questions over church data | Announced Aug 2025 for a "2026" launch. "Limited pilot" per 3P, Oct 2026. | Not stated | None documented |
| Realm (ACST) | No | None found | — | — | — |
| ChurchTrac | No | AI PDF bank-statement parsing only (one-shot) | SHIPPED (date not found) | Not stated | Uploads deleted after processing |

### Cited Findings

**Planning Center**
- Jul 27, 2026 changelog:
  - Introduced Ask AI as "Planning Center's brand new AI-powered chat bot that is focused on answering all of your Planning Center questions." It opens from the ❓ icon in the help center. — [PC changelog, Jul 27, 2026](https://www.planningcenter.com/changelog/global/new-ask-ai-for-instant-answers)
  - Memory-adjacent features in the same entry: "every conversation is saved so you can pick up where you left off or revisit an answer later." Saved conversations are reached from the `...` menu. Users can "add details about your role and the type of work you do in settings" so answers fit how they use Planning Center. — [PC changelog, Jul 27, 2026](https://www.planningcenter.com/changelog/global/new-ask-ai-for-instant-answers)
- Oct 20, 2026 changelog: Ask AI "has been available for a few months through the help desk… Now it's available in every Planning Center product!" Further details from the same entry:
  - It draws on "every help article, pricing information, API documentation."
  - It "can also look things up in your Planning Center account," for example whether volunteers are confirmed. "Using your permissions, it sees Planning Center the same way you do."
  - It can hand the conversation to support.
  - "We don't train AI on your data." AI vendors are "contractually prohibited from training on it too."
  - "Using AI is optional."
  - The entry uses no beta label. — [PC changelog, Oct 20, 2026](https://www.planningcenter.com/changelog/global/new-ask-ai)
- The Planning Center AI page says the following about Ask AI:
  - It is a sidebar assistant that answers how-to and account questions and can look up account information, but it **cannot make changes**.
  - "Ask AI only sees what you already have permission to see."
  - It **cannot be turned off**. Asked in the FAQ whether it can be turned off, the page answers: "Not right now. Ask AI is built into the sidebar of every Planning Center product."
  - The page states no tier or price. — [Planning Center AI page](https://www.planningcenter.com/ai)
- A search excerpt referenced a Nov 4, 2026 Planning Center blog post titled "Introducing Ask AI," with the example question "who has not confirmed for a Sunday band." I could not retrieve the post to verify it. — (search excerpt only; see Gaps)
- AI list builder (People): describes a group of people in plain English and turns it into list conditions. It can reference custom fields, group types and team names, and results "should get you close, but not all the way or all the time." It started as a waitlist beta in Oct 2025. — [PC People changelog](https://www.planningcenter.com/changelog/people/new-build-lists-faster-easier-with-ai-using-plain-english); [PC blog, Oct 2025 waitlist](https://www.planningcenter.com/blog/2025/10/a-faster-easier-way-to-build-lists-with-ai-join-the-waitlist)
- On memory for the list builder, the AI page says "The AI model that builds your list doesn't retain any of the information for future use. We don't save any of the list data after we set it up." This is an explicit **no-memory** design statement. — [Planning Center AI page](https://www.planningcenter.com/ai)
- Planning Center MCP, announced Aug 20, 2026:
  - Lets ChatGPT, Claude or other AI tools read Services, Giving, People, Registrations, Calendar, Groups, Publishing and Check-Ins. "The only edit or 'write' abilities are in People: the AI tool can make notes and fill out forms on your behalf."
  - Admins are notified on first connect, choose who can connect, and can revoke access.
  - The post warns: "By default, both OpenAI (ChatGPT) and Anthropic (Claude) can use your conversations to train their models." It recommends turning that off and requiring admins to do the same.
  - It does not address ChatGPT or Claude memory. — [PC blog, Aug 20, 2026](https://www.planningcenter.com/blog/2026/08/announcing-the-planning-center-mcp-connect-chatgpt-claude-and-other-ai-tools)
- The MCP getting-started guide describes the server (mcp.planningcenteronline.com/mcp) as a "PicoLabs experiment" with separate support via a Circle community. — [PC MCP Getting Started Guide (search excerpt)](https://planningcenter.notion.site/Planning-Center-MCP-Getting-Started-Guide-2b5abbce69a280bcae9efefc7fb2e747)
- Planning Center also has a changelog item "Planning Center is now in the ChatGPT store." Only the title was seen. — [PC PicoLabs changelog](https://www.planningcenter.com/changelog/picolabs/new-planning-center-is-now-in-the-chatgpt-store)
- On the MCP connection the AI page says: "You, not Planning Center, are completely in control of what data you give to AI companies." — [Planning Center AI page](https://www.planningcenter.com/ai)

**Rock RMS (Spark Development Network)**
- Agents are configurable per audience, e.g., a staff agent, a volunteer agent and a public website agent:
  - "Chat agents keep the conversation inside Rock and can use Context Anchors to pin the current person or group."
  - MCP agents expose tools to external clients and "do not support context anchors."
  - New agents default to Rock Administrator security because agents have write access.
  - "Treat a Public agent as one you trust anyone to use."
  - The page does not mention conversation memory. — [Rock AI Agents docs](https://community.rockrms.com/developer/ai-agents/agents)
- User guide (v19.0 docs, "Updated August 10, 2026"):
  - The chat opens from the sparkles "Agent icon in Rock's header, accessible from anywhere."
  - It does lookups ("What groups is Ted Decker in?") and updates ("Log a note on Peter Foster…").
  - "The agent can only see what you can see."
  - It refers only to follow-ups "in the same conversation."
  - It shows no preview label and says nothing on saved history or cross-session memory. — [Rock "Using an Agent"](https://www.rockrms.com/documentation/core-concepts/rock-fundamentals/ai/using-an-agent)
- Context anchors are a label above the chat box, e.g., "Person: Ted Decker." They apply only to Chat agents. — [Rock Context Anchors](https://community.rockrms.com/developer/ai-agents/agents/context-anchors)
- MCP agents connect external tools such as Claude Desktop, and the chat history then lives in the external tool, not in Rock. — [Rock "Set Up an MCP Agent" (search excerpt)](https://community.rockrms.com/documentation/core-concepts/rock-fundamentals/ai/set-up-an-mcp-agent)
- Pre-alpha release notes:
  - 20.0.7 (Aug 19, 2026): "Added the core skills and tools that let you create chat and MCP agents in Rock." The same release added "Spark Connected Services, which enables AI features in Rock with configurable spending limits and usage tracking."
  - 21.0.1 (Sep 10, 2026): the experimental AI Provider was replaced with the "Rock Intelligence service," and Core Administration, Workflow Builder, Community Knowledge Base and CMS skills were added.
  - 21.0.2 (Oct 14, 2026): an "Experimental" Workflow Composer agent for chat and MCP.
  - No memory items appear in the portion read. — [Rock Pre-Alpha Release Notes](https://www.rockrms.com/prealpharelease)
- **Status conflict:**
  - One faith.tools listing says AI Agents are "currently in preview." — [faith.tools Rock (search excerpt)](https://faith.tools/app/159-rock-rms)
  - Another says they "shipped in Rock v19.4," with "a voice agent and custom skills churches can build," and an MCP connection to Claude and ChatGPT under each person's own login. — [faith.tools Rock RMS](https://faith.tools/app/rock-rms)
  - A search excerpt says Rock Mobile v19.4 was released Aug 28, 2026 and that v19.1 mobile added the AI Voice Agent block. — [Rock Mobile Release Notes (search excerpt)](https://www.rockrms.com/mobilereleasenotes); [Rock Voice Agent docs](https://community.rockrms.com/developer/mobile-docs/essentials/features/voice-agent)
  - The public Release Notes page requires login, so I could not resolve the conflict. — [Rock Release Notes](https://www.rockrms.com/ReleaseNotes)

**Pushpay ChurchStaq**
- Pushpay's Staq Transformation hub lists two AI features:
  - **AI Profile Summaries** ("Quickly understand a person or family's engagement across your church without manually reviewing notes"), expected Sep 15, 2026.
  - **AI for Giving Data**, "Coming Spring 2027": "Ask your giving data a question in plain language, then keep asking follow-ups and see the source behind each answer." This is the only conversational feature Pushpay itself describes, and it is ANNOUNCED.
  - The hub does not mention Genny, AI search or a general assistant. — [Pushpay Staq Transformation hub](https://hub.pushpay.com/staq-transformation/)
- Pushpay Connect (Sep 23, 2026) announced AI Profile Summaries as a "one-tap pastoral briefing aggregating giving history, attendance, group involvement, serving status, and staff notes." — [GlobeNewswire, Sep 23, 2026 (search excerpt; page returned 403)](https://www.globenewswire.com/news-release/2026/09/23/3367490/0/en/pushpay-unveils-next-wave-of-churchstaq-and-parishstaq-transformation.html)
- faith.tools (3P) makes several claims:
  - Pushpay launched "AI for Giving Data, AI for People Search, and Genny, a 24/7 church software assistant" in December 2025.
  - AI Profile Summaries run within existing ChMS permissions and do not train on church data.
  - None of the features is described as having memory.
  - **Conflict:** the Dec 2025 "AI for Giving Data" launch claim contradicts Pushpay's own hub, which lists it for Spring 2027. — [faith.tools Pushpay](https://faith.tools/app/pushpay)
- Nurture.io acquisition (Apr 22, 2026): pastoral-care and engagement-signal platform that pulls from 17+ integrations. It is not described as a chat assistant. — [GlobeNewswire, Apr 22, 2026 (search excerpt)](https://www.globenewswire.com/news-release/2026/04/22/3279027/0/en/pushpay-announces-acquisition-of-nurture-io-adding-pastoral-care-and-engagement-intelligence-for-churches.html); [Nurture blog](https://www.nurture.io/blog-posts/nurture-is-joining-pushpay)
- The hub's "Next Evolution of Giving" (Spring 2027) says returning donors get an experience that "remembers details." This is donor-facing and not labeled as AI. — [Pushpay Staq Transformation hub](https://hub.pushpay.com/staq-transformation/)

**Tithely / Breeze (Tithely Church Management)**
- TithelyAI was announced at Tithely Next in Aug 2025 as "an AI-powered assistant integrated into the Tithely dashboard, allowing pastors to ask natural-language questions of their church data," with role-based access. Tithely was gathering feedback "as they build TithelyAI to launch in 2026." — [Religion News Service press release, Aug 26, 2025 (search excerpt)](https://religionnews.com/2025/08/26/from-giving-apps-to-tap-giving-and-ai-insights-tithely-unveils-innovations-to-help-churches-simply-serve/)
- Status as of Oct 22, 2026 (all 3P):
  - The Breeze listing says it was "announced in August 2025 with a launch planned for 2026," with no launch confirmed. — [faith.tools Breeze](https://faith.tools/app/breeze-chms)
  - The Tithely listing says "TithelyAI giving insights previewed for 2026 launch." — [faith.tools Tithely](https://faith.tools/app/tithely)
  - A search excerpt from a faith.tools listing says the assistant "remains in limited pilot… no public launch timeline announced." — (faith.tools search excerpt)
  - **No official Tithely launch announcement was found.**
- **Correction to the brief's lead:** the "AI email writing assistant, AI-Powered Advanced Search (Beta), and read-only MCP integration for ChatGPT/Claude/Gemini" are attributed by faith.tools to **ChMeetings**, not Tithely. They appear in the "Apps like Tithely" section of the Tithely page. — [faith.tools Tithely (web)](https://faith.tools/app/tithely?category=web); [faith.tools ChMeetings](https://faith.tools/app/chmeetings)
- Tithely's own help center describes "AI in Messaging": AI generates text or images in **Drag & Drop Emails** only, for Headings, Images and Buttons. This is a one-shot generator, not chat. — [Tithely Help Center (search excerpt; page returned 403)](https://help.tithe.ly/hc/en-us/articles/11496318912023-AI-In-Messaging)
- No Tithely MCP connector was found in any search.

**Realm (ACS Technologies)**
- No AI chat or AI feature for Realm was found in searches of Realm/ACST AI. — [search results summary; e.g., parse.gl ACST profile](https://www.parse.gl/brands/acstechnologies-com)
- ACST's MP-MCP press release mentions Realm only in its "About ACST" boilerplate ("Through trusted platforms including Realm and MinistryPlatform") and does not extend MP-MCP to Realm. — [ACST MP-MCP release, Jul 14, 2026](https://www.acstechnologies.com/company/news/acst-launches-mp-mcp-giving-churches-a-secure-way-to-use-ai-with-their-ministryplatform-data/)

**ChurchTrac**
- The only AI feature found is in Accounting. "ChurchTrac uses AI to read PDF statements and pull out their transactions. Your uploads are deleted once they are processed, and your statement data is never used to train AI models or shared with AI model providers." Uploads are matched to accounts by the last four digits of the account number. — [ChurchTrac Support: Importing Transactions (search excerpt)](https://www.churchtrac.com/support/accounting/importing-transactions)
- A 2026 comparison states ChurchTrac has no AI features. It appears to predate or overlook the statement parser. ChurchTrac's 2026 feature posts (PraiseCharts, accounting search, messaging) show no AI chat. — [Raklet 2026 comparison (search excerpt)](https://www.raklet.com/blog/best-church-management-software/); [ChurchTrac blog features](https://www.churchtrac.com/blog/features/page/1)

### Inferences
- Planning Center is the clear category leader: chat that is GA in every product, account-data lookups, saved threads, and a user-supplied role profile. Its personalization is **user-declared and static** ("custom instructions" style), not learned memory. Its list builder is explicitly designed to retain nothing.
- Rock's chat agent is the most capable in terms of actions, since it can write records, but has no documented memory. Pinning a person or group (context anchors) is session context, not memory.
- Two of the six ship in-product chat today (Planning Center, Rock). Counting external chat via MCP connectors changes the picture only slightly: Planning Center and Rock again. Pushpay, Tithely, Realm and ChurchTrac have no first-party MCP connector found.
- The "Pushpay AI people search" and "Profile Summaries" are one-shot features. Pushpay's own roadmap places multi-turn chat over giving data in Spring 2027.
- The brief's Tithely lead (email assistant, AI search beta, connector) appears to be a misattribution of ChMeetings features found on the faith.tools Tithely page.

### Gaps
- Pricing or tier for Planning Center Ask AI is not stated anywhere I found. No add-on was mentioned, which suggests it is included, but this is unconfirmed.
- I could not retrieve the Nov 4, 2026 "Introducing Ask AI" Planning Center blog post, or whether Ask AI's saved conversations or role settings are used across sessions beyond simple resume.
- Rock: whether chat-agent conversations persist across sessions, and the official GA vs. preview status in the v19.x stable line. The public release notes require login, and the pre-alpha notes are numbered 20.x/21.x, which suggests ongoing development.
- Pushpay: no official Pushpay page for "Genny" or "AI for People Search" was found. Both are 3P only.
- Tithely: no official 2026 statement on TithelyAI status. The "limited pilot" claim is 3P.
- ChurchTrac: launch date of the AI statement parser not found.

---

## Q2. Broader market: MinistryPlatform, Subsplash, Gloo, ChMeetings, ChurchSuite, Faithlife/Logos, and church AI startups. Do any offer a ministry-leader assistant with persistent memory, a "second brain," or personalization?

### Takeaway
Most of this wider group connects external AI clients via MCP (MinistryPlatform, ChMeetings), ships one-shot analytics or list builders (Subsplash), or offers sermon or website chatbots (Pastors.ai, Pulpit AI, Faith Assistant).
- **Gloo Ministry Chat** is a leader-facing chat assistant, but it is in beta, and its product pages describe no memory.
- **Logos Study Assistant** is conversational research grounded in the user's library, with no memory documented.
- Only two church-specific products explicitly market learned or persistent memory for ministry leaders, and neither documents user controls for viewing or deleting memory:
  - **Church Assistant by Verble**: "learns over time — preferences, member details, your writing style, past conversations."
  - **AlignedAI**: "working memory of your ministry context," "sermon memory across weeks and months."

### Cited Findings

**MinistryPlatform (ACS Technologies)**
- MinistryPlatform AI was announced May 7, 2026. It is "built on the open Model Context Protocol (MCP) standard" and works with "AI tools that support MCP."
  - Staff ask plain-English questions across "the full Ministry Platform schema," including pastoral care. No drafting or actions are described.
  - It launched with a limited Pioneer Program for the first 50 churches, and setup takes under 30 minutes.
  - On data: "congregation data queried through MinistryPlatform AI is retrieved live, securely returned, and not stored or used to train AI models."
  - No memory statement and no pricing. — [ACST MinistryPlatform AI release, May 7, 2026](https://www.acstechnologies.com/company/news/acst-launches-ministry-platform-ai-bringing-secure-ministry-aware-ai-to-churches/)
- MP-MCP was announced Jul 14, 2026. It is "a connector/gateway (not a chatbot…)."
  - The Pioneer Program grew "from four alpha churches to 64 participating churches in just 90 days," and the product was to be "generally available in August" 2026.
  - Its "guest, not admin" model includes these protections: queries run under the user's own permissions; tools can be toggled by security role; sensitive tables are off by default; "Personally identifiable information can be masked before it reaches an AI model"; "Write access is disabled by default"; all activity is logged.
  - No memory statement and no pricing. — [ACST MP-MCP release, Jul 14, 2026](https://www.acstechnologies.com/company/news/acst-launches-mp-mcp-giving-churches-a-secure-way-to-use-ai-with-their-ministryplatform-data/)
- The MP MCP server site describes a multi-tenant MCP server for Claude Desktop and Claude.ai and calls MinistryPlatform AI generally available. — [ai.ministryplatform.com (search excerpt)](https://ai.ministryplatform.com/)

**Subsplash**
- Trends AI (late March 2026, per a 3P tracker) combines giving, attendance, events and groups data into a chart builder with 25+ visualizations and "AI analysis trained for ministry." The tracker says it is a **paid add-on**. People Assistant (May 2026) provides natural-language list filtering. — [Sparkpulse third-party tracker](https://sparkpulse-ui-next.pages.dev/product/subsplash)
- Subsplash's own blog (Sep 21, 2026) lists these AI features: Workflows AI generator; Pulpit AI ("over twenty pieces of sermon content," lets pastors "chat with their sermon"); and Trends AI. It describes Trends AI as keeping "church financial and member records secure inside your primary platform." It says nothing about memory or pricing. — [Subsplash blog, Sep 21, 2026](https://www.subsplash.com/blog/ai-tools-for-pastors)

**Gloo**
- Gloo Workspace has four parts: "Introducing Gloo Ministry Chat (Beta)," "an AI assistant designed to support the real day-to-day work of pastors and church leaders"; Content Studio; Communications; and Insights. Ministry tool integrations (Google Workspace, Asana, Slack, Canva, Planning Center) are marked "Coming soon." The page says nothing about memory or remembering context. A free tier and a paid Gloo+ exist, without public prices. — [Gloo Workspace](https://gloo.com/workspace)
- The Ministry Chat page lists 100+ tools (Sermon Assistant, Pastoral Care drafting, Workflow Automation with Planning Center and Google Workspace, and Creative Studio). It calls itself "a workspace where AI assistants help you do real ministry work." It makes no memory or personalization claims and has no date. — [Gloo Ministry Chat](https://gloo.com/workspace/ministry-chat)
- Gloo's developer platform:
  - "Chat Playground conversations are not saved… For saved conversations, implement the API in your application with your own storage." The Playground adjusts by "religious denomination" with a consent prompt. — [Gloo AI Chat product guide](https://docs.gloo.com/product-guides/chat)
  - Gloo's Chat (Threads) API preserves full message history per thread. This is per-thread context for developers, not user-level memory. Gloo now recommends the Responses API for new projects. — [Gloo Chat Threads docs (search excerpt)](https://docs.ai.gloo.com/docs/chat-api-threads); [Gloo API chat guide (search excerpt)](https://docs.gloo.com/api-guides/chat)
- Gloo partnered with Faith Assistant (Jan 2025) on chatbots trained on a ministry's own content (congregant-facing). A free church tier was included, and advanced features require Gloo+. — [Gloo press release, Jan 2025 (search excerpt)](https://gloo.com/press/releases/gloo-and-faith-assistant-partner-to-build-custom-ai-for-churches-and-ministries)

**ChMeetings**
- ChMeetings has three AI features, per faith.tools (3P):
  - an AI Email Writing Assistant that "generates, re-tones, or translates email text," cited to a June 2026 blog post;
  - an AI-Powered Advanced Search (Beta) that turns plain-language requests into people filters, release 2026.16, Aug 6, 2026;
  - a strictly **read-only MCP integration** for ChatGPT, Claude or Gemini, release 2026.15, Jul 22, 2026.
  - The listing mentions no assistant or memory. — [faith.tools ChMeetings](https://faith.tools/app/chmeetings)
- Third-party MCP servers (Composio, One, Toolhouse) also connect ChMeetings to Claude and ChatGPT with read and write tools. — [Composio ChMeetings toolkit](https://composio.dev/toolkits/chmeetings)

**ChurchSuite**
- Searches found no built-in AI feature. Results showed only general listings and reviews, and one blog where ChurchSuite is used alongside ChatGPT and Claude. — [search results, e.g., ChurchSuite site](https://www.churchsuite.com)

**Faithlife / Logos**
- Faithlife says most of its AI tools draw "exclusively from the user's Logos library rather than the open internet." — [Wikipedia: Logos Bible Software](https://en.wikipedia.org/wiki/Logos_Bible_Software)
- A competitor's ranking (updated Oct 26, 2026) describes Logos as having a "Study Assistant with cited sources" and a "Sermon Assistant," with no memory stated. — [Aligned ranking](https://aligned.church/compare/best-ai-for-pastors)

**Church AI startups and website chatbots**
- **Church Assistant (Verble):**
  - The page says it is "Built by Verble… the team behind the sermon studio already trusted by 1,000+ pastors." It does bulletins, follow-up emails and texts (approved before sending), volunteer scheduling, and a morning briefing. Email goes out through the user's Gmail.
  - **Memory claims:** the assistant, a "Soul," "learns over time — preferences, member details, your writing style, past conversations"; it "knows your church, learns your style, and remembers everything"; it is "Like a secretary who's worked with you for years, on day one."
  - The page does **not** explain storage or view/edit/delete controls, mentions no ChMS integration, and says nothing on training. It offers a free trial and carries a © 2026 footer, with no launch date. — [churchassistant.app](https://churchassistant.app/)
- **AlignedAI (aligned.church)**, page published Jun 4, 2026 and updated Oct 26, 2026:
  - It "maintains a working memory of your ministry context." It "stores your doctrinal framework, preaching style, and ministry calendar persistently," and it "maintains sermon memory across weeks and months."
  - For meetings: "Every decision and action item gets saved so you can ask about it later in a simple chat."
  - It contrasts this with generic chatbots, where "Every conversation starts from scratch."
  - The page does not say how memory is stored or whether users can view or delete it.
  - Pricing: Aligned Leader is free, or $9/mo for Unlimited. — [Aligned: AI Ministry Assistant guide](https://aligned.church/blog/ai-ministry-assistant)
  - Its voice training "learns from your past sermons (YouTube, podcast, files)." On data: "We don't use your content to train general-purpose AI, and it's walled off to your church." — [Aligned ranking](https://aligned.church/compare/best-ai-for-pastors)
- **Pastors.ai:** turns sermons into clips and content, and offers a website chatbot trained on the church site and sermon library, with timestamp citations, embedded on the church site. It is free or tiered (pricing sources conflict). No conversation memory is stated. — [pastors.ai](https://pastors.ai/); [Aligned ranking](https://aligned.church/compare/best-ai-for-pastors)
- A review of Pastors.ai warns that "a generated answer may be mistaken for current church counsel, doctrine, or crisis support." — [Learn of Christ review](https://learnofchrist.com/resources/pastors-ai)
- **Pulpit AI:** its built-in chatbot "PulpitGPT provides answers to questions regarding your sermon." It produces sermon repurposing content. Subsplash lists it among its own AI features. No memory is stated. — [AI for Churches explainer](https://ai-for-churches.com/ai-tool-explainer-pulpit-ai/); [Subsplash blog](https://www.subsplash.com/blog/ai-tools-for-pastors)
- **"ChurchAI":** no product by that name was found.
- **"Second brain":** no pastor-specific "second brain" product was found. Church Tech Today publishes a DIY guide that pairs Notion with Claude as an "AI second brain" for church leaders. — [Church Tech Today](https://churchtechtoday.com/ai-second-brain-a-beginners-guide-for-church-leaders/)

### Inferences
- The ChMS-adjacent platforms (MinistryPlatform, ChMeetings, Planning Center, Rock) are converging on **MCP connectors**. These push the chat surface, and therefore memory, out to ChatGPT or Claude, where the ChMS vendor controls neither retention nor memory. MinistryPlatform's "not stored" claim covers only its own gateway.
- Persistent memory claims exist only among **small sermon and admin AI startups** (Verble's Church Assistant, AlignedAI), not ChMS vendors. Both are marketing claims without documented controls. Church Assistant explicitly remembers "member details," which is the most privacy-sensitive memory category.
- Gloo, the most leader-focused large platform, has a beta chat with no memory story, and its developer docs push conversation storage onto app builders.

### Gaps
- Gloo Ministry Chat launch date, pricing and data-retention policy were not found. Its FAQ answer on data safety did not render.
- No official ChMeetings source was retrieved; the details are 3P (faith.tools).
- Subsplash Trends AI pricing and date come from a 3P tracker only.
- A Logos community post said Faithlife Assistant would stop answering on May 31 and be removed in v26, replaced by Study Assistant. I could not pin down the exact source URL or year, so it is not cited above.
- Church Assistant (Verble) and AlignedAI privacy policies and memory controls were not reviewed. Their privacy pages were linked but not fetched.
- AskMyChurch (a congregant chatbot that reportedly routes sensitive conversations to pastoral care) appeared only in a search summary and was not verified.

---

## Q3. Is persistent memory that learns from a user's conversations offered anywhere in the church software market?

### Takeaway
**In church management software: no.** None of the 12 ChMS and church platforms checked documents an assistant that stores and learns from a user's past conversations: ChurchTrac, Planning Center, Tithely/Breeze, Pushpay, Realm, Rock, MinistryPlatform, Subsplash, ChMeetings, ChurchSuite, Gloo Workspace and Faithlife/Logos. The nearest features are:
- Planning Center Ask AI's saved conversation history plus a user-typed role description;
- Rock's in-session context anchors;
- memory supplied by third-party AI clients via MCP.

**In the broader church AI market: yes, but only as marketing claims from two small startups.** These are Church Assistant by Verble and AlignedAI. Neither publicly documents how memory is stored or how users view, edit, delete or turn it off.

### Cited Findings
- Planning Center Ask AI: "every conversation is saved so you can pick up where you left off," and users can "add details about your role and the type of work you do in settings." This is history plus a static profile, not learned memory. — [PC changelog, Jul 27, 2026](https://www.planningcenter.com/changelog/global/new-ask-ai-for-instant-answers)
- Planning Center list builder: "doesn't retain any of the information for future use." — [Planning Center AI page](https://www.planningcenter.com/ai)
- Rock: the docs mention only Context Anchors, with no conversation memory. — [Rock AI Agents docs](https://community.rockrms.com/developer/ai-agents/agents); [Rock "Using an Agent"](https://www.rockrms.com/documentation/core-concepts/rock-fundamentals/ai/using-an-agent)
- MinistryPlatform AI: data "retrieved live, securely returned, and not stored." — [ACST, May 7, 2026](https://www.acstechnologies.com/company/news/acst-launches-ministry-platform-ai-bringing-secure-ministry-aware-ai-to-churches/)
- Gloo developer chat: "Chat Playground conversations are not saved… implement the API in your application with your own storage." — [Gloo docs](https://docs.gloo.com/product-guides/chat)
- Pushpay: no memory described for any AI feature. — [faith.tools Pushpay](https://faith.tools/app/pushpay); [Pushpay hub](https://hub.pushpay.com/staq-transformation/)
- Church Assistant (Verble): "learns over time — preferences, member details, your writing style, past conversations"; it "remembers everything." No controls are documented. — [churchassistant.app](https://churchassistant.app/)
- AlignedAI: "maintains a working memory of your ministry context"; it "stores your doctrinal framework, preaching style, and ministry calendar persistently." No controls are documented. — [Aligned](https://aligned.church/blog/ai-ministry-assistant)
- Search terms used included:
  - "Planning Center Ask AI";
  - "Rock RMS v19 AI Agent chat" and "Rock RMS AI chat conversation history context anchors";
  - "TithelyAI assistant launch," "Tithely AI email assistant MCP," "Tithely MCP read-only";
  - "Pushpay ChurchStaq AI assistant 2026," "Pushpay Nurture.io Genny";
  - "ChurchTrac AI feature 2026," "ChurchTrac AI bank statement PDF";
  - "Realm ACS Technologies AI";
  - "MinistryPlatform MCP AI assistant";
  - "Gloo AI assistant pastors leaders memory," "Gloo Chat Threads API memory";
  - "Subsplash Trends AI chat";
  - "Logos AI assistant memory Faithlife 2026";
  - "ChMeetings AI assistant," "chmeetings.com AI features";
  - "ChurchSuite AI feature";
  - "AI assistant for pastors remembers conversations memory church";
  - "'second brain' pastor AI ministry app";
  - "Pastors.ai ChurchAI Pulpit AI church website chatbot."
  - Vendor pages fetched: Planning Center changelogs, the PC AI page and PC MCP blog; Rock agent docs and pre-alpha notes; the Pushpay hub; ACST releases; Gloo Workspace, Ministry Chat and developer docs; churchassistant.app; Aligned pages; and faith.tools listings for Tithely, Breeze, Pushpay, Rock and ChMeetings. — (methodology; see sources cited throughout)

### Inferences
- A ChMS-integrated ministry-leader assistant with **learned, user-controllable, cross-session memory** appears to be open ground as of Nov 2026. Incumbents have either designed for statelessness (Planning Center list builder, MinistryPlatform) or not addressed memory.
- The startups making memory claims (Verble, Aligned) do not connect to ChMS data, per their pages, and do not publish memory controls. A product that combines ChMS data, transparent memory and mainstream-grade controls would be distinctive.
- Because ChMS MCP connectors route church data into ChatGPT or Claude, those clients' memory features may already be retaining church-member details today, outside any church vendor's controls. Planning Center's MCP post addresses training defaults but not memory.

### Gaps
- Smaller or regional ChMS products (e.g., Church Community Builder/Pushpay legacy, Elvanto, Breeze-only features, B1 Church, Servant Keeper, ParishSOFT) were not exhaustively checked. faith.tools mentions B1 Church MCP integration in passing.
- Internal or undocumented behavior was not examined. For example, a vendor might store chat logs server-side without calling it "memory."

---

## Q4. How do mainstream AI assistants implement user memory (controls, storage, training)?

### Takeaway
All four mainstream assistants separate **explicit saved memories/instructions** from **memory inferred from chat history**. They store memory as discrete, editable records outside the model, not as model training. They also offer:
- a no-memory "temporary/incognito" chat mode;
- per-item delete and a global off switch.

A recurring gotcha is that **deleting a chat does not delete memories derived from it**. Enterprise versions add admin kill switches. Microsoft's enterprise implementation also documents notable compliance gaps: no audit logs, retention policies don't apply, and admins can't restrict what gets stored.

### Cited Findings

**ChatGPT (OpenAI)**
- **Two layers:** "Saved memories" (explicit) and "Chat history" (referencing past conversations). Per the help article excerpt, Chat history is limited to paid plans, and the free tier gets Saved Memories only. — [OpenAI Memory FAQ (search excerpt; page returned 403)](https://help.openai.com/en/articles/8590148-memory-faq)
- **Controls:**
  - Settings > Personalization > Memory, where individual memories can be reviewed and deleted, or the user can tell ChatGPT to forget.
  - Turning off "Reference saved memories" also turns off chat-history referencing. Turning off chat history alone leaves saved memories.
  - Deleting a chat does not delete memories already saved from it.
  - OpenAI may retain logs of deleted saved memories for up to 30 days for safety and debugging.
  - Temporary Chat "does not use or update saved memories or chat history." — [OpenAI Memory FAQ (search excerpt)](https://help.openai.com/en/articles/8590148-memory-faq); [OpenAI: How does reference saved memories work](https://help.openai.com/en/articles/11146739-how-does-reference-saved-memories-work)
- ChatGPT Projects keep "related chats, files and instructions together." — [Aligned ranking](https://aligned.church/compare/best-ai-for-pastors)

**Claude (Anthropic)**
- **Memory model:**
  - The current experience saves "a set of individual topics as you chat."
  - Legacy memory was a summary synthesis "updated every 24 hours." It survives only in some Team and Enterprise orgs.
  - Chat search (retrieving past chats) is separate and limited to paid plans.
  - Memory is on by default for Free, Pro, Max and Ultra. — [Claude Help Center: memory](https://support.claude.com/en/articles/11817273)
- **Scoping:** each project has its own memory. Claude uses project memory plus non-project memory, but not other projects' memory. "Use account memory" can be turned off per project to isolate it fully. — [Claude Help Center](https://support.claude.com/en/articles/11817273)
- **User controls:**
  - Settings > Your Claude > Manage, where topics can be read, edited or deleted.
  - In chat, the user can tell Claude to remember, change or forget something.
  - "Pause memory" stops use and additions but keeps entries. "Reset memory" "Permanently deletes all memories including project memories."
  - Memory can be turned off for a single chat.
  - Incognito chats are "not saved to Claude's memory or your chat history." — [Claude Help Center](https://support.claude.com/en/articles/11817273)
- **Admin controls (Team/Enterprise):**
  - Owners can toggle memory org-wide, and turning it off deletes all members' memory.
  - "Owners can't view or edit a user's individual memories."
  - Memory is included in data exports, and changes to org memory settings are logged.
  - Orgs created on or after Oct 31, 2026 start with memory on. HIPAA, government and Claude for Teachers orgs do not.
  - "Enabling memory doesn't enable sensitive topics"; each user must opt in. — [Claude Help Center](https://support.claude.com/en/articles/11817273)
- A third-party page says Claude's "memory leaves out religious beliefs unless you turn that on." This is relevant to church use. — [Aligned ranking](https://aligned.church/compare/best-ai-for-pastors)
- The help page does not state training use of memory. — [Claude Help Center](https://support.claude.com/en/articles/11817273)

**Microsoft 365 Copilot**
- **Status:** "Copilot personalization and memory are in preview." The doc was updated Nov 3, 2026. — [Microsoft Learn: Manage Copilot personalization and memory](https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-personalization-memory)
- **Storage:** "Memories, which include saved memories, details inferred from chat history and custom instructions, are stored in the user's Exchange mailbox in a hidden folder." They inherit mailbox security and compliance (Customer Lockbox, encryption at rest). — [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-personalization-memory)
- **Admin and retention:**
  - The "Enhanced personalization" admin control is on by default.
  - Purview retention policies "don't apply to Copilot memory."
  - Saved memories are kept until the user deletes them, and "Deleting a chat doesn't delete saved memories."
  - Chat-history details are purged within 7 days after all source chats are deleted, or after 30 days if the control is off.
  - Memories are discoverable and deletable via eDiscovery and Graph.
  - "Memory and personalization actions don't generate audit log entries in Purview."
  - "No, admins can't restrict what type of information is added to Copilot memory."
  - Temporary chats are still discoverable by admins. — [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-personalization-memory)
- **User controls:**
  - Ask "What do you know about me?"
  - Use "Manage saved memories" in Personalization settings.
  - Ask Copilot to forget a specific item.
  - Temporary chat neither uses nor updates memory. — [Microsoft Support: Manage Copilot Memory (search excerpt)](https://support.microsoft.com/en-US/Microsoft-365-Copilot/manage-copilot-memory-in-microsoft-365-copilot)

**Google Gemini**
- **Personal context (Aug 13, 2025):** "Gemini remembers key details and preferences you've shared." It is "on by default" and turned off in Settings > Personal context > "Your past chats with Gemini." At launch it was limited to consumer accounts aged 18+. — [Google blog, Aug 13, 2025](https://blog.google/products/gemini/temporary-chats-privacy-controls/)
- **Temporary Chat:** these chats "won't be used to personalize your Gemini experience or train Google's AI models" and are "kept for up to 72 hours." — [Google blog](https://blog.google/products/gemini/temporary-chats-privacy-controls/)
- **Keep Activity (training link):** when Keep Activity is on, "a sample of your future uploads will be used to help improve Google services for everyone." This applies from Sep 2, 2025. — [Google blog](https://blog.google/products/gemini/temporary-chats-privacy-controls/)
- **Renames:** "Saved Info" (explicit facts) was reportedly renamed "Instructions for Gemini" in 2026 (3P). — [AI Toolbox (third-party)](https://www.ai-toolbox.co/gemini-management-and-productivity/gemini-memory-saved-info-2026)

### Inferences (design patterns)
1. **Two-tier memory:** explicit, user-stated facts or instructions, plus inferred memory from chat history. Users can control each tier separately.
2. **Memory as editable records, not model weights:** Claude stores topics, Microsoft stores items in a hidden mailbox folder, and ChatGPT keeps saved-memory entries. All are user-viewable and editable. Training on content is a separate setting (OpenAI's training toggle, Google's Keep Activity).
3. **Scoped memory:** Claude Projects isolate memory per workspace. This maps naturally to separating "pastoral care" from "sermon prep" from "admin."
4. **Ephemeral mode everywhere:** Temporary or Incognito chats neither read nor write memory. This is a critical pattern for counseling-adjacent conversations.
5. **Pause vs. reset:** keep memories but stop using them (pause), or permanently delete them (reset).
6. **Conversational controls:** "remember/forget X" in chat, plus "what do you know about me?" for transparency.
7. **Sensitive-category opt-in:** Claude does not enable sensitive topics by default, reportedly including religious beliefs. This is directly relevant to church data.
8. **Known pitfalls to avoid:**
   - Chat deletion does not cascade to derived memories (ChatGPT, Copilot).
   - Copilot has no audit logging of memory, admins cannot restrict memory categories, and retention policies don't apply.
   - Defaults are on (Gemini, Claude consumer, Copilot tenant).
   - Deleted-memory logs are kept up to 30 days (OpenAI).
9. **Admin governance:** org-level kill switch, with Claude deleting memory when it is turned off. Owners cannot read individual memories (Claude), while admins can via eDiscovery (Microsoft). These are two different philosophies for staff and pastor privacy.

### Gaps
- I could not fetch OpenAI's help pages (403). Whether ChatGPT memories are used for model training when "Improve the model for everyone" is on, and the Team/Enterprise/Edu memory and admin specifics, were **not verified in this session**.
- Anthropic's statement on whether memory content is used for training was not on the memory help page and was not checked elsewhere.
- Gemini's 2026 menu renames come from a third-party guide only. Google Workspace (enterprise) Gemini memory controls were not checked.

---

## Q5. What concerns do church leaders and surveys raise about AI remembering pastoral or personal information?

### Takeaway
Data privacy is the single most cited concern among church leaders: 83% in Pushpay/Barna's State of Church Tech 2026. Governance is thin: only 5% of churches have AI guidelines, and only 19% feel their data is AI-ready. Practitioner guidance warns specifically against putting counseling, member and financial details into external AI tools. No survey found asks directly about AI *memory*, but the privacy and counseling data map closely onto it.

### Cited Findings
- **Pushpay/Barna, State of Church Tech 2026**, article dated Mar 26, 2026:
  - 83% of church leaders "are concerned about data privacy."
  - 51% "worry about plagiarism or maintaining integrity in message preparation."
  - 49% are concerned about "potential loss of authenticity in preaching or teaching."
  - "only 5 percent of churches currently have AI guidelines."
  - Only 33% say their church uses AI in ministry or operations.
  - **Method:** n=1,306 U.S. church leaders (1,027 completed all questions), fielded Nov 11 – Dec 8, 2025, commissioned by Pushpay and conducted by Barna. — [Barna, Mar 26, 2026](https://www.barna.com/research/church-leaders-ai-usage-concerns/)
- The report was released Mar 9, 2026:
  - 60% of leaders personally use AI at least monthly.
  - 64% say an AI use policy is important.
  - Only 19% are "confident their church's data is ready to produce meaningful AI insights."
  - Pushpay launched a Church AI Policy Generator alongside it. — [Pushpay/Barna press release, Mar 9, 2026 (search excerpt)](https://www.globenewswire.com/news-release/2026/03/09/3251986/0/en/pushpay-and-barna-group-s-2026-state-of-church-technology-report-shows-church-tech-has-moved-past-adoption-now-alignment-is-what-matters.html); [Pushpay blog, Mar 16, 2026](https://pushpay.com/blog/church-ai-policy-planning/)
- Pushpay's blog gives an example of a staff member using AI to draft **pastoral care follow-ups** that a colleague considers crossing a boundary, and recommends teams set these boundaries together. — [Pushpay blog, Mar 16, 2026](https://pushpay.com/blog/church-ai-policy-planning/)
- One summary reports that about 65% of pastors worry AI could displace their spiritual guidance. — [Christian Post (search excerpt)](https://www.christianpost.com/news/most-pastors-use-ai-some-worry-it-could-replace-their-guidance.html)
- Barna reports that just 6% of U.S. pastors are comfortable using AI as a counseling tool. — [Barna: Three Takeaways on How Pastors Can Use AI (search excerpt)](https://www.barna.com/research/pastors-use-ai/)
- Subsplash's guidance (Sep 21, 2026):
  - Financial records, home addresses and member details should not go into external AI tools.
  - Analysis should occur "within secured environments where your data already lives."
  - Churches should screen whether a tool "handles sensitive member, financial, or counseling data."
  - AI "will never be a Spirit-filled shepherd." — [Subsplash blog](https://www.subsplash.com/blog/ai-tools-for-pastors)
- Planning Center advises churches to turn off ChatGPT and Claude training on conversations before connecting church data via MCP, because by default those vendors "can use your conversations to train their models." — [PC blog, Aug 20, 2026](https://www.planningcenter.com/blog/2026/08/announcing-the-planning-center-mcp-connect-chatgpt-claude-and-other-ai-tools)
- Pushpay AI Profile Summaries aggregate "staff notes" into a pastoral briefing. This shows vendors are already putting pastoral notes through AI, with "does not train on a church's data" and permission scoping as the stated safeguards. — [faith.tools Pushpay](https://faith.tools/app/pushpay); [GlobeNewswire, Sep 23, 2026 (search excerpt)](https://www.globenewswire.com/news-release/2026/09/23/3367490/0/en/pushpay-unveils-next-wave-of-churchstaq-and-parishstaq-transformation.html)
- Commentary on surveys notes that using AI for counseling notes, prayer-request follow-ups or pastoral communication transmits sensitive personal information to third-party servers, where it "may be used for training, stored indefinitely, or accessible to employees." — (search-summary of commentary; original source not retrieved; see Gaps)
- A competitor notes that Pushpay "has a commercial interest in portraying digital tools as increasingly essential to ministry," so the vendor framing of the survey should be weighed accordingly. — (search excerpt; MinistryWatch/Good Shepherd commentary, not retrieved)

### Inferences
- For a memory-first ministry-leader app, the 83% privacy-concern figure and the 6% comfort with AI counseling suggest leaders will be wary of memory that captures counseling, prayer requests or member details by default. The mainstream patterns point toward:
  - opt-in sensitive categories;
  - an "incognito/pastoral" mode that writes nothing to memory;
  - scoped memory per ministry area;
  - visible, editable memory records;
  - cascade delete from chat to memory;
  - an explicit no-training commitment.
- With only 5% of churches having AI policies, the app could ship policy-aligned defaults (e.g., an admin kill switch, and no memory of member PII unless enabled). These would help churches meet governance they have not yet written. The other researcher's audit-log work matters here, since Microsoft's lack of memory audit logs is a known weakness.
- Church Assistant (Verble) remembering "member details" by default is the type of design these concerns target. It is a useful contrast for positioning.

### Gaps
- No survey was found that asks specifically about AI **remembering** conversations or pastoral information. Concern figures are about privacy generally.
- The AiForChurchLeaders/Exponential figures (theological misalignment 29%, human connection 23%, privacy and data security 20%) and Lifeway's Sept 2025 figures (n=1,003; 10% use AI regularly, 32% are experimenting) appeared only in a search summary without retrievable source URLs. They are unverified.
- The 65% "displace spiritual guidance" figure and the 6% counseling comfort figure come from search excerpts. The full articles were not fetched.

---

## Q6. Voice: does any product's AI assistant take spoken input, answer aloud, or hold real-time two-way voice conversation? On which platforms, and is it shipped or only announced? How do mainstream assistants combine voice with memory?

### Takeaway
**Only 1 of the 6 core products has AI voice conversation: Rock RMS.** Rock has a real-time, two-way **Voice Agent** block in the **Rock Mobile app** (iOS/Android shell). It opens a live audio session with a realtime AI provider such as OpenAI's gpt-realtime-2 and shows a live transcript. It was SHIPPED in Rock Mobile v19.2 (Jul 6, 2026, per a search excerpt of the release notes). In Rock 19.4.4 a bug stopped it from using Rock MCP tools with OpenAI's realtime model. A fix landed in pre-alpha 21.0.2 (Oct 14, 2026), and it is unclear whether the fix has been backported.
- **Text only:** Planning Center Ask AI, Pushpay, Tithely, Realm and ChurchTrac have no AI voice features documented.
- **Broader market:** no voice found for MinistryPlatform, Subsplash, Gloo Ministry Chat, ChMeetings, ChurchSuite, Logos, Church Assistant (Verble) or AlignedAI. Two sermon tools (SermonBuild, Sermon AI) reportedly offer voice *input* only, which is unverified.
- **Mainstream assistants:** voice is mostly mobile-first, and memory increasingly applies to voice. ChatGPT and M365 Copilot apply memory to voice, and Gemini Live gained memory on Jun 18, 2026 (US English only). Claude's voice docs say transcripts go to chat history but do not state whether memory applies.

### Summary table

| Product | Spoken input | Spoken reply | Real-time two-way | Platform | Status |
|---|---|---|---|---|---|
| Rock RMS: Voice Agent block | Yes | Yes | **Yes** (push-to-talk option, live transcript) | Rock Mobile app (iOS/Android). Not web. Not phone/IVR. | SHIPPED (Mobile v19.2, Jul 6, 2026). MCP-tool bug in 19.4.4, fixed in pre-alpha 21.0.2. |
| Planning Center Ask AI | Not documented | Not documented | No | Web/app sidebar (text) | Text only |
| Pushpay (Profile Summaries, AI search; Giving Data chat announced) | No | No | No | Web | Text only |
| Tithely / Breeze (TithelyAI pilot) | No | No | No | Web dashboard | Text only (pilot) |
| Realm | — | — | — | — | No AI |
| ChurchTrac | No AI voice. Has TTS voice *broadcasts*, see separate notes. | — | No | — | No AI voice chat |
| MinistryPlatform AI / MP-MCP, ChMeetings MCP, Planning Center MCP | Only through the external AI client's own voice mode, if used | Same | Same | Same as the client app | Not a vendor feature (inference) |
| Gloo Ministry Chat (Beta) | Not documented | Not documented | No | Web | Text only. XRI voice tech not tied to it. |
| SermonBuild / Sermon AI | Reportedly yes (voice input) | Unverified | Unverified | Unverified | Unverified (search summary only) |
| Church Assistant (Verble), AlignedAI, Pastors.ai, Pulpit AI | No voice found | No | No | Web | Text only. Aligned's "voice training" = writing style. |

### Cited Findings

**Rock RMS Voice Agent (the only ChMS voice assistant found)**
- The block "opens a live audio session with an AI provider, sends microphone input, plays the spoken reply, and can show a running transcript." It lets people "ask hands-free questions about themselves, their giving, events, or anything exposed through an MCP agent."
  - It supports two realtime providers, chosen by API-key prefix, and requires an authenticated person.
  - It was added in **Rock Mobile v19.2 (July 6, 2026)**, which "can read Rock data and perform actions hands-free," and includes push-to-talk, Bluetooth playback and a live transcript.
  - v19.3 fixed echo cancellation, and v19.4 fixed transcript auto-scroll. — [Rock Mobile Release Notes (search excerpt; page requires login)](https://www.rockrms.com/mobilereleasenotes); [Rock Voice Agent docs (search excerpt; page now returns "Article was not found")](https://community.rockrms.com/developer/mobile-docs/essentials/features/voice-agent)
- An earlier search excerpt described it as tied to a Rock-hosted agent and "scoped to the staff member's own permissions." — [Rock Voice Agent docs (search excerpt)](https://community.rockrms.com/developer/mobile-docs/essentials/features/voice-agent)
- GitHub issue #7039 (opened Sep 14, 2026, Rock 19.4.4, OpenAI `gpt-realtime-2` and `gpt-realtime-2.1`):
  - Title: "Mobile Voice Agent block talks fine but never gets any tools from our Rock MCP agent," so it "cannot look up people or groups."
  - Cause: the MCP endpoint rejected OpenAI's string JSON-RPC `id`.
  - A fix commit was linked Sep 15, 2026. — [GitHub: SparkDevNetwork/Rock #7039](https://github.com/SparkDevNetwork/Rock/issues/7039)
- The matching fix appears in **Pre-Alpha 21.0.2 (Oct 14, 2026)**: "Fixed the MCP endpoint failing when a client sends a string JSON-RPC identifier instead of a number" (#7039). — [Rock Pre-Alpha Release Notes](https://www.rockrms.com/prealpharelease)
- faith.tools lists "a voice agent" as part of the v19.4 AI Agents release (3P). — [faith.tools Rock RMS](https://faith.tools/app/rock-rms)

**Other core and broader products (no AI voice found)**
- Planning Center:
  - Ask AI is described as a sidebar and help-center chat. Neither changelog mentions voice. — [PC changelog, Jul 27, 2026](https://www.planningcenter.com/changelog/global/new-ask-ai-for-instant-answers); [PC changelog, Oct 20, 2026](https://www.planningcenter.com/changelog/global/new-ask-ai); [Planning Center AI page](https://www.planningcenter.com/ai)
  - A search of Planning Center, Pushpay, Tithely and Subsplash with voice terms turned up no voice or speech features. — [search results incl. Subsplash products page](https://www.subsplash.com/products)
- Subsplash pages list a "24/7 AI Assistant" with an "83% resolution rate," apparently a support or help assistant, plus People Assistant. Neither mentions spoken input. — [Subsplash products (search excerpt)](https://www.subsplash.com/products)
- An Aligned comparison page (updated Oct 26, 2026) mentions no voice interaction for any tool. "Voice training: learns from your past sermons" refers to writing style, and Verble's Basic plan includes unexplained "narrations." — [Aligned comparison 2026](https://aligned.church/blog/best-ai-for-pastors-comparison-2026)
- A search summary attributed an "AI Theological Assistant with voice enabled" to **SermonBuild** and a "research assistant with voice input" to **Sermon AI**, both from Aligned-published pages. The fetched Aligned comparison page did not contain these claims, so they are **unverified**. — [Aligned blog (search summary)](https://aligned.church/blog/best-ai-for-pastors-comparison-2026)

**Not AI voice chat (noted separately, per instructions)**
- **ChurchTrac voice broadcasts:**
  - Recipients "get a phone call that plays your message when they answer," with messages up to 90 seconds.
  - Browser recording, uploads and **text-to-speech** require Enhanced Messaging, while legacy and Twilio setups get Call to Record only.
  - Pricing sources conflict (6¢ per recipient, credits, or a $7/mo add-on with 250 messages). — [ChurchTrac: How to send voice messages](https://www.churchtrac.com/support/people/how-to-send-voice-messages); [ChurchTrac Enhanced Messaging](https://www.churchtrac.com/support/people/enhanced-messaging); [ChurchTrac Church Phone Tree](https://www.churchtrac.com/features/church-phone-tree)
- **Gloo / XRI Global:**
  - Gloo acquired XRI Global (announced Nov 25, 2025), "an AI company specializing in multilingual and low-resource language technologies," to strengthen Gloo AI and Gloo360. On its Q3 2025 call, Gloo described XRI as delivering "advanced voice and language translation tech."
  - No evidence was found that XRI powers a voice assistant in Gloo Ministry Chat or Workspace. The Workspace and Ministry Chat pages mention no voice. — [Pulse 2.0 on the acquisition](https://pulse2.com/gloo-buys-xri-global-to-expand-multilingual-and-voice-ai-capabilities/amp/); [Gloo Q3 2025 earnings call transcript (search excerpt)](https://www.insidermonkey.com/blog/gloo-holdings-inc-nasdaqgloo-q3-2025-earnings-call-transcript-1739401/); [Gloo Workspace](https://gloo.com/workspace); [Gloo Ministry Chat](https://gloo.com/workspace/ministry-chat)
- **Church phone answering bots and AI receptionists (caller-facing):**
  - Vendors include ElevenLabs, Frontdesk AI, Dialzara, NextPhone, ChurchWiseAI and Missional Agents.
  - They answer calls 24/7, share service times, take prayer requests and route urgent pastoral calls. Dialzara says it handles "prayer requests, crisis calls, and pastoral care needs."
  - All of this is vendor marketing. — [ElevenLabs for churches](https://elevenlabs.io/ai-answering-service/churches); [Frontdesk AI churches](https://www.myaifrontdesk.com/industries/churches); [Dialzara churches](https://dialzara.com/industries/churches); [NextPhone churches](https://www.getnextphone.com/answering-service-for-churches)

**Mainstream assistants: voice and memory**
- **ChatGPT Voice:**
  - Voice can run inside the chat page, as a floating orb, or as a separate full-screen mode. Some tools are unavailable in voice. — [OpenAI Voice Mode FAQ (search excerpt)](https://help.openai.com/articles/8400625)
  - TechCrunch (Apr 10, 2025) reported the chat-history memory upgrade applies to ChatGPT's "text, voice, and image-generation features."
  - Temporary Chat does not use or update memory. — [TechCrunch via reader mirror](https://hn.jakechampion.name/reader/https://techcrunch.com/2025/04/10/openai-updates-chatgpt-to-reference-your-other-chats); [OpenAI Memory FAQ (search excerpt)](https://help.openai.com/en/articles/8590148-memory-faq)
  - A user forum report says Advanced Voice in custom GPTs did not follow the GPT's instructions. This is an unofficial report and may be dated. — [OpenAI community thread](https://community.openai.com/t/custom-gpt-not-working-with-blue-wave-voice/1232846)
- **Claude voice mode:**
  - It is a "beta feature" on iOS, Android, Desktop and web, on all plans, and "built to work best from your phone."
  - It offers hands-free mode (Claude replies on a pause) or push-to-talk, and it stops when interrupted.
  - "Connected tools work the same way in voice mode as they do in text chat" (examples: Gmail, Google Calendar, Docs, Slack).
  - "Textual transcripts of your audio conversations are saved in your chat history just like text conversations."
  - The article does not say whether memory or projects apply in voice. — [Claude Help Center: voice mode](https://support.claude.com/en/articles/11101966)
- **Gemini Live:**
  - As of **Jun 18, 2026**, Live can "use memories of your past chats and info from some Connected Apps" and "securely remember key details you mention across different sessions."
  - It is "currently available in English in the US." "Gemini Live follows the same permissions that you choose when you chat with Gemini."
  - Android settings still showed Memory as "coming soon to Live." — [9to5Google, Jun 18, 2026](https://9to5google.com/2026/06/18/gemini-live-memory)
  - Earlier guidance said memory did not apply to Live. — [MSPowerUser](https://mspoweruser.com/too-bad-gemini-live-isnt-yet-able-to-reference-your-past-chats)
- **Microsoft 365 Copilot voice:**
  - Roadmap item RM523204, "Voice chats can reference Memory": "Copilot can respond using existing memories already stored in user personalization settings."
  - Platforms: Android, Desktop, iOS, Mac and Web. Status: "Rolling out," with preview Nov 2025 and GA Jan 2026. — [M365 Roadmap RM523204 (mirror)](https://mc.merill.net/message/RM523204)
  - Voice transcripts are kept in conversation history and can be deleted. — [The Register, Apr 8, 2025 (search excerpt)](https://www.theregister.com/2025/04/08/microsoft_new_copilot_features/)
  - In consumer Copilot, a training opt-out for voice is separate from personalization. — [Microsoft Copilot privacy controls (search excerpt)](https://support.microsoft.com/en-US/Microsoft-Copilot/microsoft-copilot-privacy-controls)

### Inferences
- Voice for ministry leaders is nearly unoccupied ground in church software. Rock is the only ChMS with a real-time voice agent, and it is mobile-only, self-configured (bring your own realtime-provider API key) and had a tool-calling bug through at least Sep 2026. No vendor pairs voice with memory.
- Churches using MCP connectors (Planning Center, MinistryPlatform, ChMeetings) can likely already reach church data by voice through Claude's or ChatGPT's voice modes, since Claude says connected tools work the same in voice. Memory would then sit in those third-party apps. Whether custom MCP connectors (as opposed to built-in Gmail/Calendar) work in Claude voice was not verified.
- Mainstream pattern: voice is a *mode of the same conversation*. Transcripts are saved to chat history, so voice feeds the same memory pipeline. Voice therefore needs the same view, delete and temporary-mode controls, and an app for ministry leaders should apply its "pastoral/incognito" mode to voice too. Spoken asides (e.g., after a hospital visit) are an easy way for sensitive details to end up in memory.
- Real-time voice depends on third-party realtime model APIs (Rock uses OpenAI's gpt-realtime models), which adds a data processor and audio-retention questions alongside the memory questions.

### Gaps
- Rock Voice Agent official docs now return "Article was not found," and the mobile release notes require login. The v19.2 date and feature list come from a search excerpt. Whether the #7039 fix is in a v19.x stable release is not confirmed.
- The voice status of Planning Center Ask AI on its mobile apps (e.g., device dictation) was not found. "Not documented" does not prove absence.
- SermonBuild and Sermon AI voice claims are unverified.
- Whether Claude voice mode uses saved memory, and whether temporary/incognito modes are available in voice for Claude, Gemini Live and Copilot, was not confirmed.
- Audio retention periods for Claude and ChatGPT voice were not found in the pages read.
