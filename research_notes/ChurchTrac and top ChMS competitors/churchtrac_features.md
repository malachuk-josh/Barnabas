# ChurchTrac Complete Product Feature Suite (feature-checklist inventory, as of Nov 2026)

Source-dating note: ChurchTrac help-center articles (churchtrac.com/support/...) carry no visible publish dates; they were read on 2026-11-08 and are treated as current. Blog posts are dated individually below. The pricing and feature pages were also read on 2026-11-08. "Legacy plan" means a pre-current-pricing subscription. ChurchTrac repeatedly says some newer features are not available on legacy plans.

## Q1. What are all of ChurchTrac's modules, and what does each one actually do?

### Takeaway
ChurchTrac is a single web app with these modules: People & Families, Groups, Events & Registrations (calendar plus room/location conflict checks), Attendance, Check-In, Giving & Online Giving, Accounting & Budgets, Church Connect (website builder, member portal and member app), Worship & Scheduling, Messaging (email, plus SMS/voice/group chat through the Enhanced Messaging add-on), Automations, Projects & Tasks, File Storage, Dashboard and Settings/User Accounts. It covers most small-church needs fairly deeply. It is notably thin or absent on payroll, 1099s/invoicing, a dedicated pastoral-care module, equipment/resource booking with approvals, a giving kiosk, and any public API.

### Cited Findings

