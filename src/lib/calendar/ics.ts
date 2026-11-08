import { fromWall, addDaysIso } from "./time";
import type { CalendarEvent } from "./types";

/** iCalendar (RFC 5545) feed of a leader's Barnabas events, for Apple, Google and Outlook subscriptions. */

function escape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");
}

function utcStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Lines longer than 75 octets are folded with CRLF + space. */
function fold(line: string) {
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (new TextEncoder().encode(current + ch).length > 74) {
      out.push(current);
      current = ` ${ch}`;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n");
}

export function buildIcs(events: CalendarEvent[], tz: string, name: string, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barnabas//Ministry Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(name)}`,
    `X-WR-TIMEZONE:${tz}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@barnabas`);
    lines.push(`DTSTAMP:${utcStamp(now)}`);
    lines.push(`LAST-MODIFIED:${utcStamp(new Date(e.updatedAt))}`);
    if (e.allDay || !e.start || !e.end) {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`);
      lines.push(`DTEND;VALUE=DATE:${addDaysIso(e.date, 1).replace(/-/g, "")}`);
    } else {
      lines.push(`DTSTART:${utcStamp(fromWall(e.date, e.start, tz))}`);
      lines.push(`DTEND:${utcStamp(fromWall(e.date, e.end, tz))}`);
    }
    // Titles and places only: private notes never leave Barnabas through the feed.
    lines.push(`SUMMARY:${escape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
