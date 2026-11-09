"use client";

// The typeface Scripture is set in, chosen from six.
//
// Each choice is shown in its own letters, because a typeface is decided by
// looking at it, and the line under the tiles says in a sentence what the
// chosen one is. The preview verse above it in Settings is set in the choice
// too, at the reader's own size and boldness.

import { FACES, type Face } from "@/lib/readingText";
import { FACE_NAMES, faceStack } from "@/lib/typefaces";
import { useI18n, type MessageKey } from "@/lib/i18n";

export default function TypefacePicker({
  face,
  onFace,
}: {
  face: Face;
  onFace: (face: Face) => void;
}) {
  const { t } = useI18n();
  const name = (f: Face) =>
    f === "default" ? t("settings.faceDefault") : FACE_NAMES[f];
  return (
    <div className="slider-field face-field">
      <span className="slider-label">
        {t("settings.typeface")}
        <span className="slider-value">{name(face)}</span>
      </span>
      <div className="face-grid" role="radiogroup" aria-label={t("settings.typeface")}>
        {FACES.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={f === face}
            className={`face-opt${f === face ? " on" : ""}`}
            onClick={() => onFace(f)}
          >
            <span className="face-sample" style={{ fontFamily: faceStack(f) }} aria-hidden>
              Aa
            </span>
            <span className="face-name">{name(f)}</span>
          </button>
        ))}
      </div>
      <p className="cal-hint face-about">{t(`settings.face.${face}` as MessageKey)}</p>
    </div>
  );
}
