import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const volume = readFileSync("src/components/player/LiveVolumeControl.tsx", "utf8");
const glass = readFileSync("src/styles/live-glass-panels.css", "utf8");
const player = readFileSync("src/components/player/LivePlayer.tsx", "utf8");

describe("Live player lightweight glass controls", () => {
  test("volume remains a real range with percent, mute, keyboard and remote steps", () => {
    expect(volume).toContain('role="dialog"');
    expect(volume).toContain('type="range" min="0" max="100" step="1"');
    expect(volume).toContain('aria-label="Diminuir volume"');
    expect(volume).toContain('aria-label="Aumentar volume"');
    expect(volume).toContain('aria-label="Fechar volume"');
    expect(volume).toContain("onMute");
    expect(volume).toContain('event.key === "Escape"');
    expect(volume).toContain("trigger.current?.focus()");
    expect(volume).toContain('style={rangeStyle}');
  });
  test("volume, source settings and casting menus use translucent, scoped styling", () => {
    expect(glass).toContain(".zf-volume-panel, .zf-player-menu, .zang-cast-menu");
    expect(glass).toContain("rgba(22, 32, 46, .70)");
    expect(glass).toContain("backdrop-filter: blur(8px)");
    expect(glass).toContain(".zang-cast-mobile-overlay .zang-cast-menu");
    expect(glass).toContain('html[data-zf-platform="tv"]');
    expect(glass).not.toContain(".ydo-live-video {");
    expect(player).toContain('import "@/styles/live-glass-panels.css"');
  });
  test("sports playback defaults to smooth while keeping a user-selected mode", () => {
    expect(player).toContain("preferredLiveLatencyMode(canal.categoria, canal.nome, saved)");
    expect(player).toContain('localStorage.setItem("zangflix:live-latency-mode", next)');
    expect(player).toContain("Modo fluido · sem aceleração");
    expect(player).toContain("hlsLatencyOptions(latencyMode)");
  });
});
