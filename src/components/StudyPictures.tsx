"use client";

// The chapter's study pictures, in its Context panel: the Tabernacle and the
// Temples where the text builds them, and the houses, fields, clothes and
// tools of the Bible world where the text mentions them. A row of pictures
// to swipe along; a tap opens one full screen, with what it is, what in it is
// reconstructed, and where that comes from.
//
// Every one is a study reconstruction rather than a photograph of something
// found, and the panel says so under the row as well as with each picture.
// Nothing shows for a chapter that has none — most of them.

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import PictureViewer from "@/components/PictureViewer";
import { useI18n } from "@/lib/i18n";
import { studyArtFor, type StudyArt } from "@/lib/studyArt";

export default function StudyPictures({ bookNr, chapter }: { bookNr: number; chapter: number }) {
  const { t } = useI18n();
  const [art, setArt] = useState<StudyArt[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setArt([]);
    studyArtFor(bookNr, chapter).then((a) => live && setArt(a));
    return () => {
      live = false;
    };
  }, [bookNr, chapter]);

  if (art.length === 0) return null;
  const shown = open === null ? null : art[open];

  return (
    <div className="ctx-section study-pics">
      <h3>
        <Icon name="picture" /> {t("reader.ctxPictures")}
      </h3>
      <div className="study-row" role="list">
        {art.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="listitem"
            className={`study-card${a.type === "diagram" ? " diagram" : ""}`}
            onClick={() => setOpen(i)}
          >
            <img src={a.src} alt={a.alt} loading="lazy" width={a.w} height={a.h} />
            <span>{a.title}</span>
          </button>
        ))}
      </div>
      <p className="study-note">{t("reader.studyNote")}</p>
      {shown && (
        <PictureViewer
          key={shown.id}
          src={shown.src}
          full={shown.full}
          alt={shown.alt}
          onClose={() => setOpen(null)}
          caption={{
            title: shown.title,
            kind: shown.type === "diagram" ? t("reader.studyDiagram") : t("reader.studyReconstruction"),
            refs: shown.refs.join("; "),
            period: shown.period,
            note: shown.note,
            sources: shown.sources,
          }}
          step={
            art.length > 1
              ? {
                  at: `${open! + 1} / ${art.length}`,
                  prev: () => setOpen((o) => (o === null ? o : (o + art.length - 1) % art.length)),
                  next: () => setOpen((o) => (o === null ? o : (o + 1) % art.length)),
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
