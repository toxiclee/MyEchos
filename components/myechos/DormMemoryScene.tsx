"use client";

import { Canvas, useLoader } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { VirtualKeyboard } from "./VirtualKeyboard";

const YaleDormRoom = dynamic(() => import("./dorm/YaleDormRoom"), { ssr: false, loading: () => null });
import { MEMORIES, type MemoryEcho, type MemoryId } from "./dorm/memoryData";
import { MONITOR_WHISPERS } from "./dorm/monitorWhispers";

function GhibliRoomChrome({
  lampOn,
  onLampBrightness,
  notesPanelOpen,
  onNotesPanelOpenChange,
  paperEnabledById,
  onTogglePaperFor,
  hasSelection,
  selectedId,
  hiddenIds,
  onToggleObjectHidden,
}: {
  lampOn: boolean;
  onLampBrightness: (on: boolean) => void;
  notesPanelOpen: boolean;
  onNotesPanelOpenChange: (open: boolean) => void;
  paperEnabledById: Partial<Record<MemoryId, boolean>>;
  onTogglePaperFor: (id: MemoryId) => void;
  hasSelection: boolean;
  selectedId: MemoryId | null;
  hiddenIds: ReadonlySet<MemoryId>;
  onToggleObjectHidden: (id: MemoryId) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center pt-[4.5rem] sm:pt-[4.75rem]">
      {/* Minimal warmth when nothing is chosen — one soft control */}
      {!hasSelection ? (
        <div className="pointer-events-auto px-4">
          <button
            type="button"
            onClick={() => onLampBrightness(!lampOn)}
            className="rounded-full border border-[#d8e0d0]/55 bg-[#faf6ee]/45 px-4 py-2.5 text-[13px] text-[#5c6b52] shadow-[0_8px_28px_rgba(120,110,90,0.12)] backdrop-blur-md transition-all duration-[420ms] ease-out hover:border-[#b8c9a8]/65 hover:bg-[#fffdf8]/55 hover:shadow-[0_12px_36px_rgba(130,140,100,0.14)]"
            aria-pressed={lampOn}
            aria-label={lampOn ? "Soften the light" : "Let more light in"}
          >
            <span className="font-serif font-light tracking-wide">
              {lampOn ? "A little dusk…" : "Open the light"}
            </span>
          </button>
        </div>
      ) : null}

      {hasSelection ? (
        <div className="pointer-events-auto flex max-w-[min(100%,22rem)] flex-col items-center gap-3 px-4">
          <div
            className="flex w-full flex-wrap items-center justify-center gap-3 rounded-[2rem] border border-[#c5d4b8]/40 bg-[#f7f3ea]/50 px-4 py-3 shadow-[0_12px_40px_rgba(90,85,70,0.08)] backdrop-blur-md transition-all duration-[480ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ boxShadow: "0 14px 44px rgba(100, 115, 90, 0.1), inset 0 1px 0 rgba(255, 255, 250, 0.65)" }}
          >
            <label className="flex min-w-[10rem] flex-1 cursor-pointer flex-col gap-1.5">
              <span className="text-[10px] font-light tracking-[0.2em] text-[#6b7a62]/85">Sun through curtains</span>
              <input
                type="range"
                min={0}
                max={100}
                value={lampOn ? 78 : 22}
                onChange={(e) => onLampBrightness(Number(e.target.value) >= 48)}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#e5e8d8]/80 accent-[#8faa7c] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#f5f2ea] [&::-webkit-slider-thumb]:bg-[#a6bc92] [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(80,90,60,0.25)]"
                aria-label="Warmth of daylight in the room"
              />
            </label>

            <button
              type="button"
              onClick={() => onLampBrightness(!lampOn)}
              className="shrink-0 rounded-full border border-[#c8d4bc]/50 bg-[#eef3e6]/60 px-3.5 py-2 text-[11px] font-light tracking-wide text-[#4d5a45] transition-all duration-300 hover:bg-[#f5f8f0]/75"
              aria-pressed={lampOn}
            >
              {lampOn ? "Evening" : "Morning"}
            </button>

            <button
              type="button"
              onClick={() => onNotesPanelOpenChange(!notesPanelOpen)}
              className={
                notesPanelOpen
                  ? "shrink-0 rounded-2xl border border-[#a8b89a]/55 bg-[#f0f4ea]/70 px-3.5 py-2 text-[11px] font-light text-[#455038] shadow-inner transition-all duration-300"
                  : "shrink-0 rounded-2xl border border-[#c5d0b8]/45 bg-[#faf8f3]/55 px-3.5 py-2 text-[11px] font-light text-[#5a6650] transition-all duration-300 hover:border-[#a8b89a]/55"
              }
              aria-expanded={notesPanelOpen}
              aria-label="Whispers on paper"
            >
              Little papers
            </button>

            {selectedId ? (
              <button
                type="button"
                onClick={() => onToggleObjectHidden(selectedId)}
                className="shrink-0 rounded-2xl border border-[#d4c4b8]/55 bg-[#faf6f0]/65 px-3.5 py-2 text-[11px] font-light text-[#5a5248] transition-all duration-300 hover:border-[#b8a898]/65"
                aria-pressed={hiddenIds.has(selectedId)}
              >
                {hiddenIds.has(selectedId) ? "Bring back" : "Set aside"}
              </button>
            ) : null}
          </div>

          {notesPanelOpen ? (
            <div
              className="pointer-events-auto max-h-[min(44vh,18rem)] w-full overflow-y-auto rounded-[1.25rem] border border-[#c5d4b8]/35 bg-[#faf7f0]/88 px-3 py-3 shadow-[0_16px_48px_rgba(85,95,75,0.1)] backdrop-blur-md"
              role="region"
              aria-label="Choose memories that show a handwritten scrap"
            >
              <p className="mb-2.5 font-serif text-[11px] font-light leading-relaxed text-[#5c6654]">
                Tick a corner of the room — a scrap may appear, like a note left on the desk.
              </p>
              <ul className="divide-y divide-[#dde5d4]/80">
                {MEMORIES.map((m) => (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 py-2.5 transition-colors duration-200 hover:bg-[#f0f4e8]/50">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border-[#a8b89a]/60 text-[#7d9470] accent-[#8faa7c]"
                        checked={!!paperEnabledById[m.id]}
                        onChange={() => onTogglePaperFor(m.id)}
                      />
                      <span className="min-w-0 font-serif text-[11px] font-light leading-snug text-[#4a5242]">
                        {m.title}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function useObjectUrl(file: File) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => {
      useLoader.clear(THREE.TextureLoader, u);
      URL.revokeObjectURL(u);
    };
  }, [file]);

  return url;
}

export type DormMemorySceneProps = {
  photoFile: File;
  fileLabel?: string | null;
  onChangePlace: () => void;
};

export function DormMemoryScene({ photoFile, fileLabel, onChangePlace }: DormMemorySceneProps) {
  const [selected, setSelected] = useState<MemoryEcho | null>(null);
  const [lampOn, setLampOn] = useState(true);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [monitorLines, setMonitorLines] = useState<string[]>([]);
  const [monitorDraft, setMonitorDraft] = useState("");
  const typingGlowRef = useRef(0);
  const objectUrl = useObjectUrl(photoFile);
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [paperEnabledById, setPaperEnabledById] = useState<Partial<Record<MemoryId, boolean>>>({
    desk: true,
    bed: true,
    window: true,
  });
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<MemoryId>>(() => new Set());

  const handleSelect = useCallback((m: MemoryEcho) => {
    // Keep selection stable so per-object UI (e.g. size controls) does not flicker off.
    setSelected(m);
  }, []);

  const toggleObjectHidden = useCallback((id: MemoryId) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setSelected((s) => (s?.id === id ? null : s));
      }
      return next;
    });
  }, []);

  const togglePaperFor = useCallback((id: MemoryId) => {
    setPaperEnabledById((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const handleTypingKey = useCallback((key: string) => {
    if (key === "\b" || key === "Backspace") {
      setMonitorDraft((d) => d.slice(0, -1));
      return;
    }
    if (key === "\n" || key === "Enter") {
      setMonitorDraft((currentDraft) => {
        const t = currentDraft.trim();
        if (t) {
          setMonitorLines((p) => [...p.slice(-12), t]);
        } else {
          const pool = MONITOR_WHISPERS;
          const w = pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? "";
          setMonitorLines((p) => [...p.slice(-12), w]);
        }
        typingGlowRef.current = Math.min(1, typingGlowRef.current + 0.28);
        return "";
      });
      return;
    }
    if (key.length === 1) {
      setMonitorDraft((d) => d + key);
      typingGlowRef.current = Math.min(1, typingGlowRef.current + 0.1);
    }
  }, []);

  useEffect(() => {
    if (!keyboardFocused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setKeyboardFocused(false);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        handleTypingKey("\b");
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleTypingKey("\n");
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        handleTypingKey(e.key);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keyboardFocused, handleTypingKey]);

  if (!objectUrl) {
    return (
      <div className="relative flex h-svh w-full flex-col items-center justify-center bg-[#f2ede4] px-6 text-center font-serif text-sm font-light text-[#6b7264]">
        <p className="max-w-xs leading-relaxed">Opening your photograph…</p>
        <button
          type="button"
          onClick={onChangePlace}
          className="mt-8 rounded-full border border-[#c5d4b8]/60 bg-[#faf8f3]/70 px-5 py-2.5 text-xs text-[#5a6248] backdrop-blur-sm transition-all duration-300 hover:border-[#a8b89a]"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-svh w-full overflow-hidden bg-[#ebe4d8]">
      <Canvas
        key={objectUrl}
        className="touch-none"
        shadows={false}
        camera={{ position: [0.2, 1.36, 4.05], fov: 40, near: 0.1, far: 45 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.98;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = false;
          scene.fog = new THREE.Fog("#e8e8e0", 7.5, 20);
        }}
        onPointerMissed={() => {
          setSelected(null);
          setNotesPanelOpen(false);
          setKeyboardFocused(false);
        }}
      >
        <color attach="background" args={["#e8e2d6"]} />
        <Suspense fallback={null}>
          <YaleDormRoom
            photoUrl={objectUrl}
            selectedId={selected?.id ?? null}
            onSelectMemory={handleSelect}
            paperEnabledById={paperEnabledById}
            lampOn={lampOn}
            onLampChange={setLampOn}
            keyboardFocused={keyboardFocused}
            onKeyboardFocusedChange={setKeyboardFocused}
            monitorLines={monitorLines}
            monitorDraft={monitorDraft}
            typingGlowRef={typingGlowRef}
            hiddenIds={hiddenIds}
          />
        </Suspense>
      </Canvas>

      {keyboardFocused ? (
        <VirtualKeyboard onKey={handleTypingKey} onDismiss={() => setKeyboardFocused(false)} />
      ) : null}

      <GhibliRoomChrome
        lampOn={lampOn}
        onLampBrightness={setLampOn}
        notesPanelOpen={notesPanelOpen}
        onNotesPanelOpenChange={setNotesPanelOpen}
        paperEnabledById={paperEnabledById}
        onTogglePaperFor={togglePaperFor}
        hasSelection={!!selected}
        selectedId={selected?.id ?? null}
        hiddenIds={hiddenIds}
        onToggleObjectHidden={toggleObjectHidden}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-6 pt-7 sm:px-9">
        <p className="text-[9px] font-light uppercase tracking-[0.38em] text-[#7a8472]">MyEchos</p>
        <h1 className="mt-3 max-w-md font-serif text-[1.15rem] font-light leading-snug tracking-tight text-[#454d3f] sm:text-[1.28rem]">
          A quiet room that still knows your name
        </h1>
        {fileLabel ? (
          <p className="mt-2 max-w-xs truncate font-serif text-[11px] font-light text-[#6f7568]" title={fileLabel}>
            {fileLabel}
          </p>
        ) : null}
      </header>

      <button
        type="button"
        onClick={onChangePlace}
        className="absolute top-7 right-6 z-20 rounded-full border border-[#c5d0b8]/55 bg-[#faf8f2]/55 px-4 py-2 font-serif text-[12px] font-light text-[#5a6248] shadow-[0_6px_28px_rgba(95,100,80,0.1)] backdrop-blur-md transition-all duration-[380ms] ease-out hover:border-[#a8b89a]/65 hover:bg-[#fffdf8]/65 sm:top-8 sm:right-9"
      >
        Another place
      </button>

      <p className="pointer-events-none absolute bottom-6 left-6 z-10 max-w-[18rem] font-serif text-[11px] font-light leading-relaxed text-[#5f6658] sm:left-9">
        Drag slowly to look around. Shift-drag to spin a piece, or use the small ring when it is chosen. Each thing can be
        moved on its own — nothing is stuck to the desk. Tap the keyboard to write. The window curtains by the bed — pull
        the cord or touch the fabric — let daylight in or draw the room inward. Arrow keys move the view unless you are
        typing.
      </p>
    </div>
  );
}

export type { MemoryEcho, MemoryId } from "./dorm/memoryData";
