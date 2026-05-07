"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type MemoryPaperNoteProps = {
  text: string;
  visible: boolean;
  /** When true, note stays until dismissed; slightly stronger shadow. */
  pinned: boolean;
  className?: string;
  /** `fade` relies on CSS appear animation; full text shows at once. */
  revealMode?: "typewriter" | "fade";
};

const CHAR_MS_SLOW = 92;

export function MemoryPaperNote({
  text,
  visible,
  pinned,
  className = "",
  revealMode = "typewriter",
}: MemoryPaperNoteProps) {
  const [shown, setShown] = useState("");
  const [expired, setExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef = useRef(0);

  const paperStyle = useMemo(() => {
    const rot = (Math.random() * 2.8 - 1.4).toFixed(2);
    const drift = (Math.random() * 3.2 - 1.6).toFixed(2);
    return {
      ["--paper-rot" as const]: `${rot}deg`,
      ["--paper-shift-x" as const]: `${drift}px`,
    } as CSSProperties;
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    idxRef.current = 0;
    setShown("");
    setExpired(false);
    if (!visible || !text) return;

    if (revealMode === "fade") {
      setShown(text);
    } else {
      timerRef.current = setInterval(() => {
        idxRef.current += 1;
        const next = text.slice(0, idxRef.current);
        setShown(next);
        if (idxRef.current >= text.length && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }, CHAR_MS_SLOW);
    }

    // Ephemeral note behavior: softly disappear unless the object stays selected.
    if (!pinned) {
      hideTimerRef.current = setTimeout(() => {
        setExpired(true);
      }, 7200);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [text, visible, revealMode]);

  if (!visible || expired) return null;

  return (
    <div
      style={paperStyle}
      className={[
        "myechos-memory-paper myechos-memory-paper--whisper pointer-events-none select-none",
        pinned ? "myechos-memory-paper--pinned" : "myechos-memory-paper--hover",
        className,
      ].join(" ")}
    >
      <p className="myechos-memory-paper__text myechos-memory-paper__text--whisper">
        {shown}
        {revealMode === "typewriter" && visible && shown.length < text.length ? (
          <span className="myechos-memory-paper__caret inline-block w-px translate-y-px" aria-hidden />
        ) : null}
      </p>
    </div>
  );
}
