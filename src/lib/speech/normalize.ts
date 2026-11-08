/**
 * Rewrites text so a text-to-speech voice says it the way people do:
 * "John 3:16" -> "John three sixteen", "11:30 AM" -> "eleven thirty A M", "$1,200" -> "twelve hundred dollars".
 * Runs in the browser before each sentence is spoken.
 */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ""}`;
  if (n < 10000 && n % 100 === 0 && n % 1000 !== 0) return `${numberWords(n / 100)} hundred`; // 1,200 -> twelve hundred
  if (n < 1_000_000) return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberWords(n % 1000)}` : ""}`;
  if (n < 1_000_000_000) return `${numberWords(Math.floor(n / 1_000_000))} million${n % 1_000_000 ? ` ${numberWords(n % 1_000_000)}` : ""}`;
  return String(n);
}

const BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "Samuel", "Kings",
  "Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalm", "Psalms", "Proverbs", "Ecclesiastes", "Song of Songs",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
  "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "Thessalonians", "Timothy",
  "Titus", "Philemon", "Hebrews", "James", "Peter", "Jude", "Revelation",
];
const ORDINAL_PREFIX: Record<string, string> = { "1": "First", "2": "Second", "3": "Third" };

const bookPattern = new RegExp(
  `\\b(?:([123])\\s+)?(${BOOKS.map((b) => b.replace(/ /g, "\\s+")).join("|")})\\s+(\\d{1,3}):(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?\\b`,
  "g",
);

function chapterVerse(_m: string, num: string | undefined, book: string, ch: string, v1: string, v2?: string) {
  const prefix = num ? `${ORDINAL_PREFIX[num]} ` : "";
  const verses = v2 ? `${numberWords(+v1)} through ${numberWords(+v2)}` : numberWords(+v1);
  return `${prefix}${book} ${numberWords(+ch)} ${verses}`;
}

function clock(_m: string, h: string, min: string, dotted?: string, plain?: string) {
  const ampm = dotted ?? plain;
  const hour = numberWords(+h);
  const minutes = min === "00" ? (ampm ? "" : " o'clock") : +min < 10 ? ` oh ${numberWords(+min)}` : ` ${numberWords(+min)}`;
  const suffix = ampm ? ` ${ampm.toUpperCase()} M` : "";
  return `${hour}${minutes}${suffix}`;
}

function money(_m: string, whole: string, cents?: string) {
  const dollars = +whole.replace(/,/g, "");
  const words = `${numberWords(dollars)} dollar${dollars === 1 ? "" : "s"}`;
  return cents && +cents > 0 ? `${words} and ${numberWords(+cents)} cents` : words;
}

export function normalizeForSpeech(text: string): string {
  return text
    .replace(/\*\*|__|`|#+\s/g, "")
    .replace(/https?:\/\/\S+/g, "the link on your screen")
    .replace(bookPattern, chapterVerse)
    .replace(/\b(\d{1,2}):(\d{2})(?:\s*(?:([ap])\.m\.|([ap])m\b))?/gi, clock)
    .replace(/\$(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g, money)
    .replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (m) => numberWords(+m.replace(/,/g, "")))
    .replace(/(\d+)%/g, (_m, n) => `${numberWords(+n)} percent`)
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