**Overall module map (help-center categories)**
- The help center has 11 categories: Getting Started & FAQs, People & Families, Groups, Events & Registrations, Attendance, Check-In, Giving & Online Giving, Accounting & Budgets, Church Connect, Worship & Scheduling, and Settings & Automations — [ChurchTrac Help Center](https://www.churchtrac.com/support)
- The features page lists these marketed modules: Database & Church Admin (directory, groups, attendance, free data migration), Church Accounting, Worship Planning & Scheduling, Church Giving/Online Giving, Church Website Builder, Church Email Builder, Church Texting, Church Connect App, Events & Registrations/Calendar, Child Check-In, Church Automations and Phone Tree — [ChurchTrac Features](https://www.churchtrac.com/features)

**1. People / membership database and profiles**
- First and last name are required, and every other field is optional. Named built-in fields include "Member Status" and "Age Category"; each is an editable pick-list via "Edit List" — [Getting Started With People](https://www.churchtrac.com/support/people/using-the-people-screen)
- Profile photos are JPG only, ideally under 150KB, and can be uploaded for an individual or a family by click or drag-and-drop — [Getting Started With People](https://www.churchtrac.com/support/people/using-the-people-screen)
- Admins choose which fields appear in the Add Name window at Settings > Admin Settings > "Add Name Settings" — [Getting Started With People](https://www.churchtrac.com/support/people/using-the-people-screen)
- People-screen actions: Add Names/Families, Automations, View Archived Names, Merge Names, Check All/Uncheck All, Add My Family QR code/setup, SMS to checked names, Bulk Edit checked names, and reports or messages for checked names — [Getting Started With People](https://www.churchtrac.com/support/people/using-the-people-screen)
- Search matches names, email addresses and phone numbers — [Getting Started With People](https://www.churchtrac.com/support/people/using-the-people-screen)
- Archiving hides a person but keeps their data for reports and contribution statements, and archived names don't count toward the name tier. Deletion is permanent — [Getting Started With People](https://www.churchtrac.com/support/people/using-the-people-screen); [Archiving Names](https://www.churchtrac.com/support/people/archiving-names)
- Bulk Edit changes many records at once. A "Managing Promotion Sunday" workflow promotes students in bulk using Groups plus Bulk Edit — [People & Families category](https://www.churchtrac.com/support/people)
- Profile tabs and fields referenced in other articles include a Giving tab with a "Family Statement" button, a Background Checks tab, "Formal Name" fields used by family labels, and a "Family Email Address" field used for family statements — [Contribution Statements](https://www.churchtrac.com/support/giving/contribution-statements); [Background Checks](https://www.churchtrac.com/support/settings/church-background-checks-training); [Using Reports](https://www.churchtrac.com/support/people/using-reports)

**2. Families / households**
- Each new individual automatically creates a Family record. Households are built with "Add Another Family Member" (head of household first) or "Use an Existing Family". A Family icon gives a quick snapshot and a Family section shows details. Family assignment can be changed for marriage, adoption or divorce — [Getting Started With People](https://www.churchtrac.com/support/people/using-the-people-screen)
- With "Add My Family", people use a QR code or URL to submit their household (members, address, UDFs, directory opt-in). Staff review every submission and add it as new or match it to an existing person; the system flags similar names. Nothing is added automatically, blank fields don't overwrite existing data, and skipping a submission deletes it. The QR code is also in the People screen's Actions menu. It is available on all paid plans, and older plans may need an upgrade — [Add My Family](https://www.churchtrac.com/support/connect/add-my-family)

**3. Custom fields (User-Defined Fields, UDFs)**
- There are 9 field types: Yes/No Option, Small Text Box (100 chars), Large Text Box (500 chars), Selection List (dropdown), PDF File (e.g., permission slips, background checks), Date Picker, Date (w/ year optional) for anniversaries, Checklist (multi-select) and Hyperlink. A field's type cannot be changed after creation — [User-Defined Fields](https://www.churchtrac.com/support/people/user-defined-fields)
- Each field is scoped to the Individual or the Family. Visibility can be "All ChurchTrac Users" or "Only Selected Users". "Show this field in Church Connect" lets members see and edit the field on their own profile. There is no fixed limit on the number of fields — [User-Defined Fields](https://www.churchtrac.com/support/people/user-defined-fields)
- Since Mar 2025 there is also an option to include or exclude a UDF when adding a new name — [User Permissions and More (03/05/2025)](https://www.churchtrac.com/blog/software-updates-user-permissions-and-more)

**4. Smart Lists (saved dynamic segments)**
- Smart Lists use "Match ALL" or "Match ANY" logic with "dozens of criteria". Any UDF can be a criterion, and another Smart List can be nested ("Equals"). Lists update automatically as people are added. Uses include messaging (combining lists without duplicates), restricting user access, finding missing data, and setting a per-user default People-screen list. Existing criteria can't be edited in place; they must be deleted and re-added — [Smart Lists](https://www.churchtrac.com/support/people/smart-lists)

**5. Groups / small groups**
- Groups are used to organize people, track service areas and record attendance — [Getting Started FAQs](https://www.churchtrac.com/support/getting_started/churchtrac-faqs)
- Groups replaced "Tags" on the People screen — [What Happened To Tags?](https://www.churchtrac.com/support/groups/what-happened-to-tags). DEPRECATION/HISTORY: in an earlier redesign "Tags replace the Groups Screen and SHAPE ministry profiles" — [Old ChurchTrac](https://www.churchtrac.com/support/questions/old-churchtrac); a 10/27/2022 post still promoted "Track Discipleship With Tags" — [Blog Features p.2](https://www.churchtrac.com/blog/features/page/2)
- In the member app, the Groups tab lets members view their groups and message other members; group leaders can create polls — [Using Church Connect](https://www.churchtrac.com/support/connect/sign-in)
- Group chat (Oct 2026) is enabled per group via "Enable Group Messages" in Connect App Settings. There is no limit on the number of groups. Admins can designate leaders, who can send polls and events. It requires the Enhanced Messaging add-on and at least 3 group members using Church Connect. It is positioned as a GroupMe replacement — [New Feature: Group Messaging (10/01/2026)](https://www.churchtrac.com/blog/new-feature-group-messaging); [Using Church Connect](https://www.churchtrac.com/support/connect/sign-in); [New Look & New Features (09/21/2026)](https://www.churchtrac.com/blog/announcements/new-look-new-features)
- The help center has a "Groups vs. User-Defined Fields" article and a "Using Groups for Attendance Tracking" article — [Groups category](https://www.churchtrac.com/support/groups)

**6. Attendance tracking**
- Attendance is entered by: Quick Entry (a single admin, by group, for a date); Live Mode (a self-check-in kiosk on computer, tablet or smartphone that shows the names in a selected group); Check-In (children, with labels); paper roll sheets; and the Church Connect leader tracker (a leader assigned to the event's group records attendance in the app). Leaders can also just record a tally instead of names — [Entering Attendance](https://www.churchtrac.com/support/attendance/entering-attendance); [Events Screen Overview](https://www.churchtrac.com/support/events/events-screen-overview)
- Members can self-record attendance with a Church Connect "Attendance" card. A per-profile switch, "Allow this Person to Enter Attendance", grants leader entry rights (the source dates from 2023 and uses Tags terminology) — [Lesser Known Features (01/31/2023)](https://www.churchtrac.com/blog/lesser-known-church-software-features)
- Attendance reports run by date range and Group(s)/Tags and output to PDF via print. The only named report is the Absentee Report — [Printing Attendance Reports](https://www.churchtrac.com/support/attendance/attendance-reports). The "Show Absentees on the People Screen" option lets staff select absentees and send an SMS from Actions — [Lesser Known Features (2023)](https://www.churchtrac.com/blog/lesser-known-church-software-features)
- The iPad check-in app has a "Count" button that adds guest numbers to totals — [Using the iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app)

**7. Child check-in (kiosk, labels, security)**
- Check-in runs on an iPad app (recommended for self check-in) or in a browser on a PC or Mac (recommended for staff stations and hard-wired printers). Windows uses Chrome Kiosk Mode for silent printing and Mac uses Firefox silent printing. Requirements: iOS 17+, Windows 10+ or macOS 11+. Recommended iPads are the 10th-gen iPad, Air 5th gen and Pro 4th gen+; the iPad Mini 7th gen is not recommended — [Getting Started with Check-In](https://www.churchtrac.com/support/check_in/using-check-in)
- Printers: most Brother QL label printers work, and the QL-810W and QL-820NWB are officially supported. The QL-820NWB connects via AirPrint, and the QL-810W uses a Wi-Fi driver (not Bluetooth) — [Using the iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app)
- App modes: Staff Check-In, Staff Check-Out, Self Check-In, Attendance and Check-In Overview. Staff search by the last 4 digits of a phone number or by name. Parents can show the family QR code from the Church Connect app. Self-stations use the front camera and staff stations the rear camera — [Using the iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app)
- Labels: check-in labels, security (pickup) labels and nametags, with family security codes printed on labels and an optional family pick-up label. The label type (Check-In or Nametag) and number of labels are set per Group, label size can be standard or custom, and the printer can be enabled per device — [Check-In Settings](https://www.churchtrac.com/support/check_in/checkin-settings); [Using the iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app)
- The features page adds extra tags for diaper bags and nametags for volunteers. It says a label printer is not required — [Church Check-In feature page](https://www.churchtrac.com/features/church-check-in)
- Allergies and notes: staff can add allergies, notes and an emergency contact number for texting parents. These print on labels and carry forward to future weeks. Parents can be texted with prebuilt or custom SMS — [Using the iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app); [Church Check-In feature page](https://www.churchtrac.com/features/church-check-in)
- New families can be added at a staff station ("Add a New Family": guardians first, then the child). Self Check-In mode blocks adding a family and refers the person to staff — [Using the iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app)
- Check-out records a timestamp and the person who performed it. A security setting can require the name of the pickup person. Self-stations can require a device PIN, and Guided Access is recommended — [Using the iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app)
- Kiosks can show a custom image or message before and after check-in (self-stations only). Kiosks are unlimited. Rooms are handled by assigning Groups to the check-in event, and attendance events cannot be deleted from the app — [Check-In Settings](https://www.churchtrac.com/support/check_in/checkin-settings); [Church Check-In feature page](https://www.churchtrac.com/features/church-check-in); [Using the iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app)
- The iPad Check-In app launched 10/17/2024 — [Announcements](https://www.churchtrac.com/blog/announcements/page/1)

**8. Giving and donations (contribution management)**
- Giving help articles cover: giving categories, importing contributions, anonymous cash, in-kind donations, contribution statements (US and Canada, with a Canadian Charity ID and signature), pledge campaigns, locking giving batches, creating deposits for Accounting, automatic online-giving deposits (matching Stripe payouts), Online Giving setup, fees and Apple Pay — [Giving category](https://www.churchtrac.com/support/giving)
- Contributions are entered in giving batches ("Add Contributions"), and batches can be locked — [Pledge Campaigns](https://www.churchtrac.com/support/giving/using-pledges); [Giving category](https://www.churchtrac.com/support/giving)
- Since Nov 2024, "Unknown donations" can be recorded on a batch date without a placeholder person — [November 2024 Updates](https://www.churchtrac.com/blog/november24-church-software-updates)
- "Church Donation Matching" for imports was added 11/21/2023, and a First-Time Donor automation trigger on 04/25/2024 — [Blog Features p.2](https://www.churchtrac.com/blog/features/page/2)
- Giving reports rebuilt in the new reporting engine (Nov 2024): Giving History, Giving Totals by Date, Category Overview, Category Detail by Date and Month-by-Month Category Analysis — [November 2024 Updates](https://www.churchtrac.com/blog/november24-church-software-updates)
- Pledges: a campaign is tied to a Giving Category with start and end dates. Staff enter pledges per individual (annual amount; not per family). Pledge amounts cannot be edited and must be deleted and re-added. A ledger shows received-to-date, remaining and campaign totals. There are pledge overview reports and per-donor pledge statements. No separate campaign-goal field or online donor pledge entry is documented — [Pledge Campaigns](https://www.churchtrac.com/support/giving/using-pledges)
- Contribution statements can be bulk-generated (one PDF) per family or individual, with a date range and minimum donation threshold. Optional sections are a detail list and a Pledge Campaign Summary. Statements can be emailed, with a delivered/bounced/no-address summary. Customization covers name/address offsets for window envelopes, header, footer (IRS wording), email body and logo. Only tax-deductible gifts appear, with a "no goods or services" statement. Donors can download a "Family Giving Statement" in the Connect app — [Contribution Statements](https://www.churchtrac.com/support/giving/contribution-statements)
- Multi-campus giving uses parent and sub giving categories per campus — [Multi Campus Churches](https://www.churchtrac.com/support/getting_started/multi-campus-churches)

**9. Online giving (recurring, text-to-give, kiosk)**
- Stripe is the processor. Methods: card, ACH and text-to-give, plus Apple Pay enabled through Stripe. Stripe's standard fees are 2.9% + $0.30 for cards and a flat $0.25 for ACH, with nonprofit rates available. ChurchTrac adds no platform fee — [Online Giving FAQs](https://www.churchtrac.com/support/giving/online-giving-faqs); [Giving category](https://www.churchtrac.com/support/giving)
- Recurring gifts require a signed-in donor and cannot be edited; the donor must cancel and recreate. Signed-in donors get recurring giving, ACH, text giving and giving history. Guest gifts are auto-matched to People records when possible, and guests cannot use ACH — [Online Giving FAQs](https://www.churchtrac.com/support/giving/online-giving-faqs)
- Donors can cover the fee, card only — [Using Church Connect](https://www.churchtrac.com/support/connect/sign-in)
- Text-to-give works through the web version of Church Connect, not in the app — [Online Giving FAQs](https://www.churchtrac.com/support/giving/online-giving-faqs). The pricing page lists "text giving" as part of the paid Enhanced Messaging add-on — [Pricing](https://www.churchtrac.com/pricing). CONFLICT: the features page presents text giving as part of Giving — [Features](https://www.churchtrac.com/features)
- Access points: a unique giving URL, QR code, the Church Connect app (including giving from within media), and an embeddable giving form for external websites (02/24/2025) — [Online Giving FAQs](https://www.churchtrac.com/support/giving/online-giving-faqs); [Embed Forms and Giving](https://www.churchtrac.com/blog/embed-forms-and-giving)
- Each online gift creates a Giving-screen entry automatically. Accounting is not updated automatically: deposits are created from Giving, or Stripe payouts are matched through "Automatic Online Giving Deposits" — [Online Giving FAQs](https://www.churchtrac.com/support/giving/online-giving-faqs); [Giving category](https://www.churchtrac.com/support/giving)
- Giving kiosk: no ChurchTrac giving-kiosk feature was found. "Kiosk" in ChurchTrac docs refers only to check-in and attendance (Live Mode) — [site search results](https://www.churchtrac.com/blog/lesser-known-church-software-features)

**10. Fund accounting / church accounting**
- Concepts: Accounts (bank, credit card, loan), Categories (income/expense for reporting) and Funds (designated balances). The General Fund can't be deleted, and other funds can be made inactive — [Accounting FAQs](https://www.churchtrac.com/support/accounting/accounting-faqs)
- Unlimited designated and restricted funds across multiple bank accounts, plus unlimited budgets (church-wide or per ministry) — [Features](https://www.churchtrac.com/features)
- Register transaction types: Expense/Charge, Deposit/Credit, Account Transfer and Fund Transfer. Reference codes: Next Check #, DEP, TRX, ATM, PMT, JE (journal entry) and ACH. Transactions support splits across categories and funds ("Add Line"), Note, Memo (prints on checks), Tags and file attachments (receipts). Payees can be saved (memorized). Keyboard shortcuts are available — [Using the Register](https://www.churchtrac.com/support/accounting/using-the-register-and-entering-transactions); [Saved Payees](https://www.churchtrac.com/support/accounting/payees)
- Check printing supports Standard 3-per-page checks, adjustable field placement and PDF output, and checks can be voided — [Using the Register](https://www.churchtrac.com/support/accounting/using-the-register-and-entering-transactions)
- Liability accounts (e.g., credit cards) and mortgage tracking are supported — [Accounting category](https://www.churchtrac.com/support/accounting). "Untracked Accounts" (Dec 2025) record fixed assets and liabilities such as mortgage principal, HVAC, pews and iPads. The post says this avoids QuickBooks-style double-entry — [Accounting Enhancements 2025 (12/02/2025)](https://www.churchtrac.com/blog/church-accounting-enhancements-2025)
- Fund-to-fund and account-to-account transfers were redesigned with safeguards and an income statement/balance sheet preview — [Accounting Enhancements 2025](https://www.churchtrac.com/blog/church-accounting-enhancements-2025)
- Bank Link uses Stripe Financial Connections (US only). Syncing is manual ("Sync New Transactions") and reaches back 180 days. It supports checking, savings, credit card, loan and money market accounts. Imports sort into Needs attention / Ready to add / All, with Import Rules auto-fill and duplicate flagging. Bank Link is included at no cost, though older plans may lack the button. It launched 12/06/2023 — [Bank Link](https://www.churchtrac.com/support/accounting/bank-sync); [Blog Features p.2](https://www.churchtrac.com/blog/features/page/2)
- File imports accept PDF statements and OFX, QFX, QIF and QBO files. CSV is not supported, and PDF import requires the current plan — [Accounting FAQs](https://www.churchtrac.com/support/accounting/accounting-faqs)
- Reconciliation can be manual or automatic (Auto Reconcile per account, off by default). Since Oct 2026, auto-reconciliation runs against uploaded PDF statements, alerts on missed statements, and generates reconciliation reports — [Fall Accounting Updates (10/29/2026)](https://www.churchtrac.com/blog/fall-accounting-updates-26)
- Budgets can be per ministry or church-wide. Since Mar 2025 a category can be set to monthly so each month is budgeted individually (e.g., VBS) — [User Permissions and More (03/05/2025)](https://www.churchtrac.com/blog/software-updates-user-permissions-and-more)
- Accounting reports: Balance Sheet (by fund columns), Income Statement (there is no separately named "P&L"), Fund Sheet, Fund Statement, Category and Fund reports, Register and Payee reports, Custom Search reports, and Budget vs. Actual with projection from historical trends. Budget reports include a simple yearly budget, monthly budget analysis and budget comparison. Reports support quick date ranges, CSV export, browser print and display options — [Accounting Reports](https://www.churchtrac.com/support/accounting/accounting-reports)
- Accounting Search (Feb 2026) adds saved searches, Group By (Category, Fund, Account or Payee, e.g., for spotting 1099 vendors), a quick date picker, and scheduled automatic report delivery — [Revamped Accounting Search (02/26/2026)](https://www.churchtrac.com/blog/church-software-update-revamped-accounting-search-with-reports-feb-26)
- Not supported: payroll ("ChurchTrac isn't a payroll platform"; only final payroll figures are entered), 1099s, invoices, automated depreciation, and QuickBooks file migration ("proprietary file format") — [Using the Register](https://www.churchtrac.com/support/accounting/using-the-register-and-entering-transactions); [Accounting FAQs](https://www.churchtrac.com/support/accounting/accounting-faqs)
- Multi-campus: categories and funds can't be separated by campus within one account. Separate accounts are needed for per-campus financials — [Multi Campus Churches](https://www.churchtrac.com/support/getting_started/multi-campus-churches)

**11. Events and calendar**
- Multiple color-coded calendars per ministry, with view and edit privileges per calendar and Google Calendar sync (direction not specified). Events can be recurring or cloned. A public calendar can be embedded on a website or in Connect. Published events export to ICS, and a live iCal feed is available. Printed calendar reports are one month at a time — [Events Screen Overview](https://www.churchtrac.com/support/events/events-screen-overview); [Events category](https://www.churchtrac.com/support/events)
- Since Mar 2025, each calendar can be enabled or disabled for attendance events and for published events, and the per-calendar "who can edit" option was removed — [User Permissions and More](https://www.churchtrac.com/blog/software-updates-user-permissions-and-more)
- Members can export all events to their device calendar from the app — [Using Church Connect](https://www.churchtrac.com/support/connect/sign-in)

**12. Facility / room / resource booking**
- A Locations list (rooms and facilities) can be assigned to events. ChurchTrac prompts when overlapping events use the same location. "Location Views" shows a date/time × location grid. No equipment/resource booking or approval workflow is documented — [Events Screen Overview](https://www.churchtrac.com/support/events/events-screen-overview)

**13. Forms and online registration**
- Registrations attach to a calendar event, and enabling them disables recurrence (the event can be cloned instead). Who can register is either "Anyone" (name and email) or "Connect Users" (logged in). Methods are Individual, Headcount or Multiple Attendees. Multiple attendee types can each have a cost. Form questions can be custom, imported from a previous event, or pre-built — [Registrations Overview](https://www.churchtrac.com/support/events/registrations-overview)
- The registration Actions menu includes: Manage Setup, View Event URL and QR Code, Add Names, Send Email to Registrants, Print/Export Registration Report, Show names on People Screen, and Show Unfinished Registrations. Registrants are matched or added to the database — [Registrations Overview](https://www.churchtrac.com/support/events/registrations-overview)
- Event payments can be full, partial or donation, with "no convenience charges" — [Features](https://www.churchtrac.com/features). Capacity limits, waitlists, discount codes and deadlines are not documented — [Registrations Overview](https://www.churchtrac.com/support/events/registrations-overview)
- General forms are Connect "Form" cards (guest info, prayer requests, spiritual decisions). A ChurchTrac user can be set to get an email per submission, and responses can be viewed in Connect settings. Forms can be embedded on external sites — [Connect Cards](https://www.churchtrac.com/support/connect/creating-connect-page-cards); [Church Connect FAQs](https://www.churchtrac.com/support/connect/church_connect_faqs); [Embed Forms and Giving](https://www.churchtrac.com/blog/embed-forms-and-giving)

**14. Volunteer scheduling**
- Scheduling works through Worship & Scheduling "Teams and Roles" for any ministry. On a service's Team Schedule tab, staff add people or roles and add slots per role. "Allow Signups" lets volunteers claim open slots from their Connect account. Invites ("Send Volunteer Invites") go out immediately or on a schedule. Staff can re-invite an individual and set each volunteer's preferred invite method. "Email Teams" sends a custom email. Service and rehearsal reminders can go out up to 3 days before, with fixed, non-editable text — [Scheduling Volunteers](https://www.churchtrac.com/support/worship/scheduling-roles); [Worship & Scheduling Updates (04/08/2026)](https://www.churchtrac.com/blog/worship-updates-2026)
- Volunteers set blockout dates via Connect, under Events > "Update Availability" — [Using Church Connect](https://www.churchtrac.com/support/connect/sign-in). The marketing page mentions text or email reminders — [Features](https://www.churchtrac.com/features)
- Whole teams can be added to rehearsals (Apr 2026). "Scheduling-Only Events" hide outline and rehearsal sections for non-service events (May 2026). Staff can email volunteers for a specific event by team or status (Nov 2024) — [Worship Updates 2026](https://www.churchtrac.com/blog/worship-updates-2026); [PraiseCharts post (05/29/2026)](https://www.churchtrac.com/blog/praise-charts-integration-and-worship-enhancements); [November 2024 Updates](https://www.churchtrac.com/blog/november24-church-software-updates)
- Nursery worker scheduling is marketed with check-in — [Church Check-In feature page](https://www.churchtrac.com/features/church-check-in). Auto-scheduling and conflict detection are not documented — [Scheduling Volunteers](https://www.churchtrac.com/support/worship/scheduling-roles)

**15. Worship / service planning**
- Help articles: Worship App, Planning Setup, Teams and Roles, Adding & Editing Songs, Worship Outlines, Cloning Services, Scheduling, Song Library (files, collections), Lyrics and Chords (built-in chord transposer), Side-By-Side (view and edit multiple services), SongSelect (CCLI) and PraiseCharts — [Worship category](https://www.churchtrac.com/support/worship)
- Apr 2026: an "Actions" button, custom colors for Service Elements, links and files attached to services, templates moved under Favorites (clone a favorite), keys assigned to uploaded charts and audio, audio transposition, and faster Side-By-Side with invites sent from it — [Worship & Scheduling Updates (04/08/2026)](https://www.churchtrac.com/blog/worship-updates-2026)
- May 2026: PraiseCharts search and import (including purchased content), a list-view song library with album art, PDF creation from Lyric/Chords/ChordPro reports, and clock-time display in outlines — [PraiseCharts Integration (05/29/2026)](https://www.churchtrac.com/blog/praise-charts-integration-and-worship-enhancements)
- A "Hide Worship Planning" setting is available for scheduling-only services — [Scheduling Volunteers](https://www.churchtrac.com/support/worship/scheduling-roles)

**16. Communication**
- Basic, included in all plans: ChurchTrac Mail (bulk email with a keyword setup), the Email Builder, linking a third-party email account, Mailchimp export (choose a list, then "Export to Mailchimp"), printed form letters, and push notifications (current plans only) — [Messaging Your Church](https://www.churchtrac.com/support/people/messaging)
- The Email Builder (released Jul 2025) offers heading, paragraph, image, button, link, divider and spacer blocks, plus columns and section colors. Templates can be saved as custom. Images come from file storage or Igniter Media, and a logo can be set as default — [Email Builder](https://www.churchtrac.com/support/people/email-builder); [Big Summer Drop (07/23/2025)](https://www.churchtrac.com/blog/the-big-summer-drop-updates-and-new-features). The marketing page claims segments, merge tags and a "99.6% deliverability rate" — [Features](https://www.churchtrac.com/features). Open/click analytics are not documented — [Email Builder](https://www.churchtrac.com/support/people/email-builder)
- Enhanced Messaging (paid add-on, launched 02/10/2026) includes a dedicated toll-free number (verification takes ~2–4 business days), two-way SMS, voice messages and keyword auto-replies. It works internationally beyond the US and Canada by contacting support — [New Feature: Enhanced Messaging](https://www.churchtrac.com/blog/new-feature-enhanced-messaging)
- The texting page describes a shared SMS inbox (inbound accepted only as replies), scheduled sends, segment targeting, and keyword examples ("New", "VBS", "Pray") — [Church Texting](https://www.churchtrac.com/features/church-texting)
- Voice and phone tree: voice messages can be uploaded, recorded in the browser, created by text-to-speech or recorded by calling in. Legacy plans can only call in to record. Voice is outbound only, can be scheduled, and is segmented by people, groups or lists — [Messaging Your Church](https://www.churchtrac.com/support/people/messaging); [Phone Tree](https://www.churchtrac.com/features/church-phone-tree). In-app recording and text-to-speech were announced 09/21/2026 — [New Look & New Features](https://www.churchtrac.com/blog/announcements/new-look-new-features)
- Push notifications go to Connect app users who are logged in, with logins lasting 30 days. They are sent from the Messaging screen — [Messaging Your Church](https://www.churchtrac.com/support/people/messaging); [Big Summer Drop](https://www.churchtrac.com/blog/the-big-summer-drop-updates-and-new-features)

**17. Website builder, member portal and online directory (Church Connect)**
- Church Connect is the member-facing side of ChurchTrac. It can be the church's full website or a portal alongside an existing site. Anyone can view it and register, and registrants whose email doesn't match a person record need approval. Custom domains are supported. It is included in all paid plans — [Church Connect FAQs](https://www.churchtrac.com/support/connect/church_connect_faqs)
- Card types: Page, Link, Form, Registration, Giving, Family, Attendance, Verse, Quote, Gallery, Video and Info (expandable). Visibility options: Web & App / Web Only / App Only; Always (optionally hidden after a date) / logged-in only / logged-out only / Hidden; and "Visible to Groups" — [Connect Cards](https://www.churchtrac.com/support/connect/creating-connect-page-cards)
- Cards can go on secondary pages, and group-targeted visibility was added Nov 2025 — [Software Updates: Church Connect (11/05/2025)](https://www.churchtrac.com/blog/software-updates-church-connect)
- Jul 2026: website templates, multiple Connect sites per account (build or test a site while another is live), a Connect Dashboard (30-day views, daily page views, app installs, top pages), hero video backgrounds, and a "Connect Setup" tab — [Church Connect Updates 2026 (07/10/2026)](https://www.churchtrac.com/blog/church-connect-updates)
- Marketing claims: responsive design, unlimited pages, free hosting and built-in SEO. Igniter Media stock images and Canva templates are available — [Features](https://www.churchtrac.com/features); [Church Connect FAQs](https://www.churchtrac.com/support/connect/church_connect_faqs)
- The member portal and directory let members edit their profile, view giving history and statements, and opt into the online directory ("Include my family" plus per-field sharing controls). Admins choose what directory data is shown. A print directory is also available — [Using Church Connect](https://www.churchtrac.com/support/connect/sign-in); [Church Connect FAQs](https://www.churchtrac.com/support/connect/church_connect_faqs); [People category](https://www.churchtrac.com/support/people)

**18. Pastoral care, follow-up and workflows**
- Notes use customizable "Note Types" (e.g., pastoral visits, counseling, volunteer follow-ups). Access is set per user — [Getting Started With People](https://www.churchtrac.com/support/people/using-the-people-screen); [User Accounts](https://www.churchtrac.com/support/settings/user-accounts)
- A "My Reminders" Home tab collects reminders set from notes or events — [Lesser Known Features (2023)](https://www.churchtrac.com/blog/lesser-known-church-software-features)
- Automations (launched 11/30/2022) run one or more actions on a schedule or trigger. People Automations target a Smart List or Group and can send email or SMS, add or remove a Group, add a note or create a task. Application Automations create accounting transactions or email reports. Task Automations run when a task is completed. They can be built from scratch, from templates (birthday message, new-name notification, emailed reports) or with a guided builder, and can be paused. All actions run simultaneously — [Using Automations](https://www.churchtrac.com/support/settings/automations); [Blog Features p.2](https://www.churchtrac.com/blog/features/page/2)
- The marketing page lists guest follow-up sequences and birthday/anniversary workflows — [Features](https://www.churchtrac.com/features)
- Projects & Tasks: unlimited projects with per-user permissions. Tasks have a due date, priority, assignee, subtasks, notes and comments — [Projects and Tasks](https://www.churchtrac.com/support/settings/projects-and-tasks)
- No dedicated care/prayer-request management module was found. Prayer requests come in through Form cards and SMS keywords — [Connect Cards](https://www.churchtrac.com/support/connect/creating-connect-page-cards); [Church Texting](https://www.churchtrac.com/features/church-texting)

**19. Reporting and dashboards**
- People reports: member directory, birthday, individual list, custom reports (chosen fields, filters and sorting), mailing labels (Avery 5160/8160, sort by name or zip, "Or Current Resident") and family labels. Reports are PDF, and many can export to CSV — [Using Reports](https://www.churchtrac.com/support/people/using-reports); [Getting Started With People](https://www.churchtrac.com/support/people/using-the-people-screen)
- A new reporting engine began rolling out Nov 2024. By Mar 2025 every report section used it, and some reports have charts — [November 2024 Updates](https://www.churchtrac.com/blog/november24-church-software-updates); [User Permissions and More](https://www.churchtrac.com/blog/software-updates-user-permissions-and-more)
- Dashboard cards (people count, giving last week and this week, worship attendance, "& more") are chosen by an admin. Users reorder cards, and each user sees only what their permissions allow — [Dashboard Setup](https://www.churchtrac.com/support/settings/dashboard-setup). The UI was refreshed 09/21/2026 — [New Look & New Features](https://www.churchtrac.com/blog/announcements/new-look-new-features)

**20. User roles and permissions**
- Users are Administrator or Standard. Users are unlimited, with a soft limit of 10 that support raises for free. Privileges are grouped as General/Connect (Projects), People/Families (Note Types and UDFs), Events/Worship (Calendars) and Giving/Accounting. A user can be restricted to specific Smart Lists. Each user has an audit trail (logins with IP, records added, edited or deleted) and a Trusted Browsers list — [User Accounts](https://www.churchtrac.com/support/settings/user-accounts)
- DEPRECATED (Mar 2025): the old named levels "pastor" and "leader" were replaced by per-user grants — [User Permissions and More](https://www.churchtrac.com/blog/software-updates-user-permissions-and-more)

**21. Data import/export, file storage and other utilities**
- Free people-data migration from a spreadsheet, plus self-import of names and contributions — [Features](https://www.churchtrac.com/features); [Getting Started](https://www.churchtrac.com/support/getting_started)
- Exports: CSV from reports, Mailchimp export and ICS/iCal — [Using Reports](https://www.churchtrac.com/support/people/using-reports); [Messaging](https://www.churchtrac.com/support/people/messaging); [Events Overview](https://www.churchtrac.com/support/events/events-screen-overview)
- File Storage is a cloud drive for church files, accessed through auto-expiring signed URLs — [Settings category](https://www.churchtrac.com/support/settings); [Security](https://www.churchtrac.com/support/getting_started/churchtrac-security-policies-and-practices)
- The interface is officially in English and Spanish — [Getting Started FAQs](https://www.churchtrac.com/support/getting_started/churchtrac-faqs)

**22. Security**
- ChurchTrac runs on AWS with replicated layers and a separate database per account. It uses TLS, salted password hashes, and backups hourly, daily, weekly and monthly (stored offsite). It has login rate limiting, firewalls and 24/7 monitoring. It claims "Level 1 PCI Compliant" requirements are met, and card data is handled by Stripe. No SOC report is mentioned. The "99.9999% uptime" figure is a marketing claim — [Security Policies](https://www.churchtrac.com/support/getting_started/churchtrac-security-policies-and-practices)
- 2FA (by email or SMS code) has been mandatory for all users since May 5, 2025. It cannot be disabled, and "remember this device" lasts 30 days — [2FA (02/10/2025)](https://www.churchtrac.com/blog/secure-your-churchtrac-accout-with-2fa)

### Inferences
- Accounting is single-entry/register-style. The "Untracked Accounts" post contrasts it explicitly with QuickBooks double-entry, and there is no general ledger journal UI beyond "JE" reference codes. A competitor targeting treasurers who need GAAP double-entry, 990 prep, payroll or 1099s would find whitespace here.
- No 990-specific report was found anywhere. The Income Statement and Balance Sheet (by fund) are the core financial statements.
- Facility booking is "lite": room conflict warnings and a grid view, with no approvals, resources/equipment, or public room-request forms.
- Pastoral care is assembled from Note Types, reminders, tasks and automations rather than offered as a dedicated care-pipeline module.
- Volunteer scheduling lives inside the Worship module ("Teams and Roles" for any ministry).

### Gaps
- No full list of Smart List criteria, built-in person fields (e.g., dates, marital status), or label layouts/fields; the help articles say "dozens of criteria" without listing them.
- No documentation found on registration capacity, waitlists, discount codes, deadlines or confirmation emails.
- No email open/click analytics documentation found.
- Whether Google Calendar sync is one-way or two-way is not stated.
- No specific auto-trigger list for automations beyond new name, birthday, first-time donor and task completed.

## Q2. Which features are in which plan/tier, and which are paid add-ons?

### Takeaway
ChurchTrac has one feature set for all current plans. Tiers differ only by the number of "names" (people records). The main paid add-on is Enhanced Messaging ($7/mo), which unlocks SMS, voice, group chat and text giving. One-time setup services are optional. Legacy (older-pricing) subscribers miss several 2025–2026 features.

### Cited Findings
- Tiers by name count: 75 names $29/mo, 125 names $39/mo, 250 names $59/mo, 500 names $79/mo, 1000 names $99/mo, "UNL" names $119/mo. Annual billing saves 10% — [Pricing](https://www.churchtrac.com/pricing)
- Every tier includes: People, Fund Accounting, Giving, Website & app, Check-in, Worship, Groups & events, Volunteers, "Basic Messaging", Registrations, Automations and Human support — [Pricing](https://www.churchtrac.com/pricing)
- "Names" count every individual (adults, children, members, donors), and archived names don't count — [Pricing](https://www.churchtrac.com/pricing)
- Enhanced Messaging costs $7/mo: two-way texting, group messaging, voice messages, text giving, a dedicated number, and 250 credits per month. Extra 250-credit blocks cost $7 — [Pricing](https://www.churchtrac.com/pricing)
- Credit mechanics: 1 SMS recipient uses 1 credit and 1 voice recipient uses 2 credits. Extra credits roll over for up to 120 days — [Enhanced Messaging (02/10/2026)](https://www.churchtrac.com/blog/new-feature-enhanced-messaging). The Phone Tree page describes $7 for 125 voice messages (consistent with 250 credits at 2 each) — [Phone Tree](https://www.churchtrac.com/features/church-phone-tree)
- CONFLICT: the texting FAQ says there is "no sending limit… charged on usage", while the same page describes a 250-message allotment — [Church Texting](https://www.churchtrac.com/features/church-texting)
- One-time services: Website & App Build from $477, and Accounting Setup (CLASS) from $399 — [Pricing](https://www.churchtrac.com/pricing)
- Third-party costs: Stripe processing fees, and MinistrySafe checks and training billed directly — [Pricing](https://www.churchtrac.com/pricing); [Background Checks](https://www.churchtrac.com/support/settings/church-background-checks-training)
- Users are unlimited (soft limit of 10 to start) — [User Accounts](https://www.churchtrac.com/support/settings/user-accounts)
- During the free trial, voice/text messaging and Online Giving are limited — [Getting Started FAQs](https://www.churchtrac.com/support/getting_started/churchtrac-faqs)
- Legacy plans lack or limit: push notifications, voice recording other than call-in, PDF bank-statement import, auto-reconciliation (PDF-based), possibly Bank Link ("Link Accounts" button), and possibly Add My Family — [Messaging](https://www.churchtrac.com/support/people/messaging); [Fall Accounting Updates](https://www.churchtrac.com/blog/fall-accounting-updates-26); [Bank Link](https://www.churchtrac.com/support/accounting/bank-sync); [Add My Family](https://www.churchtrac.com/support/connect/add-my-family)
- DATED or legacy tier name: the Automations doc labels recurring accounting transactions a "Plus Plan feature". The current pricing page has no Plus plan — [Using Automations](https://www.churchtrac.com/support/settings/automations); [Pricing](https://www.churchtrac.com/pricing)

### Inferences
- "Plus Plan" is likely a leftover from an older tiered model. Feature-gating now runs along two lines: current versus legacy pricing, and Enhanced Messaging on or off.

### Gaps
- Legacy plan names, prices and feature matrices aren't published.
- Whether Enhanced Messaging's price scales with tier isn't stated.

## Q3. What do ChurchTrac's mobile apps do (staff vs. member), and what is web-only?

### Takeaway
There are three native apps: Church Connect (member app, iOS and Android), ChurchTrac Check-In (iPad only) and ChurchTrac Worship (iOS and Android, for musicians). No native staff/admin app was found. Administration (people, giving entry, accounting, reports, settings, messaging, website building and service planning) happens in the web browser.

### Cited Findings
- The Church Connect member app has these tabs: Home (cards), Give (one-time and recurring gifts, history, statements), Events (register, export to calendar, leader attendance, parent check-in QR, "Update Availability"), Groups (chat, leader polls) and Media (sermons and podcasts, bookmarks). The profile menu covers profile editing, push settings, the online directory, widgets, and sharing the church by link or QR — [Using Church Connect](https://www.churchtrac.com/support/connect/sign-in)
- The native app launched 07/23/2025 with push notifications, home-screen widgets and a media library — [Big Summer Drop](https://www.churchtrac.com/blog/the-big-summer-drop-updates-and-new-features)
- App Store listing: "ChurchTrac Connect App" by ChurchTrac Software, free, 4.7★ from 320 ratings, version 3.03.00 (early Nov 2026), iOS 16+ — [Apple App Store](https://apps.apple.com/us/app/-/id6737914083)
- Members can download through the church's QR code or link, or search "Church Connect" and enter the church's install code — [Using Church Connect](https://www.churchtrac.com/support/connect/sign-in)
- DATED/CONFLICT: one older help page on a church subdomain calls Church Connect a "web app" that "will not show up in an app store" — [install article (church subdomain)](https://curtisbaptisbc.churchtrac.com/support/connect/install-church-connect-app)
- The ChurchTrac Check-In app is iPad only (iOS 17+) and offers staff and self check-in, check-out, attendance, printing via AirPrint or Wi-Fi Brother printers, and a PIN — [Using the iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app)
- ChurchTrac Worship (04/10/2026) runs on iOS and Android, with tablets preferred. It shows chord charts, lead sheets and PDFs, works offline once an outline is loaded, and supports stylus/finger annotations, cropping, audio playback and sharing. It is free with a subscription — [Released: Worship App](https://www.churchtrac.com/blog/announcements/churchtrac-worship-app)
- Live Mode attendance kiosks run in a browser on computers, tablets and smartphones — [Entering Attendance](https://www.churchtrac.com/support/attendance/entering-attendance)
- Supported admin browsers: Chrome and Safari; IE and Edge are not supported — [Getting Started FAQs](https://www.churchtrac.com/support/getting_started/churchtrac-faqs)
- Text-to-give is web Connect only, not in-app — [Online Giving FAQs](https://www.churchtrac.com/support/giving/online-giving-faqs)
- A Capterra reviewer wished for a genuine phone app because access felt like a web browser (one user's opinion, undated) — surfaced via [search summary of Capterra](https://www.capterra.com/p/125787/ChurchTrac/reviews/?page=2)

### Inferences
- Church Connect appears to be one shared container app that a church joins with an install code or QR, not a separately branded App Store listing per church. The marketing line "native apps… published from one build" is ambiguous on this point.
- A native staff app with pastoral notes, quick person lookup and on-the-go giving approvals is a clear gap versus competitors.

### Gaps
- The Google Play listing details for Connect and Worship were not verified.
- No info was found on any offline mode for check-in.

## Q4. What integrations exist, and is there a public API?

### Takeaway
The API is closed. Integrations are a small, curated set built in by ChurchTrac. There is no Zapier, QuickBooks sync, Planning Center sync or webhook platform.

### Cited Findings
- "API: Closed." The FAQ points instead to integrations with MinistrySafe, Stripe and SongSelect — [Getting Started FAQs](https://www.churchtrac.com/support/getting_started/churchtrac-faqs)
- Stripe handles online giving, Apple Pay, nonprofit pricing and payout matching, plus Bank Link through Stripe Financial Connections — [Online Giving FAQs](https://www.churchtrac.com/support/giving/online-giving-faqs); [Bank Link](https://www.churchtrac.com/support/accounting/bank-sync)
- MinistrySafe is the only background-check provider. Setup uses an API key and a webhook. Checks are ordered from the person's Background Checks tab, and the completion date posts to a UDF date field — [Background Checks](https://www.churchtrac.com/support/settings/church-background-checks-training)
- Worship integrations: SongSelect (CCLI) and PraiseCharts (May 2026) — [Worship category](https://www.churchtrac.com/support/worship); [PraiseCharts post](https://www.churchtrac.com/blog/praise-charts-integration-and-worship-enhancements)
- Mailchimp is export-only. A third-party email account can be linked — [Messaging](https://www.churchtrac.com/support/people/messaging)
- Calendar: Google Calendar sync, ICS export and a live iCal feed — [Events Overview](https://www.churchtrac.com/support/events/events-screen-overview)
- Content: Igniter Media (stock images) and Canva templates — [Church Connect FAQs](https://www.churchtrac.com/support/connect/church_connect_faqs)
- QuickBooks: no migration (proprietary format), but a "Switching from QuickBooks" guide exists — [Accounting FAQs](https://www.churchtrac.com/support/accounting/accounting-faqs); [Accounting category](https://www.churchtrac.com/support/accounting)
- Song libraries from OnSong or Planning Center can be imported by support, not self-serve — [Worship App](https://www.churchtrac.com/blog/announcements/churchtrac-worship-app)
- Giving and forms can be embedded on any HTML-capable site — [Embed Forms and Giving](https://www.churchtrac.com/blog/embed-forms-and-giving)

### Inferences
- The closed ecosystem is deliberate, consistent with an "all-in-one, no add-ons" positioning. Churches needing Zapier, Planning Center or QuickBooks interoperability are under-served.

### Gaps
- No evidence found of Zapier, Planning Center sync, Google Workspace SSO, Twilio, or payment processors other than Stripe. Their absence was inferred from documentation silence and the "closed API" statement.

## Q5. What did ChurchTrac launch or announce in 2024–2026, and are there AI features?

### Takeaway
2025–2026 was a heavy release period: the native member app, push notifications, Email Builder, mandatory 2FA, Enhanced Messaging (SMS and voice), group chat, the Worship app with PraiseCharts, Connect templates with multi-site and analytics, a UI refresh, and an accounting overhaul (saved searches, PDF statement import, auto-reconciliation). The only explicit AI is AI parsing of PDF bank statements (Oct 2026). No generative AI assistant was found.

### Cited Findings
- 2024: Church Connect core redesign; custom church domain setup; the iPad Check-In app (10/17/2024); website-build and CLASS accounting services; Unknown Donations; the First-Time Donor automation trigger (04/25/2024); a redesigned reporting engine (11/26/2024); and emailing worship/scheduling teams — [2024 Recap](https://www.churchtrac.com/blog/churchtrac-2024-recap); [Announcements](https://www.churchtrac.com/blog/announcements/page/1); [Nov 2024 Updates](https://www.churchtrac.com/blog/november24-church-software-updates)
- 02/10/2025: 2FA, required from May 5, 2025 — [2FA post](https://www.churchtrac.com/blog/secure-your-churchtrac-accout-with-2fa)
- 02/24/2025: embeddable giving and forms — [Embed Forms](https://www.churchtrac.com/blog/embed-forms-and-giving)
- 03/05/2025: per-user permissions overhaul, Note Types, calendar options, UDF Connect visibility and monthly budgets — [User Permissions](https://www.churchtrac.com/blog/software-updates-user-permissions-and-more)
- 07/23/2025: native Church Connect app, push notifications, Email Builder — [Big Summer Drop](https://www.churchtrac.com/blog/the-big-summer-drop-updates-and-new-features)
- 11/05/2025: cards on secondary pages and group-visible cards — [Connect Updates](https://www.churchtrac.com/blog/software-updates-church-connect)
- 12/02/2025: fund and account transfer redesign, Untracked Accounts — [Accounting 2025](https://www.churchtrac.com/blog/church-accounting-enhancements-2025)
- 02/10/2026: Enhanced Messaging — [Enhanced Messaging](https://www.churchtrac.com/blog/new-feature-enhanced-messaging)
- 02/26/2026: Accounting Search with saved searches, group-by and scheduled reports — [Accounting Search](https://www.churchtrac.com/blog/church-software-update-revamped-accounting-search-with-reports-feb-26)
- 04/08/2026: worship and scheduling updates (signups, rehearsal reminders, audio transposition) — [Worship Updates](https://www.churchtrac.com/blog/worship-updates-2026)
- 04/10/2026: ChurchTrac Worship app — [Worship App](https://www.churchtrac.com/blog/announcements/churchtrac-worship-app)
- 05/29/2026: PraiseCharts, song library redesign, clock times, scheduling-only events — [PraiseCharts](https://www.churchtrac.com/blog/praise-charts-integration-and-worship-enhancements)
- 07/10/2026: Connect templates, multiple sites, Connect Dashboard and hero video — [Connect Updates 2026](https://www.churchtrac.com/blog/church-connect-updates)
- 09/21/2026: new visual design, group messaging, in-app voice recording and text-to-speech. More People-screen and accounting features were promised "in the coming weeks" — [New Look](https://www.churchtrac.com/blog/announcements/new-look-new-features)
- 10/01/2026: Group Messaging — [Group Messaging](https://www.churchtrac.com/blog/new-feature-group-messaging)
- 10/29/2026: PDF bank statement upload ("secure, encrypted AI" parses statements; it can create accounts and opening balances for new setups), automatic bank reconciliation and register enhancements. These are for current-pricing plans only — [Fall Accounting Updates](https://www.churchtrac.com/blog/fall-accounting-updates-26)
- A site search for AI found no other AI features — [churchtrac.com search](https://www.churchtrac.com/)

### Inferences
- The roadmap points toward replacing point tools: Text In Church (messaging; ChurchTrac's own price comparisons), GroupMe (group chat), Planning Center Services/OnSong (worship app) and QuickBooks (accounting automation).

### Gaps
- Details of the promised post-Sep-2026 People-screen features weren't found. No public changelog or roadmap page exists beyond the blog.

## Q6. What does the day-to-day admin / ministry-leader workflow look like?

### Takeaway
The weekly loop is: plan and schedule (worship outline, volunteer invites and reminders) → Sunday check-in, attendance and offering entry → post-Sunday deposits to Accounting, absentee and guest follow-up via Smart Lists, SMS, automations and notes → treasurer reconciliation and emailed reports.

### Cited Findings
- Before Sunday: assign every child and adult to Groups (Bulk Edit), since check-in depends on Group assignment — [Getting Started with Check-In](https://www.churchtrac.com/support/check_in/using-check-in). Build or clone the service outline and send volunteer invites, with automatic reminders up to 3 days before — [Scheduling Volunteers](https://www.churchtrac.com/support/worship/scheduling-roles). A check-in event can be created in under 60 seconds — [Check-In feature page](https://www.churchtrac.com/features/church-check-in)
- Sunday: families check in at iPad or PC kiosks (phone last-4, name or Connect QR). Labels print with security codes, and pickup at check-out records a timestamp and pickup name — [iPad Check-In App](https://www.churchtrac.com/support/check_in/using-the-check-in-app). Musicians use the Worship app on stage — [Worship App](https://www.churchtrac.com/blog/announcements/churchtrac-worship-app). Small-group leaders record attendance in Connect, and Live Mode kiosks handle adult self-attendance — [Entering Attendance](https://www.churchtrac.com/support/attendance/entering-attendance)
- Guests: Add My Family QR codes on slides or at the welcome desk, Form cards (connection cards) and SMS keywords ("New") feed submissions to staff for review and matching — [Add My Family](https://www.churchtrac.com/support/connect/add-my-family); [Church Texting](https://www.churchtrac.com/features/church-texting)
- Offering: enter giving batches (including unknown/cash gifts), lock the batch and create a deposit for Accounting. Online gifts land on the Giving screen automatically — [Giving category](https://www.churchtrac.com/support/giving); [Online Giving FAQs](https://www.churchtrac.com/support/giving/online-giving-faqs)
- Follow-up: run the Absentee report and SMS absentees. Automations handle new-name notifications, birthday messages, first-time donor follow-up, adding notes or tasks and changing groups. Note Types record pastoral visits, and Projects/Tasks assign follow-ups — [Lesser Known Features](https://www.churchtrac.com/blog/lesser-known-church-software-features); [Using Automations](https://www.churchtrac.com/support/settings/automations); [Projects and Tasks](https://www.churchtrac.com/support/settings/projects-and-tasks)
- Treasurer: Bank Link sync or PDF statement upload, then review and import, then auto-reconcile. Scheduled report emails go out (e.g., monthly ministry expenses to leaders, last month's giving to the treasurer). Contribution statements are produced at year end — [Bank Link](https://www.churchtrac.com/support/accounting/bank-sync); [Fall Accounting Updates](https://www.churchtrac.com/blog/fall-accounting-updates-26); [Accounting Search](https://www.churchtrac.com/blog/church-software-update-revamped-accounting-search-with-reports-feb-26); [Contribution Statements](https://www.churchtrac.com/support/giving/contribution-statements)
- Onboarding is supported by free workshops, free data migration and a free accounting setup review — [Getting Started](https://www.churchtrac.com/support/getting_started); [Features](https://www.churchtrac.com/features)

### Inferences
- The check-in → follow-up loop is not fully automatic. No documented trigger such as "first check-in" or "missed 3 weeks" fires an automation, and absentee follow-up is a manual report-then-message step. A competitor could win with attendance-driven automated care workflows and a mobile-first leader experience.

### Gaps
- No ChurchTrac-published end-to-end "Sunday workflow" guide was found. The sequence above is assembled from module docs.
