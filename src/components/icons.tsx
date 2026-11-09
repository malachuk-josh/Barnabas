const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const TalkIcon = () => (
  <svg {...common}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
export const BookIcon = () => (
  <svg {...common}>
    <path d="M12 6.5C10.3 5.2 7.8 4.5 4 4.5v13c3.8 0 6.3.7 8 2 1.7-1.3 4.2-2 8-2v-13c-3.8 0-6.3.7-8 2Z" />
    <path d="M12 6.5v13" />
  </svg>
);
export const CalendarIcon = () => (
  <svg {...common}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const MemoryIcon = () => (
  <svg {...common}>
    <path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5Z" />
    <path d="M5 17a3 3 0 0 1 3-3h10.5M9 8.5h6" />
  </svg>
);
export const DraftsIcon = () => (
  <svg {...common}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);
export const SettingsIcon = () => (
  <svg {...common}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
);
export const ChevronLeft = () => (
  <svg {...common}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
export const ChevronRight = () => (
  <svg {...common}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
export const FinanceIcon = () => (
  <svg {...common}>
    <path d="M3.5 9.5 12 4.5l8.5 5" />
    <path d="M5 20h14M4 9.5h16M6.5 12v5.5M10 12v5.5M14 12v5.5M17.5 12v5.5" />
  </svg>
);
export const HeartIcon = () => (
  <svg {...common}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
  </svg>
);
export const MoreIcon = () => (
  <svg {...common}>
    <circle cx="5.5" cy="12" r="1.3" />
    <circle cx="12" cy="12" r="1.3" />
    <circle cx="18.5" cy="12" r="1.3" />
  </svg>
);
export const ServeIcon = () => (
  <svg {...common}>
    <circle cx="9" cy="7.5" r="3" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M16 4.8a3 3 0 0 1 0 5.4M17.5 14.2a5.5 5.5 0 0 1 3 5.3" />
  </svg>
);
export const ServicesIcon = () => (
  <svg {...common}>
    <path d="M6 4.5h12M6 9h12M6 13.5h7" />
    <path d="M8 20.5h8M12 16.5v4" />
  </svg>
);
export const EventsIcon = () => (
  <svg {...common}>
    <path d="M4 7.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2.5 2.5 0 0 0 0-5Z" />
    <path d="M14 5.5v13" strokeDasharray="2 2.2" />
  </svg>
);
export const KidsIcon = () => (
  <svg {...common}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.8 14.2a4 4 0 0 0 6.4 0" />
    <path d="M9.2 9.8h.01M14.8 9.8h.01" strokeWidth="2.6" />
  </svg>
);
export const ReportsIcon = () => (
  <svg {...common}>
    <path d="M4 20h16" />
    <path d="M7 16.5v-5M12 16.5V7M17 16.5v-8" />
  </svg>
);
export const NetworkIcon = () => (
  <svg {...common}>
    <circle cx="6" cy="7" r="2.4" />
    <circle cx="18" cy="7" r="2.4" />
    <circle cx="12" cy="17.5" r="2.4" />
    <path d="M8.3 7.6h7.4M7.2 9.2l3.6 6.2M16.8 9.2l-3.6 6.2" />
  </svg>
);
