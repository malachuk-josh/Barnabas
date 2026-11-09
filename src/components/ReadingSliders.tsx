"use client";

// The two sliders for how Scripture is set: its size and its weight.
//
// In two places — Settings, under a preview verse, and The Word's navigator,
// where the page behind them is the preview — and one component, so the two
// can never offer different limits or name the steps differently. The values
// and what to do with them belong to whoever shows it; see lib/readingText.

import { PT_MAX, PT_MIN, WEIGHT_MAX } from "@/lib/readingText";
import { useI18n, type MessageKey } from "@/lib/i18n";

/** What each step of the boldness slider is called, from regular up. */
const WEIGHT_NAMES: MessageKey[] = [
  "settings.weight0",
  "settings.weight1",
  "settings.weight2",
  "settings.weight3",
  "settings.weight4",
];

export default function ReadingSliders({
  pt,
  weight,
  onPt,
  onWeight,
}: {
  pt: number;
  weight: number;
  onPt: (pt: number) => void;
  onWeight: (weight: number) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="slider-field">
        <span className="slider-label">
          {t("reader.textSize")}
          <span className="slider-value">{pt} pt</span>
        </span>
        {/* the small A and the large (or heavy) A at either end say what the
            slider does before it is touched */}
        <span className="slider-row">
          <span className="slider-end" aria-hidden>
            A
          </span>
          <input
            type="range"
            min={PT_MIN}
            max={PT_MAX}
            step={1}
            value={pt}
            aria-valuetext={`${pt} pt`}
            onChange={(e) => onPt(Number(e.target.value))}
          />
          <span className="slider-end slider-end-big" aria-hidden>
            A
          </span>
        </span>
      </label>
      <label className="slider-field">
        <span className="slider-label">
          {t("settings.boldness")}
          <span className="slider-value">{t(WEIGHT_NAMES[weight])}</span>
        </span>
        <span className="slider-row">
          <span className="slider-end" aria-hidden>
            A
          </span>
          <input
            type="range"
            min={0}
            max={WEIGHT_MAX}
            step={1}
            value={weight}
            aria-valuetext={t(WEIGHT_NAMES[weight])}
            onChange={(e) => onWeight(Number(e.target.value))}
          />
          <span className="slider-end slider-end-bold" aria-hidden>
            A
          </span>
        </span>
      </label>
    </>
  );
}
