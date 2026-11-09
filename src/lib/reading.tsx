"use client";

// Shares the reader's current position with the sticky nav header, and lets
// the header drive the reader: the passage chip opens the control sheet, the
// ✦ button turns study mode on. Study mode lives here rather than in Reader
// because both the header and the reader read and write it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { readLocal, writeLocal } from "@/lib/storage";

/** Fired the instant before study mode flips, while the old layout still stands. */
export const STUDY_WILL_CHANGE = "barnabas.word:study-will-change";

export interface ReadingPosition {
  bookNr: number;
  chapter: number;
}

interface ReadingContextValue {
  position: ReadingPosition | null;
  setPosition: (position: ReadingPosition) => void;
  panelOpen: boolean;
  setPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  study: boolean;
  toggleStudy: () => void;
  /** on or off outright, for when a rule decides rather than a tap */
  setStudyMode: (on: boolean) => void;
}

const ReadingContext = createContext<ReadingContextValue>({
  position: null,
  setPosition: () => {},
  panelOpen: false,
  setPanelOpen: () => {},
  study: false,
  toggleStudy: () => {},
  setStudyMode: () => {},
});

export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [study, setStudy] = useState(false);
  /** the same answer, readable from a callback without a stale closure */
  const studyRef = useRef(false);

  // read after mount: the server has no idea which mode this reader left in
  useEffect(() => {
    try {
      if (readLocal("barnabas.word.studyMode") === "1") {
        studyRef.current = true;
        setStudy(true);
      }
    } catch {
      // storage blocked — study mode simply starts off
    }
  }, []);

  const setStudyMode = useCallback((on: boolean) => {
    if (studyRef.current === on) return;
    // Study mode changes the height of every verse in the book, so the reader
    // has to note where they are BEFORE the switch — once React has committed
    // it, the old layout is gone and there is nothing left to measure against.
    window.dispatchEvent(new Event(STUDY_WILL_CHANGE));
    studyRef.current = on;
    try {
      writeLocal("barnabas.word.studyMode", on ? "1" : "0");
    } catch {
      // storage blocked — the choice just won't outlive this visit
    }
    setStudy(on);
  }, []);

  const toggleStudy = useCallback(
    () => setStudyMode(!studyRef.current),
    [setStudyMode]
  );

  const value = useMemo(
    () => ({
      position,
      setPosition,
      panelOpen,
      setPanelOpen,
      study,
      toggleStudy,
      setStudyMode,
    }),
    [position, panelOpen, study, toggleStudy, setStudyMode]
  );
  return (
    <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>
  );
}

export function useReading(): ReadingContextValue {
  return useContext(ReadingContext);
}

