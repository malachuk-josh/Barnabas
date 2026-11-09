import type { ColumnSpec } from "../csv/columns";

/**
 * Header synonyms for each file the migration tool takes, covering ChurchTrac's report exports, Planning
 * Center's People and Giving exports, and ordinary spreadsheets. Matching is tolerant (case, spaces and
 * punctuation don't matter) and every column can be chosen by hand in the preview.
 */

export const FILE_KINDS = ["people", "groups", "attendance", "giving"] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const SYSTEMS = ["churchtrac", "planning_center", "csv"] as const;
export type System = (typeof SYSTEMS)[number];

export const PEOPLE_FIELDS = ["externalId", "firstName", "lastName", "nickname", "fullName", "email", "phone", "homePhone", "street", "city", "state", "zip", "birthdate", "anniversary", "status", "membershipDate", "household", "householdRole", "language", "groups"] as const;
export type PeopleField = (typeof PEOPLE_FIELDS)[number];

export const PEOPLE_COLUMNS: ColumnSpec<PeopleField> = {
  externalId: { exact: ["person id", "individual id", "id", "remote id", "profile id", "member id", "people id", "churchtrac id"] },
  firstName: { exact: ["first name", "firstname", "first", "given name"], partial: ["first name"] },
  lastName: { exact: ["last name", "lastname", "last", "surname", "family name"], partial: ["last name", "surname"] },
  nickname: { exact: ["nickname", "nick name", "goes by", "preferred name", "given name preferred"] },
  fullName: { exact: ["name", "full name", "display name", "person", "individual", "member name", "formal name"] },
  email: { exact: ["email", "e-mail", "email address", "primary email", "home email", "personal email", "email 1"], partial: ["email", "e-mail"] },
  phone: { exact: ["mobile phone", "cell phone", "cell", "mobile", "mobile phone number", "cell phone number", "primary phone", "phone"], partial: ["mobile", "cell"] },
  homePhone: { exact: ["home phone", "home phone number", "phone home"], partial: ["home phone"] },
  street: { exact: ["address", "street", "street address", "address 1", "address line 1", "home address street line 1", "mailing address"], partial: ["street", "address line 1"] },
  city: { exact: ["city", "home address city", "mailing city"], partial: ["city"] },
  state: { exact: ["state", "province", "home address state", "mailing state", "st"], partial: ["state"] },
  zip: { exact: ["zip", "zip code", "zipcode", "postal code", "home address zip code", "mailing zip"], partial: ["zip", "postal"] },
  birthdate: { exact: ["birthdate", "birthday", "birth date", "date of birth", "dob", "birth day"], partial: ["birth"] },
  anniversary: { exact: ["anniversary", "wedding anniversary", "anniversary date", "marriage date"], partial: ["anniversary"] },
  status: { exact: ["member status", "membership", "membership status", "membership type", "status", "member type", "connection status"], partial: ["membership", "member status"] },
  membershipDate: { exact: ["membership date", "member since", "date joined", "join date", "joined", "membership start date"], partial: ["member since", "membership date"] },
  household: { exact: ["family", "family name", "household", "household name", "family id", "household id", "household primary contact"], partial: ["household", "family"] },
  householdRole: { exact: ["family position", "family role", "household role", "relationship", "position", "family relationship"], partial: ["family position", "family role"] },
  language: { exact: ["language", "preferred language", "primary language"], partial: ["language"] },
  groups: { exact: ["groups", "group", "small groups", "small group", "group tags", "lists"], partial: ["groups"] },
};

export const GROUP_FIELDS = ["group", "fullName", "firstName", "lastName", "email", "role"] as const;
export type GroupField = (typeof GROUP_FIELDS)[number];
export const GROUP_COLUMNS: ColumnSpec<GroupField> = {
  group: { exact: ["group", "group name", "groups", "small group", "class", "ministry", "team"], partial: ["group"] },
  fullName: { exact: ["name", "full name", "member", "member name", "person", "individual"] },
  firstName: { exact: ["first name", "firstname", "first"] },
  lastName: { exact: ["last name", "lastname", "last"] },
  email: { exact: ["email", "e-mail", "email address"], partial: ["email"] },
  role: { exact: ["role", "group role", "position", "leader", "membership type"], partial: ["role"] },
};

export const ATTENDANCE_FIELDS = ["date", "fullName", "firstName", "lastName", "email", "event", "present"] as const;
export type AttendanceField = (typeof ATTENDANCE_FIELDS)[number];
export const ATTENDANCE_COLUMNS: ColumnSpec<AttendanceField> = {
  date: { exact: ["date", "attendance date", "event date", "service date", "check-in date", "checked in at"], partial: ["date"] },
  fullName: { exact: ["name", "full name", "person", "individual", "attendee"] },
  firstName: { exact: ["first name", "firstname", "first"] },
  lastName: { exact: ["last name", "lastname", "last"] },
  email: { exact: ["email", "e-mail"], partial: ["email"] },
  event: { exact: ["event", "event name", "group", "group name", "service", "attendance event", "class"], partial: ["event", "group"] },
  present: { exact: ["present", "attended", "status", "attendance", "here"], partial: ["present", "attend"] },
};

export const FIELD_LABELS: Record<string, string> = {
  externalId: "Their ID", firstName: "First name", lastName: "Last name", nickname: "Nickname", fullName: "Full name", email: "Email", phone: "Mobile phone", homePhone: "Home phone",
  street: "Street", city: "City", state: "State", zip: "ZIP", birthdate: "Birthdate", anniversary: "Anniversary", status: "Member status", membershipDate: "Membership date",
  household: "Household / family", householdRole: "Family position", language: "Language", groups: "Groups (comma-separated)",
  group: "Group", role: "Role in group", date: "Date", event: "Service, event or group", present: "Present?",
  donor: "Giver (full name)", amount: "Amount", fund: "Fund", method: "Method", check: "Check number",
};
