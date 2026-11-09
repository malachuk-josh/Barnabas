import { DemoChurch, type DemoPerson } from "@/lib/chms/demo";
import { setChurchData } from "@/lib/chms";
import { today } from "@/lib/dates";

/**
 * A fictional congregation for tests only. The demo church itself has no congregation (only its real
 * leaders), so tests that need volunteers, care subjects or donors build them here.
 */
export const FIXTURE_PEOPLE: DemoPerson[] = [
  { id: "p01", name: "Sarah Kim", firstName: "Sarah", language: "en", smallGroup: "Tuesday women's group",
    serving: { worship: "SSSSSSSSS...", kids: "S.S.S.S.S.S.", hospitality: ".S.S.S......" },
    worship: "111111111111", group: "00110111", next: ["worship", "kids"], thankedDaysAgo: 140 },
  { id: "p02", name: "Marcus Bell", firstName: "Marcus", language: "en", smallGroup: "Men's breakfast",
    serving: { tech: "SDSSSSD.S.S.", parking: "S.S.S.S....." },
    worship: "111111111111", group: "10111111", next: ["tech"], thankedDaysAgo: 75 },
  { id: "p03", name: "Ana López", firstName: "Ana", language: "es", household: "López family", smallGroup: "Grupo de jóvenes adultos",
    serving: { kids: "SSSSS.S.S...", greeters: "..S..S..S..." },
    worship: "111111110111", group: "11011111", next: ["kids"], thankedDaysAgo: 30 },
  { id: "p04", name: "Daniel Okafor", firstName: "Daniel", language: "en",
    serving: { worship: "S.S.S.S.S.S." }, worship: "111111111111", next: ["worship"], thankedDaysAgo: 20 },
  { id: "p05", name: "Grace Lee", firstName: "Grace", language: "en", smallGroup: "Tuesday women's group",
    serving: { hospitality: "...S.S.S.S.S" }, worship: "000111111111", group: "00011111", thankedDaysAgo: 45 },
  { id: "p06", name: "Jin-woo Park", firstName: "Jin-woo", language: "ko", household: "Park family",
    serving: { tech: "SSS...S...S." }, worship: "111111111111", next: ["tech"], thankedDaysAgo: 15 },
  { id: "p07", name: "Min-ji Park", firstName: "Min-ji", language: "ko", household: "Park family",
    serving: { kids: "S..S..S..S.." }, worship: "111111111111", thankedDaysAgo: 15 },
  { id: "p08", name: "Luis Hernández", firstName: "Luis", language: "es", household: "Hernández family",
    serving: { parking: "SSSSSSS.S.S." }, worship: "001001111111", next: ["parking"], thankedDaysAgo: 200 },
  { id: "p09", name: "Carmen Hernández", firstName: "Carmen", language: "es", household: "Hernández family",
    serving: { hospitality: "S.S.S.S.S.S." }, worship: "111111111111", thankedDaysAgo: 40 },
  { id: "p10", name: "Tom Reyes", firstName: "Tom", language: "en",
    serving: { greeters: "S..S..S..S.." }, worship: "111111111111", next: ["greeters"], thankedDaysAgo: 10 },
  { id: "p11", name: "Priya Shah", firstName: "Priya", language: "en", smallGroup: "Young families",
    serving: { kids: "S.S..S.S..S." }, worship: "111111111111", group: "11111111", next: ["kids"], thankedDaysAgo: 25 },
  { id: "p12", name: "Ben Carter", firstName: "Ben", language: "en", smallGroup: "Men's breakfast",
    worship: "000001111111", group: "00001111" },
  { id: "p13", name: "Ruth Adeyemi", firstName: "Ruth", language: "en",
    serving: { greeters: ".S..S..S..S." }, worship: "111111111111", thankedDaysAgo: 12 },
  { id: "p14", name: "Sofía Ramírez", firstName: "Sofía", language: "es",
    serving: { worship: ".S.S.S.S.S.S" }, worship: "111111111111", thankedDaysAgo: 18 },
  { id: "p15", name: "Hannah Wright", firstName: "Hannah", language: "en",
    serving: { kids: "DDS.D.S.S.S." }, worship: "101111111111", thankedDaysAgo: 90 },
  { id: "p16", name: "David Cho", firstName: "David", language: "ko",
    serving: { greeters: "S...S...S..." }, worship: "111111111111", next: ["greeters"], thankedDaysAgo: 22 },
  { id: "p17", name: "Elena Torres", firstName: "Elena", language: "es",
    serving: { kids: ".S...S...S.." }, worship: "111111111111", thankedDaysAgo: 35 },
  { id: "p18", name: "Nate Brooks", firstName: "Nate", language: "en",
    serving: { tech: "SSSSSSSSSS.." }, worship: "111111111111", next: ["tech"], thankedDaysAgo: 100 },
];

for (const p of FIXTURE_PEOPLE) {
  p.phone = `(555) 01${p.id.slice(1)}-${String(1000 + Number(p.id.slice(1)) * 37).slice(-4)}`;
  p.email = `${p.firstName.toLowerCase().replace(/[^a-z]/g, "")}.${p.id}@example.org`;
}

/** The demo church plus the fixture congregation. */
export function fixtureChurch(clock: () => string = () => today()) {
  return new DemoChurch(clock, FIXTURE_PEOPLE);
}

/** Makes churchData() the fixture church for the rest of the test file. */
export function useFixtureChurch(clock?: () => string) {
  const church = fixtureChurch(clock);
  setChurchData(church);
  return church;
}

/** Back to the real demo church (only the real leaders). */
export function useDemoChurch() {
  setChurchData(new DemoChurch());
}
