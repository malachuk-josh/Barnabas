# Gap check: a fully multilingual member experience in church management software (as of Nov 2026)

Definition tested: each member has a preferred language stored on their profile. Emails, SMS and WhatsApp, push notifications, forms and registrations, giving pages, the member app, and care or follow-up messages reach each member in that language. Translation is automatic, and staff can review it before sending.

## Verdict: does "not currently offered in the marketplace" hold?

### Takeaway
**The claim partly holds.** I found no product that does the full job: storing each member's language and then automatically translating staff-written messages for each recipient, across every channel, with staff review. The earlier framing ("translation exists only for sermons and content") is wrong, though. Several products already ship pieces of it:
- **Interface localization:** Pushpay (5 languages), MinistryPlatform (4), TouchPoint (Spanish), ChMeetings (about 23), ChurchSuite, Church Online Platform (63) and ChurchTrac (Spanish).
- **A stored language on the member record:** Flocknote, ParishSoft and ChurchCRM.
- **AI help translating while drafting:** ChMeetings.
- **Auto-translated chat:** Church Online Platform.
- **WhatsApp:** ChMeetings and integrations.

The defensible white space is narrower: **automatic, per-recipient translation of what staff write, driven by a stored preferred language, with review, across email, SMS, WhatsApp, push, forms, giving and care.**

### Cited Findings
**Audit list: what was checked and what was found**

