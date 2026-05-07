"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DormMemoryScene } from "./DormMemoryScene";
import { LandingAtmosphere } from "./LandingAtmosphere";

type Phase = "landing" | "space";

export function MyEchosApp() {
  const inputId = useId();
  const [phase, setPhase] = useState<Phase>("landing");
  const [entering, setEntering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const enterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (enterTimeoutRef.current !== null) {
        clearTimeout(enterTimeoutRef.current);
        enterTimeoutRef.current = null;
      }
    };
  }, []);

  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const onFile = useCallback((file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setPhotoFile(file);
  }, []);

  const enterSpace = useCallback(() => {
    if (!photoFile) return;
    if (enterTimeoutRef.current !== null) {
      clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }
    setEntering(true);
    enterTimeoutRef.current = setTimeout(() => {
      enterTimeoutRef.current = null;
      if (!mountedRef.current) return;
      setPhase("space");
      setEntering(false);
    }, 520);
  }, [photoFile]);

  const changePlace = useCallback(() => {
    if (enterTimeoutRef.current !== null) {
      clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }
    setEntering(false);
    setPhotoFile(null);
    setPhase("landing");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  if (phase === "space" && photoFile) {
    return (
      <DormMemoryScene photoFile={photoFile} fileLabel={photoFile.name} onChangePlace={changePlace} />
    );
  }

  return (
    <div className="relative flex min-h-svh flex-col bg-[#f5efe8] text-[#453d36]">
      <LandingAtmosphere />
      <div
        className={[
          "relative z-10 flex flex-1 flex-col px-6 py-14 transition-[opacity,filter] duration-620 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-12 sm:py-20",
          entering ? "pointer-events-none opacity-0 blur-[2px]" : "opacity-100 blur-0",
        ].join(" ")}
      >
        <header className="max-w-lg">
          <p className="text-[10px] font-medium uppercase tracking-[0.42em] text-[#a89888]">
            MyEchos
          </p>
          <h1 className="mt-8 font-serif text-[1.7rem] font-normal leading-[1.35] tracking-tight text-[#3d3630] sm:text-[2rem]">
            Upload a place.
            <span className="mt-2 block font-light text-[#5c5048]">Leave an echo.</span>
            <span className="mt-2 block font-light text-[#7a6e66]">Invite someone in.</span>
          </h1>
          <p className="mt-10 max-w-md text-[0.9375rem] leading-[1.65] text-[#6f655c]">
            A room, a corner, a street — yours. Held softly: stylized, intimate, alive. Not a
            copy of the world; a quiet way back in.
          </p>
        </header>

        <div className="mt-14 flex max-w-md flex-col gap-8">
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <label
            htmlFor={inputId}
            className="group flex cursor-pointer flex-col rounded-[1.75rem] border border-[#e8dfd4] bg-[#fffcf8]/72 px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_24px_56px_-20px_rgba(180,150,120,0.18)] backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-500 hover:border-[#d4c4b4] hover:bg-[#fffefb]/88 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_28px_64px_-18px_rgba(200,170,140,0.22)]"
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-[#8b7359]">
              Your photograph
            </span>
            <span className="mt-4 text-[0.9375rem] leading-relaxed text-[#4f4740]">
              {photoFile ? photoFile.name : "A place you remember — dorm, bedroom, café, street."}
            </span>
            <span className="mt-5 inline-flex w-fit text-[13px] text-[#9a7b62] transition-colors group-hover:text-[#7a5c48]">
              Open a file
            </span>
          </label>

          <button
            type="button"
            disabled={!photoFile}
            onClick={enterSpace}
            className={[
              "rounded-[1.25rem] px-7 py-4 text-[0.9375rem] font-normal tracking-wide transition-all duration-500",
              photoFile
                ? "bg-[#ebe0d4] text-[#3a322c] shadow-[0_0_0_1px_rgba(255,255,255,0.65),0_12px_40px_-8px_rgba(180,140,110,0.35)] hover:bg-[#f2ebe3] hover:shadow-[0_0_0_1px_rgba(255,252,248,0.9),0_16px_48px_-6px_rgba(190,150,120,0.28)]"
                : "cursor-not-allowed border border-[#e5dcd2] bg-[#ebe4dc]/65 text-[#9a9088]",
            ].join(" ")}
          >
            Step into this memory
          </button>
        </div>

        <footer className="mt-auto pt-20 text-[11px] leading-relaxed text-[#8a7d74]">
          Prototype — your image stays in this browser until you leave or refresh.
        </footer>
      </div>
    </div>
  );
}
