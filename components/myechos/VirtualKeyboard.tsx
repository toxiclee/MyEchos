"use client";

const ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

type VirtualKeyboardProps = {
  onKey: (key: string) => void;
  onDismiss: () => void;
};

export function VirtualKeyboard({ onKey, onDismiss }: VirtualKeyboardProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-3"
      role="dialog"
      aria-label="Soft typing window"
    >
      <div className="pointer-events-auto w-full max-w-[min(100%,24rem)] rounded-[1.35rem] border border-[#d7ddcd]/55 bg-[#f8f4eb]/90 px-2.5 py-2.5 shadow-[0_14px_40px_rgba(75,80,62,0.12)] backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between rounded-xl border border-[#dfe4d7]/65 bg-[#fcfaf4]/75 px-2 py-1">
          <p className="font-serif text-[10px] font-light tracking-wide text-[#737b69]">
            typing into the room...
          </p>
          <button
            type="button"
            className="rounded-full border border-[#e2d8ce]/80 bg-white/70 px-2 py-0.5 text-[10px] text-[#8a7d74] hover:bg-white/90"
            onClick={onDismiss}
          >
            close
          </button>
        </div>
        <p className="mb-2 text-center font-serif text-[9px] font-light tracking-wide text-[#7a8274]">
          each letter lands on the monitor like a small echo
        </p>
        <div className="flex flex-col gap-1">
          {ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1">
              {row.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="min-h-8 min-w-[1.65rem] rounded-xl border border-[#d8e0d4]/70 bg-[#fdfcf8]/75 px-1.5 font-serif text-[11px] font-light text-[#4d5248] shadow-[0_2px_8px_rgba(80,85,70,0.06)] transition-all duration-200 hover:bg-[#fffefb] active:scale-[0.98]"
                  onClick={() => onKey(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
          <div className="mt-0.5 flex justify-center gap-1">
            <button
              type="button"
              className="min-h-8 flex-1 max-w-[6rem] rounded-lg border border-[#e5ddd6]/90 bg-white/70 text-[10px] text-[#6b5f56]"
              onClick={() => onKey(" ")}
            >
              space
            </button>
            <button
              type="button"
              className="min-h-8 rounded-lg border border-[#e5ddd6]/90 bg-white/70 px-2 text-[10px] text-[#6b5f56]"
              onClick={() => onKey("\n")}
            >
              line
            </button>
            <button
              type="button"
              className="min-h-8 rounded-lg border border-[#e5ddd6]/90 bg-white/70 px-2 text-[10px] text-[#6b5f56]"
              onClick={() => onKey("\b")}
            >
              ⌫
            </button>
          </div>
          <button
            type="button"
            className="mt-1.5 w-full rounded-full border border-[#e0d5cc] py-1.5 text-[10px] text-[#8a7d74] hover:bg-white/60"
            onClick={onDismiss}
          >
            fold keyboard
          </button>
        </div>
      </div>
    </div>
  );
}
