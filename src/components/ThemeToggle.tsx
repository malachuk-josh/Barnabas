"use client";

// One button, three themes, cycling dark → grey → light → dark — which the
// reader knows as Illuminated, Grey and Parchment. The ids stay as they were,
// so everybody's saved choice still means what it did.
//
// The icon shows what comes NEXT rather than what is on: a control that
// pictures the state you are already looking at tells you nothing you cannot
// see, and the question anybody has in front of it is where pressing will take
// them.
//
// Lifted out of the header so the reader's navigator can carry the same one.
// The Word's own header is kept for the passage and study mode — it is the one
// screen meant to be nothing but the text — so on that tab this lives inside
// the navigator, which is where somebody reading at night goes looking anyway.

import Icon from "@/components/Icon";
import { writeLocal } from "@/lib/storage";
import { useDocumentTheme, wordRoot, type Theme } from "@/lib/theme";

const NEXT: Record<Theme, Theme> = {
  dark: "grey",
  grey: "light",
  light: "dark",
};

const LABEL: Record<Theme, string> = {
  grey: "Switch to grey scale",
  light: "Switch to Parchment",
  dark: "Switch to Illuminated",
};

export default function ThemeToggle({
  className = "theme-toggle",
}: {
  className?: string;
}) {
  // the inline bootstrap script in the layout applies the saved theme before
  // paint; this follows it, and whatever Settings does to it afterwards
  const theme = useDocumentTheme();

  const cycle = () => {
    const next = NEXT[theme];
    // on The Word's wrapper rather than <html>, so the rest of Barnabas keeps
    // its own colours; and Barnabas's status-bar colour is left alone
    const root = wordRoot();
    if (next === "dark") delete root.dataset.theme;
    else root.dataset.theme = next;
    writeLocal("barnabas.word.theme2", next);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={cycle}
      aria-label={LABEL[NEXT[theme]]}
      title={LABEL[NEXT[theme]]}
    >
      <Icon
        name={theme === "dark" ? "news" : theme === "grey" ? "parchment" : "candle"}
      />
    </button>
  );
}