| Product | Interface in other languages | Per-person language field | Automatic translation of outgoing messages | Multilingual forms / giving | WhatsApp | Source |
|---|---|---|---|---|---|---|
| Planning Center / Church Center | No. FAQ: "There are no immediate plans to support Planning Center in other languages." Support is English-only. Churches can name events in their own language. Button labels on the site and in emails cannot be renamed. | No | No | No | Not found | [PC FAQ](https://help.planningcenter.com/en/136588-planning-center-faq.html); [PC changelog](https://planningcenter.com/changelog) (no translation items found) |
| Pushpay (ChurchStaq / ParishStaq, LEAD app, giving) | Yes. ChMS and LEAD app "now available in 5 languages - English, Spanish, Vietnamese, Korean and Chinese". Giving has an English/Spanish toggle. | Leaders and volunteers "choose their language in our software" (a UI choice, not shown as a field that drives communications) | Not mentioned | Spanish giving, including forms, confirmation pages, email receipts and SMS codes (Bear Creek case, 2022) | Not found | [Pushpay Catholic Multilingual](https://pushpay.com/solutions/catholic/multilingual); [Pushpay release, Oct 25 2022](https://au.finance.yahoo.com/news/pushpay-parishstaq-illuminates-catholic-faith-130000187.html); [Church Executive, Oct 2022](https://churchexecutive.com/archives/technology-helps-bear-creek-church-grow-its-multilingual-ministry) |
| Tithely (Breeze, Elvanto, Church App) | Breeze: no Spanish interface; support suggests Chrome page translation. Elvanto: Capterra lists English, French, German, Japanese, Norwegian, Spanish. Church App: one App Store listing shows Spanish and others. | Not found | No | Giving app in English, Spanish and French (Jun 2024) | Not found | [Breeze support (search excerpt; page 403)](https://support.breezechms.com/hc/en-us/articles/360036848893-Can-I-change-the-language-to-Spanish); [Capterra Elvanto](https://www.capterra.ie/reviews/125780/elvanto); [App Store listing (search excerpt)](https://apple.co/2m5PloR); [Tithely updates archive](https://get.tithe.ly/blog/tithely-product-updates-archive) |
| Realm (ACS) | Not found | Not found | Not found | Not found | Not found | Searched help.acst.com and acstechnologies.com; nothing found (see Gaps) |
| Rock RMS + Rock Shop | Core: full language support "not on the road-map of the core developer team" (old community answer). Plugins: omniLingua (manual translation pairs for visitor-facing pages, Rock 17.2+) and Triumph Multilingual Websites (100+ languages, website only). | No core field found | No | omniLingua can be scoped to Registrations (manual pairs); a "Rosetta Stone" recipe does the same with Defined Types | Top community idea (6 votes), not built | [omniLingua](https://www.rockrms.com/rockshop/plugin/225); [Triumph](https://www.triumph.tech/services/multilingual-websites); [Rock Q&A](https://community.rockrms.com/ask/using/49); [Chip recipe](https://chiptraining.rockrms.com/ask-chip-training/recipes/536); [Rock Ideas](https://community.rockrms.com/ideas) |
| MinistryPlatform (ACS) | Widgets in Chinese, English, Portuguese, Spanish (labels, dates, currency) | No | No. Record data stays in the language it was entered in. | Widget labels translated; content not translated | Not found | [MP KB: Language & Locale](https://kb.ministryplatform.com/kb/widgets/user-widgets/language-locale); [ACS help](https://help.acst.com/ministryplatform/help-topics/widgets/user-widgets/language-and-locale) |
| Subsplash | Not documented | Not found | Not found | Not found | Not found | Searched subsplash.com and support.subsplash.com; nothing found (see Gaps) |
| ChurchTrac | English and Spanish interface | Not found | No | Not found | No | [ChurchTrac FAQ](https://www.churchtrac.com/support/getting_started/churchtrac-faqs); [ChurchMemberPro review](https://churchmemberpro.com/blog/churchtrac-review/) |
| **ChMeetings** (closest all-round) | About 22–23 languages. "Let each person use ChMeetings in their preferred language within the same church account." | Per-person *interface* language | **Partial.** The AI writing assistant can "draft and translate emails". It is staff-triggered, not per-recipient. | Not documented | Yes. "Open WhatsApp, Viber, Telegram, or Facebook Messenger from a member's profile." WhatsApp Business via Saysimple. | [ChMeetings all features](https://chmeetings.com/all-features); [ChMeetings help: languages](https://help.chmeetings.com/hc/en-us/articles/360020719317); [Saysimple](https://www.saysimple.com/integrations/chmeetings) |
| ChurchSuite (UK) | Member-facing pages follow browser language. Native English, French, German, Spanish; Google and amateur translations for others. | No (browser-based) | No | Embed (forms, calendar) covered by translated UI strings | Not found | [ChurchSuite support (search excerpt; page 403)](https://support.churchsuite.com/article/558-international-support) |
| ChurchDesk (EU) | Danish, English, German, Swedish (directory listing) | Not found | Not found | Not found | Not found | [Capterra ChurchDesk](https://www.capterra.com.au/software/135912/churchdesk) |
| Faithlife (Equip) | Not found for Equip; Faithlife's Spanish product is the Biblia Bible app | Not found | Not found | Not found | Not found | [MobileRead wiki](https://wiki.mobileread.com/wiki/Faithlife); [Equip FAQ](https://faithlife.com/products/equip/customer-stories) |
| Gloo (Messaging, AI) | Dashboard English-only | Account-level default language for auto-responses only | No | N/A | Not found | [Gloo help](https://help.gloo.us/en/articles/5831652-is-gloo-workspace-available-in-spanish); [Gloo XRI release](https://gloo.com/press/releases/gloo-acquires-xri-global-unlocking-advanced-multilingual-and-voice-ai-capabilities-to-expand-market-opportunity) |
| **TouchPoint Software** | "Spanish is available now, with more languages on the way". Covers the platform and the app menu. | Users "toggle their preferred language anytime" | Not mentioned | Not mentioned | Not found | [TouchPoint Translations](https://www.touchpointsoftware.com/features/translations/) |
| **Flocknote** (Catholic comms) | Partial Spanish system text | **Yes.** Member profile language switches automated prompts, note footer links and navigation to Spanish. | **No.** "the English notes you write will need to be translated on your end" | N/A | No | [Flocknote help, Oct 28 2024](https://help.flocknote.com/article/226-using-flocknote-in-spanish-speaking-communities) |
| **ParishSoft** (Ministry Brands) | Not stated | **Yes.** A "Language" field on the member record drives which version of a mailing is sent. | No. Versions are written by hand. | N/A | N/A | [Diocese of Fort Wayne–South Bend](https://diocesefwsb.org/how-to-choose-the-spanish-language-in-parishsoft) |
| Church Online Platform (Life.Church) | 63 attender/host languages; 32 admin languages | Manual switch per viewer | **Attender chat auto-translated** (live chat only) | N/A | N/A | [Church Online support](https://support.online.church/l/en/article/gobpovgbmk-localization) |
| ChurchCRM (open source) | 49 community translations | **Yes.** PR merged Oct 31 2026 to a feature branch: member picks a language; portal and member mail use it. | No. System strings only. | Portal only | No | [GitHub PR #10858](https://github.com/ChurchCRM/CRM/pull/10858); [ChurchCRM site](https://churchcrm.io/church-management-software/) |
| Spanish-first / LatAm (Iglesia HOY, NexChurch, Asoriba, churchsoftware.com) | Iglesia HOY is Spanish-language. churchsoftware.com claims 8 languages, including Korean and Portuguese (unverified; page 503). | Not found | Not found | Not found | NexChurch "integrates WhatsApp and email" (directory claim); Asoriba has a WhatsApp contact button | [Capterra Iglesia HOY](https://www.capterra.com/p/196849/Iglesia-HOY/); [GetApp Iglesia HOY](https://www.getapp.com/nonprofit-software/a/iglesia-hoy/); [Capterra NexChurch](https://www.capterra.com/p/10045386/NexChurch/); [Asoriba](https://asoriba.com/); [churchsoftware.com/languages](https://churchsoftware.com/languages) |

- **Outside the church market, the pattern already exists.** Solidarity Tech, an organizing CRM, keeps a per-person preferred language. "When sending emails or text blasts, Solidarity Tech checks each person's preferred language and delivers the message in that language if a version is available." Versions still have to be written. — [Solidarity Tech docs](https://docs.solidarity.tech/docs/preferred-language)
- I found no church product that pairs a stored preferred language with automatic translation of staff-written messages. A search aimed at that exact combination returned only ChurchCRM's system-string feature and live sermon tools. — [ChurchCRM PR](https://github.com/ChurchCRM/CRM/pull/10858); [Wordly](https://www.wordly.ai/church-translation)

### Inferences
- The claim should be restated before it is used. "No church platform offers multilingual features" is false. A version that survives this check: "No church management system stores each member's preferred language and automatically delivers staff-written emails, texts, WhatsApp, push, forms, giving and care follow-ups in that language, with staff review."
- **ChMeetings is the biggest risk of the gap closing.** It already has per-person interface language, AI translation in its email composer and WhatsApp hand-off. Joining these into per-recipient auto-translation would be a short step.
- **Pushpay is the second risk.** It has 5-language staff and leader apps, Spanish giving, a Catholic and Hispanic focus, and a stated roadmap.
- Gloo, with XRI Global, has the language technology. It does not yet have a ChMS-level member-language model.
- Flocknote and ParishSoft show that the data model (a language field) is already familiar to Catholic parishes, and that the missing piece is the translation step. This is useful positioning evidence.

### Gaps
- I did not open every vendor's admin UI. "Not found" means not found in public docs, help centers or directories, not confirmed absent.
- Some rows rest on search-engine excerpts because the pages returned 403 or 503: ChurchSuite, Breeze, the ChMeetings languages article, churchsoftware.com and the Tithely App Store listing.

## Which ChMS / church app products offer interface languages, a per-person language field, automatic translation, multilingual forms, or WhatsApp?

### Takeaway
Interface localization is common among mid-to-large and international vendors: Pushpay, MinistryPlatform, TouchPoint, ChMeetings, ChurchSuite, Church Online Platform and ChurchTrac. A per-person language field that changes what a member *receives* exists only in comms and parish tools (Flocknote, ParishSoft) and open-source ChurchCRM. None of these translate the content. Automatic translation appears only as AI drafting help (ChMeetings) or live chat (Church Online Platform). WhatsApp is native only in ChMeetings, the international-leaning vendor, and through integrations elsewhere.

### Cited Findings
**Planning Center / Church Center**
- The FAQ says: "There are no immediate plans to support Planning Center in other languages." Videos, documentation and support are English-only. "You can name your events, ministries, and assignments in your language." Button labels on the site and in emails cannot be renamed. — [Planning Center FAQ](https://help.planningcenter.com/en/136588-planning-center-faq.html)
- A search of the changelog for translation or language items found none for 2026. The People items include "Attachment support for all People emails" (Apr 16, 2026). — [Planning Center changelog](https://planningcenter.com/changelog)
- The only translation integration found is spf.io's, which imports PCO service plans as spf.io playlists for worship translation. It does not use people or communications data. — [spf.io, Apr 2018](https://www.spf.io/2018/04/12/faster-multilingual-worship-planning-with-spf-ios-planning-center-integration/)

**Pushpay (ChurchStaq / ParishStaq)**
- On Oct 25, 2022, Pushpay "recently launched multilingual translation capabilities" in ParishStaq and ChurchStaq. Customers can "toggle between English and Spanish within the giving platform, ChMS, and LEAD App." Vietnamese, Chinese and Korean were "on the roadmap." — [Pushpay press release via Yahoo Finance](https://au.finance.yahoo.com/news/pushpay-parishstaq-illuminates-catholic-faith-130000187.html); also repeated in a [Pushpay blog post updated Jun 11, 2026](https://pushpay.com/blog/the-most-wonderful-time-and-technology-of-the-year/)
- The current Catholic multilingual page says the ChMS and LEAD app are "now available in 5 languages - English, Spanish, Vietnamese, Korean and Chinese". It markets "First ChMS In Spanish". The giving app "has a handy toggle for users to switch between English and Spanish". In the parishioner app, churches can "customize content in the language you need" (written by hand). The page does not mention automatic translation, translated emails or texts, or forms. — [Pushpay Catholic Multilingual Tools](https://pushpay.com/solutions/catholic/multilingual)
- Bear Creek Baptist case: Pushpay's Spanish web giving lets members switch the giving page to Spanish, "including forms, confirmation pages, email receipts, and SMS codes". Spanish ministry leaders use the LEAD app's translation feature. — [Church Executive, Oct 17, 2022](https://churchexecutive.com/archives/technology-helps-bear-creek-church-grow-its-multilingual-ministry)

**Tithely family**
- Breeze has no built-in Spanish interface. Support suggests Chrome's page translation as "the best workaround". Custom profile fields can carry Spanish labels, but the change "will apply to all users". — [Breeze support (search excerpt; page returned 403)](https://support.breezechms.com/hc/en-us/articles/360036848893-Can-I-change-the-language-to-Spanish)
- The new Tithely Giving App launched in English, Spanish and French (Jun 2024). — [Tithely product updates archive](https://get.tithe.ly/blog/tithely-product-updates-archive)
- Capterra lists Elvanto's languages as English, French, German, Japanese, Norwegian and Spanish. This is an aggregator, not vendor-confirmed. — [Capterra Elvanto](https://www.capterra.ie/reviews/125780/elvanto)
- An App Store listing for a Tithely Church App (Brazil) shows English, German, Norwegian Bokmål, Russian, Spanish and Swedish. This is a regional listing and only suggestive. — [App Store (search excerpt)](https://apple.co/2m5PloR)

**Rock RMS and the Rock Shop**
- A Rock community answer says full-language support "is not on the road-map of the core developer team". It notes that at least one Spanish-speaking church translates Rock's internal pages with Google Translate. The thread is undated and likely years old. — [Rock Q&A](https://community.rockrms.com/ask/using/49); [Rock Q&A](https://www.rockrms.com/ask/developing/1358)
- **omniLingua** (Rock Shop, vendor Yesu Chum, requires Rock 17.2) "translates visitor-facing pages on demand":
  - Admins enter source and translated text pairs by hand; no machine translation is mentioned.
  - It runs server-side through OWIN middleware and client-side through JavaScript.
  - Pairs can be conditioned by campus, sign-in state and time window, and scoped to a Site, Page or Registration.
  - No per-person language, email or SMS support is described. Pricing is shown only inside a Rock instance.
  - — [Rock Shop: omniLingua](https://www.rockrms.com/rockshop/plugin/225)
- **Triumph Multilingual Websites** (Rock-focused service) offers 100+ languages:
  - It requires the Triumph Web Agility plug-in and an $850 (one site) or $1,100 (two sites) implementation fee.
  - Monthly tiers range from about $160 to $600, depending on languages and word count.
  - "Obsidian blocks are currently not supported." It covers websites only.
  - — [Triumph Tech](https://www.triumph.tech/services/multilingual-websites)
- A Rock "Rosetta Stone" recipe stores translation pairs in a Defined Type so a registration template renders in a target language. It is manual. — [Rock Chip Training recipe](https://chiptraining.rockrms.com/ask-chip-training/recipes/536)
- The top Rock community idea is "Support WhatsApp as a texting channel through Twilio" (6 votes). It has not been built (per the team's earlier note). — [Rock Ideas](https://community.rockrms.com/ideas)

**MinistryPlatform (ACS)**
- The Language & Locale widget supports Chinese, English, Portuguese and Spanish for menu and navigation text, date and time formats, and currency. "Default label values will always come with a translation for each supported language." Record data appears in the language it was entered in, so a Spanish widget can still show English event details. — [MinistryPlatform KB](https://kb.ministryplatform.com/kb/widgets/user-widgets/language-locale); [ACS help](https://help.acst.com/ministryplatform/help-topics/widgets/user-widgets/language-and-locale)

**TouchPoint Software**
- Its "Multilingual Church Management Software" page aims for churches to "experience our entire platform in their native language".
  - "Spanish is available now, with more languages on the way!"
  - "churchgoers can choose their language directly on the platform and app" and "toggle their preferred language anytime."
  - "Translations can be enabled directly by users or managed by your church administrator." Partner churches help validate accuracy.
  - Translated emails or texts are not mentioned. The page shows no launch date.
  - — [TouchPoint Translations](https://www.touchpointsoftware.com/features/translations/)

**ChMeetings**
- The features page offers "Multilingual Support: Let each person use ChMeetings in their preferred language within the same church account." It lists about 23 languages, from English, Arabic, Afrikaans, Amharic and Chinese through Vietnamese. — [ChMeetings all features](https://chmeetings.com/all-features)
- AI: "Draft emails, adjust their tone, and translate text with the built-in AI writing assistant". A "Translate" button appears in the AI Guide mockup. The page does not say messages are translated per recipient. — [ChMeetings all features](https://chmeetings.com/all-features)
- WhatsApp: "Open WhatsApp, Viber, Telegram, or Facebook Messenger from a member's profile". It helps add members "to WhatsApp or Telegram groups", and follow-ups can go "by phone, text, or WhatsApp from their profile". — [ChMeetings all features](https://chmeetings.com/all-features)
- In the mobile app, staff can send via WhatsApp standard or Business. Saysimple adds WhatsApp Business notifications for services, events and volunteering. — [ChMeetings help: communication options](https://help.chmeetings.com/hc/en-us/articles/360020871478-Communication-Options-in-ChMeetings); [Saysimple](https://www.saysimple.com/integrations/chmeetings)
- Sources conflict on the language count: the vendor says "22 Languages" and TrustRadius says 16. One Capterra reviewer cited a "lack of support in Spanish", which is probably an older review. — [ChMeetings help: languages](https://help.chmeetings.com/hc/en-us/articles/360020719317); [TrustRadius](https://www.trustradius.com/products/chmeetings/details); [Capterra reviews p.3](https://www.capterra.com/p/184192/Chmeetings/reviews/?page=3)

**ChurchSuite, ChurchDesk, ChurchTrac, Faithlife, Gloo, Subsplash**
- ChurchSuite:
  - A translation database built from native, Google Translate and amateur translations covers ChurchSuite, My ChurchSuite, Connect and Embed.
  - "if the browser language matches one of our supported translations, page content will be translated."
  - Native translations exist for English, French, German and Spanish. Danish, Dutch, Italian, Polish, Slovak and Swedish rely more on Google and amateur translation.
  - Admin modules stay in English unless the account is set to another language.
  - — [ChurchSuite support (search excerpt; page returned 403)](https://support.churchsuite.com/article/558-international-support)
- ChurchDesk languages per directories: Danish, English, German, Swedish. — [Capterra](https://www.capterra.com.au/software/135912/churchdesk)
- ChurchTrac's interface is officially in English and Spanish. It has no WhatsApp. — [ChurchTrac FAQ](https://www.churchtrac.com/support/getting_started/churchtrac-faqs); [ChurchMemberPro](https://churchmemberpro.com/blog/churchtrac-review/)
- Faithlife: "Biblia" is the Spanish version of the Logos Mobile app, a Bible app rather than a ChMS. I found no language list for Equip's church app. — [MobileRead wiki](https://wiki.mobileread.com/wiki/Faithlife); [Faithlife Equip FAQ](https://faithlife.com/products/equip/customer-stories)
- Gloo:
  - "The Gloo interface is also not available in Spanish."
  - Admins can set Default Language (Account Settings > Organization) so "the auto responses will be sent in Spanish."
  - Broadcasts can be written in Spanish by staff. The Prayer feature triggers only on English words.
  - No translation is mentioned.
  - — [Gloo help](https://help.gloo.us/en/articles/5831652-is-gloo-workspace-available-in-spanish)
- Gloo bought XRI Global on Nov 25, 2025, to "deploy trusted multilingual AI throughout the faith and flourishing ecosystem". XRI built AI models for 30+ languages in 18 months, and its technology will strengthen Gloo AI and Gloo360. No customer-facing communications feature has been described. — [Gloo press release](https://gloo.com/press/releases/gloo-acquires-xri-global-unlocking-advanced-multilingual-and-voice-ai-capabilities-to-expand-market-opportunity); [Pulse 2.0](https://pulse2.com/gloo-buys-xri-global-to-expand-multilingual-and-voice-ai-capabilities); [Built In Colorado](https://www.builtincolorado.com/articles/boulder-based-gloo-acquires-xri-global-20251125)
- Subsplash: a site-restricted search of subsplash.com and support.subsplash.com found no app-language or translation documentation. It found only churches posting Spanish sermons. — [Subsplash support: Bible tab](https://support.subsplash.com/en/articles/9067471-the-bible-tab)
- One Subsplash-built church app on the App Store lists English, French, Portuguese, Simplified Chinese and Spanish. This weakly suggests template-level OS localization. — [App Store: FaithLife Christian Ministries](https://apps.apple.com/app/id6503355045)

**Catholic and parish communications tools (per-person language fields)**
- Flocknote:
  - Setting a member's profile language changes "some of the automated return prompts, links at the bottom of all notes, and general navigations on the site" to Spanish.
  - However, "the English notes you write will need to be translated on your end to Spanish". It recommends a bilingual staff member or volunteer.
  - A Spanish text-to-join number (202-765-3441) gives Spanish automated replies.
  - — [Flocknote help, updated Oct 28 2024](https://help.flocknote.com/article/226-using-flocknote-in-spanish-speaking-communities)
- ParishSoft:
  - The member record has a "Language" field. "The Spanish version is sent only to those who are marked 'Spanish' under language field."
  - The diocese warns: "do not assume that because a person is fluent in Spanish, they want their written communication in Spanish."
  - The Spanish and English versions are written separately.
  - — [Diocese of Fort Wayne–South Bend](https://diocesefwsb.org/how-to-choose-the-spanish-language-in-parishsoft)

**Spanish-first, international and open source**
- Church Online Platform (Life.Church): 63 attender and host languages and 32 admin languages, switched manually. "the attender chat is auto-translated across many languages." Email and SMS are not addressed. — [Church Online support](https://support.online.church/l/en/article/gobpovgbmk-localization)
- ChurchCRM (open source), PR #10858:
  - Members pick a language under Profile → Update your details → Language.
  - "the portal and the emails it sends them use it"; "Sign-in codes and other member mail go out in the member's language."
  - It was merged on Oct 31, 2026 into the `feature/member-sign-in` branch.
  - It covers system strings only, with 49 community translations.
  - — [GitHub](https://github.com/ChurchCRM/CRM/pull/10858); [ChurchCRM](https://churchcrm.io/church-management-software/)
- Iglesia HOY: Spanish-language church management for Hispanic churches, covering members, finances, Bible school, cell groups and documents. — [GetApp](https://www.getapp.com/nonprofit-software/a/iglesia-hoy/); [Capterra](https://www.capterra.com/p/196849/Iglesia-HOY/)
- NexChurch is described as automating workflows and integrating WhatsApp and email. This is a directory claim only. — [Capterra](https://www.capterra.com/p/10045386/NexChurch/)
- churchsoftware.com claims availability in English, Spanish, Portuguese, Mandarin, French, Hindi, Korean and Filipino. This comes from a search excerpt only; the page returned 503. — [churchsoftware.com/languages](https://churchsoftware.com/languages)
- Text In Church can be connected to WhatsApp Business only through a third-party no-code connector (Workload). — [Workload](https://www.workload.co/api/text-in-church/integrations/whatsapp-local)

### Inferences
- "Multilingual" in church software today mostly means **localizing the staff or member interface**, which is fixed button and menu text. It rarely means **translating the content staff write**. Every per-person language field I found switches system text or picks a hand-written version.
- WhatsApp is a gap among US-centric leaders (Planning Center, Pushpay, Tithely/Breeze, Realm, ChurchTrac). Rock users ask for it most. ChMeetings is the exception.

### Gaps
- Realm: no public language documentation was found. This is unknown, not confirmed absent.
- Subsplash: no vendor documentation on app interface languages or translation was found.
- I found no vendor page for "Bless" church software. ParishStaq-specific parishioner-app (MyParish) language docs were not found beyond the Pushpay Catholic page.
- I did not verify whether Pushpay's Vietnamese, Korean and Chinese cover the parishioner app, emails or forms, or only the staff ChMS and LEAD app. The Catholic page names only the ChMS and LEAD app.

## Which products translate live services or sermons, and do any connect to ChMS data for member communications?

### Takeaway
There is a crowded live-translation category: spf.io, OneAccord, Wordly, Glossa, Church Translation, Polyglossia, Breeze Translate, Maestra and Pastors.ai. All of them serve the worship moment, through QR-code listening or reading, captions and transcripts. None I found reads ChMS people data or sends member communications in each member's language. The only ChMS link found is spf.io importing Planning Center service plans.

### Cited Findings
- spf.io: its Planning Center integration imports PCO plans as playlists to translate worship services. It does not touch member data. — [spf.io](https://www.spf.io/2018/04/12/faster-multilingual-worship-planning-with-spf-ios-planning-center-integration/)
- Wordly:
  - Live audio and text translation in "60+ Languages", plus transcripts and summaries.
  - It integrates with Zoom, Teams and "other video platforms". No ChMS is named.
  - Pricing is by hours (5, 10 or 25 hours a month).
  - It does not translate emails or documents, though it offers transcript translation and video subtitles and dubbing.
  - — [Wordly church translation](https://www.wordly.ai/church-translation)
- OneAccord: live AI translation and captioning for churches, delivered to congregants' devices through a browser and QR code. Directories disagree on the language count (20+, 30+, 35+ and 50+). No ChMS integration was found. — [OneAccord](https://oneaccord.ai); [AlternativeTo](https://alternativeto.net/software/oneaccord/about)
- Glossa: AI sermon translation into 100+ languages. Listeners join by QR code, "get notified when the church goes live", and switch languages on the fly. — [Glossa](https://glossa.live/en); [App Store](https://apps.apple.com/us/app/glossa-ai-church-translation/id6759844333)
- Church Translation: live AI subtitles that members can read "in over 127 written languages". — [Church Translation help](https://churchtranslation.featurebase.app/help/articles/3548253-language-support)
- Polyglossia: live translation; "custom banner messages auto-translate too" (on-screen only). — [Polyglossia](https://polyglossia.io/)
- Breeze Translate is a separate live sermon tool, unrelated to Breeze ChMS. One church describes it as supporting "nearly 200 different languages". — [Jubilee Church](https://dev.jubilee.church/diary/sundays/translation)
- Pastors.ai (real-time sermon translations) and Gloo Content Studio (translation settings) were found in the team's earlier pass. — [Aligned comparison](https://aligned.church/blog/best-ai-for-churches-comparison-2026)
- Earlier attempts disappointed users. Bear Creek Baptist first used headsets for live translation, which "wasn't always accurate." — [Church Executive](https://churchexecutive.com/archives/technology-helps-bear-creek-church-grow-its-multilingual-ministry)

### Inferences
- The worship-translation layer is commoditizing, with many vendors and hourly or flat pricing. Member communications are not served. A ChMS that owns the person record, the preferred language and the outbound channels is better placed than any of these tools to deliver per-member translation.

### Gaps
- Interprefy and Microsoft Translator (live presentation mode) were not specifically checked this session. Neither is a church vendor, and neither is known to link to a ChMS.
- I did not check whether OneAccord's "multilingual communication ... during services and group sessions" includes any messaging outside the live session.

## For each near match, what does it do and how does it fall short?

### Takeaway
The nearest matches split into three groups:
1. **Interface localizers:** Pushpay, TouchPoint, MinistryPlatform, ChurchSuite, ChMeetings, ChurchTrac, Church Online Platform.
2. **Language-field routers that rely on manual translation:** Flocknote, ParishSoft, ChurchCRM.
3. **AI drafting assistants:** ChMeetings' "translate" button.

No product combines a stored preference, automatic translation of each outgoing message, review before sending, and coverage of every channel.

### Cited Findings
- **ChMeetings.**
  - Has: per-person interface language (about 23 languages), an AI assistant that can "draft and translate emails", and WhatsApp, Viber, Telegram and Messenger launched from the profile.
  - Missing: translation is triggered by staff on a draft. There is no documented per-recipient delivery in the member's language, and no translated SMS, push or forms. WhatsApp opens the staff member's own app, which is not an automated broadcast channel.
  - — [ChMeetings all features](https://chmeetings.com/all-features)
- **Pushpay (ChurchStaq/ParishStaq).**
  - Has: a 5-language ChMS and LEAD app, an English/Spanish giving toggle, and Spanish giving forms, receipts and SMS codes.
  - Missing: these are UI and template translations chosen by the user. Staff-written emails, texts and app content are not translated, and the parishioner app is "customize content in the language you need" (manual). Languages beyond Spanish appear to cover staff and leader apps only.
  - — [Pushpay Catholic](https://pushpay.com/solutions/catholic/multilingual); [Church Executive](https://churchexecutive.com/archives/technology-helps-bear-creek-church-grow-its-multilingual-ministry)
- **TouchPoint.**
  - Has: the platform and app in Spanish, with a user toggle and an admin option.
  - Missing: content and communications translation is not described, and only Spanish is available.
  - — [TouchPoint](https://www.touchpointsoftware.com/features/translations/)
- **Flocknote.**
  - Has: a per-member language that switches system text.
  - Missing: "the English notes you write will need to be translated on your end".
  - — [Flocknote](https://help.flocknote.com/article/226-using-flocknote-in-spanish-speaking-communities)
- **ParishSoft.**
  - Has: a per-member Language field used to route the Spanish version of mailings.
  - Missing: both versions are written by hand, and there is no translation.
  - — [Diocese FWSB](https://diocesefwsb.org/how-to-choose-the-spanish-language-in-parishsoft)
- **MinistryPlatform.**
  - Has: widgets in 4 languages.
  - Missing: "Data pulled from MinistryPlatform records appears in the language it was entered in". There is no per-person preference and no translation.
  - — [MP KB](https://kb.ministryplatform.com/kb/widgets/user-widgets/language-locale)
- **ChurchSuite.**
  - Has: member-facing pages that follow the browser language, using native and Google translations of UI strings.
  - Missing: no stored preference, and no translation of communications content.
  - — [ChurchSuite support (excerpt)](https://support.churchsuite.com/article/558-international-support)
- **Church Online Platform.**
  - Has: auto-translated live attender chat and a 63-language viewer UI.
  - Missing: it covers only the livestream, not ChMS communications.
  - — [Church Online support](https://support.online.church/l/en/article/gobpovgbmk-localization)
- **Rock (omniLingua, Triumph).**
  - Has: website and page translation, with manual pairs (omniLingua) or a managed service (Triumph).
  - Missing: no per-person language, no email or SMS translation, and core Rock has no roadmap for it.
  - — [omniLingua](https://www.rockrms.com/rockshop/plugin/225); [Triumph](https://www.triumph.tech/services/multilingual-websites)
- **Gloo.**
  - Has: an account-level Spanish setting for auto-responses, plus XRI multilingual AI.
  - Missing: the interface is English-only, there is no per-person language, and no translation of messages.
  - — [Gloo help](https://help.gloo.us/en/articles/5831652-is-gloo-workspace-available-in-spanish)
- **ChurchCRM.**
  - Has: a per-member language for the portal and system emails, merged to a feature branch on Oct 31, 2026.
  - Missing: system strings only, and it is open source and self-hosted.
  - — [GitHub](https://github.com/ChurchCRM/CRM/pull/10858)

### Inferences
- **Design lesson from ParishSoft's guidance.** Preference must be explicit and per channel. Fluent Spanish speakers may prefer written English. This argues for a per-member "written communications language" with an "both / bilingual" option, rather than inferring language from ethnicity or surname.
- **Review before send** is absent everywhere. This is a natural differentiator, and it answers the accuracy worries raised by early live-translation attempts.

### Gaps
- No vendor publishes accuracy or usage data for its translations.

## What evidence shows ministries want it?

### Takeaway
Demand is real and measurable. In the 2026 Barna/Pushpay study, leaders name multilingual tools among the tools they expect to grow in importance. Language need is large: 23% of US residents aged 5 and over speak a non-English language at home, 28% of US Catholic parishes hold Spanish Masses, 75% of Hispanic Protestant churches hold services wholly or partly in Spanish, and there are about 4,450 Korean churches. Multiracial congregations doubled to 25%. Satisfaction with current language tools has historically lagged their importance.

### Cited Findings
- **2026 State of Church Tech (Barna and Pushpay).**
  - Sample: 1,306 US church leaders surveyed Nov 11–Dec 8, 2025. 644 respondents came through Pushpay invitations and 661 through Barna's. 1,027 answered every question.
  - Text: "leaders anticipate growing importance for emerging or less widely adopted tools. These include mobile apps, multilingual tools and targeted marketing."
  - Usage: ChMS 84%, SMS/texting 80%, mobile church app only 54%.
  - — [Report PDF (third-party-hosted copy)](https://worldtrend.theblendingofthebody.org/wp-content/uploads/2026/06/barna-pushpay-state-of-church-tech-report-2026-pp.pdf)
- MinistryWatch's summary of the same report: it "flags mobile church apps, tap technology, and multilingual tools as leading priorities for the next three years". — [MinistryWatch, Mar 30, 2026](https://ministrywatch.com/the-new-church-tech-divide-is-missional-not-digital/)
  - Caveat: one search summary cited "tools available in multiple languages (30%)", but I could not find that figure in the report text (the charts may be images). Treat it as unverified.
  - Caveat: half the sample came from Pushpay's own network, and Pushpay sells multilingual tools.
- **Earlier Pushpay data (unverified).** A Pushpay blog post reportedly said satisfaction with "current multi language tools" ranked "all the way down to eighteenth", while leaders were confident the features would be mission critical. A summary of the 2023 report said leaders rank multilingual support as highly important while satisfaction lags. I could not open the post (redirect loop). — [Pushpay blog (search excerpt)](https://pushpay.com/?p=10355); [Pushpay 2023 report release](https://finance.yahoo.com/news/pushpay-2023-state-technology-report-140000397.html?.tsrc=rss)
- **US language base.** In 2024, about 74.1 million people (23%) aged 5 and over spoke a language other than English at home. Spanish accounts for 44.9 million, Chinese 3.7 million and Tagalog 1.9 million. In California the share is about 1 in 2. These figures are ACS 2024 via USAFacts; the primary table is S1601. — [USAFacts](https://usafacts.org/answers/how-many-people-speak-a-language-other-than-english-at-home/country/united-states/)
- **Catholic.** 4,479 parishes, 28% of all US parishes, offer one or more Spanish-language Masses (USCCB survey). — [National Catholic Register/CNA, Aug 2024](https://www.ncregister.com/cna/survey-shows-28-of-u-s-dioceses-have-spanish-language-masses); [LA Catholics](https://lacatholics.org/2024/08/22/survey-shows-28-of-u-s-parishes-have-spanish-language-masses/)
- Pushpay, citing Pew: "roughly 43% of Latino Catholics primarily use Spanish." The cited Pew source is from 2012. — [Pushpay release](https://au.finance.yahoo.com/news/pushpay-parishstaq-illuminates-catholic-faith-130000187.html)
- **Pew (2014 report, 2013 data).**
  - 82% of Latino churchgoers say their place of worship offers Spanish-language services, down from 87% in 2006.
  - 86% of churchgoing Hispanic Catholics say their parish offers a Spanish Mass, down from 91% in 2007.
  - 57% of Hispanic evangelical churchgoers say the services they attended were in Spanish.
  - — [Pew, "The Ethnic Church"](https://www.pewresearch.org/religion/2014/05/07/chapter-5-the-ethnic-church/)
- **Lifeway, Hispanic Protestant churches** (692 pastors of congregations at least 50% Hispanic; published Jan 2023).
  - 53% hold services only in Spanish and 22% are bilingual.
  - 58% of congregants are first-generation immigrants, and two-thirds of churches are led by first-generation immigrant pastors.
  - 54% were founded since 2000.
  - — [ChurchLeaders on Lifeway Research](https://churchleaders.com/news/443383-u-s-hispanic-protestant-landscape-full-of-growing-vibrant-churches-lifeway.html)
- **Korean churches.** There were 4,454 Korean churches in the US as of January 2018, up from 4,233 in 2013; 1,375 are in California (Christian Today statistics). — [Korea Daily](https://en.koreadaily.com/?p=14613)
- **Hartford Institute, Faith Communities Today.**
  - Multiracial congregations (20% or more of participants outside the dominant group) rose from 12% in 2000 to 25% in 2020, linked with a higher share of immigrant participants. — [ChurchLeadership.com / FACT](https://www.churchleadership.com/leading-ideas/diverse-congregations-are-stronger-congregations/)
  - The 2010 wave put the figure at 13.7%. These congregations are "more likely to hold services both in English and other languages." — [Scott Thumma, HuffPost](https://www.huffingtonpost.com/scott-thumma-phd/racial-diversity-increasing-in-us-congregations_b_2944470.html)
  - A FACT Latino report notes that Latinos may speak "English, Spanish, Portuguese, or any host of Indigenous languages." — [EPIC FACT Latino Report](https://iliff-edu.s3.amazonaws.com/wp-content/uploads/2025/06/17144511/EPIC-FACT-Latino-Report_correct.pdf)
- **Ministry leader voices.**
  - Tim Hill, Executive Pastor, Bear Creek Baptist, whose Spanish ministry grew from about 60 people monthly in 2014 to 400+ weekly: "We knew we could do a lot better" and "the technology has been a huge value in helping build our ministry." — [Church Executive, Oct 2022](https://churchexecutive.com/archives/technology-helps-bear-creek-church-grow-its-multilingual-ministry)
  - A Diocese of Fort Wayne–South Bend admin guide sets the operational need: bishop's mailings go out in English and Spanish, routed by each parishioner's language field. — [Diocese FWSB](https://diocesefwsb.org/how-to-choose-the-spanish-language-in-parishsoft)
  - Vendor workarounds signal unmet need. Flocknote tells churches to recruit a bilingual volunteer or send messages in both languages. Breeze tells users to rely on Chrome's translate feature. — [Flocknote](https://help.flocknote.com/article/226-using-flocknote-in-spanish-speaking-communities); [Breeze (excerpt)](https://support.breezechms.com/hc/en-us/articles/360036848893-Can-I-change-the-language-to-Spanish)
  - Users ask on idea boards and in reviews: Rock's top idea is WhatsApp texting, and a ChMeetings Capterra reviewer cited "lack of support in Spanish." — [Rock Ideas](https://community.rockrms.com/ideas); [Capterra](https://www.capterra.com/p/184192/Chmeetings/reviews/?page=3)

### Inferences
- The addressable segment is large and growing. It includes Hispanic Protestant churches (75% use some Spanish), Catholic parishes with Spanish Masses, about 4,400 Korean churches, and the 25% of congregations that are multiracial. Many are led by first-generation immigrant pastors, often with small budgets: Hispanic Protestant average attendance is about 115 per Lifeway. This fits a small-church-friendly product.
- Pew shows Spanish-only worship declining across generations (60% to 39% of Latino Catholics saying "every service in Spanish", 2007 to 2013). This means **mixed-language households**, which strengthens the case for a per-person (not per-church) language setting.

### Gaps
- I found no survey that measures demand for *per-member translated communications* specifically. The available data measures "multilingual tools" generally.
- I found no recent (2024–2026) Pew or Lifeway count of non-English or bilingual congregations nationwide. FACT 2020 gives no percentage for congregations holding non-English services.
- The Korean church count is from 2018 and was compiled by a Korean-language Christian outlet. No Lifeway or Hartford count was found.
- I could not verify the Pushpay "18th in satisfaction" ranking or its year.
