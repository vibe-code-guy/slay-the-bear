"use client";
// Bottom right of the scene: sound effects on or off, and the music (off until you turn it on)
// with its volume.
import { useEffect, useState } from "react";
import { musicState, onMusicChange, setMusic, setMusicVolume } from "@/lib/music";
import { isMuted, onMuteChange, setMuted, unlockAudio } from "@/lib/sfx";

export function SoundControls() {
  const [muted, setMutedState] = useState(false);
  const [music, setMusicState] = useState({ on: false, volume: 0.5 });

  useEffect(() => {
    setMutedState(isMuted());
    setMusicState(musicState());
    const a = onMuteChange(setMutedState);
    const b = onMusicChange(() => setMusicState(musicState()));
    return () => {
      a();
      b();
    };
  }, []);

  return (
    <div className="absolute bottom-2 right-2 z-30 flex items-center gap-1">
      {music.on && (
        <label className="hidden items-center rounded-full bg-black/60 px-2 py-1 @xl:flex" title="Music volume">
          <span className="sr-only">Music volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={music.volume}
            onChange={(e) => setMusicVolume(Number(e.target.value))}
            className="h-1 w-20 accent-[#f59e0b]"
          />
        </label>
      )}
      <button
        type="button"
        className={`rounded-full px-2 py-1 text-sm ${music.on ? "bg-ember/80 text-night" : "bg-black/60"}`}
        aria-label={music.on ? "Turn the music off" : "Turn the music on"}
        aria-pressed={music.on}
        title={music.on ? "Music on" : "Music off"}
        onClick={() => {
          void unlockAudio();
          setMusic(!music.on);
        }}
      >
        🎵
      </button>
      <button
        type="button"
        className="rounded-full bg-black/60 px-2 py-1 text-sm"
        aria-label={muted ? "Turn sound on" : "Mute"}
        onClick={() => {
          void unlockAudio();
          setMuted(!muted);
        }}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </div>
  );
}
