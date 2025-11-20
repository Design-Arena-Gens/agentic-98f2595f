/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WIDTH = 1280;
const HEIGHT = 720;

type RecordingState =
  | { status: "idle" }
  | { status: "recording"; startedAt: number }
  | { status: "processing" }
  | { status: "done"; url: string; size: number; fileName: string; durationMs: number }
  | { status: "error"; message: string };

function useCanvasAnimation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const [progress, setProgress] = useState(0);

  const drawFrame = useCallback((t: number, title: string, subtitle: string, theme: "electric" | "sunset") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background gradient
    const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    if (theme === "electric") {
      g.addColorStop(0, "#0f1530");
      g.addColorStop(1, "#0c2850");
    } else {
      g.addColorStop(0, "#251431");
      g.addColorStop(1, "#4e2a2a");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Animated orbs
    const orbs = 6;
    for (let i = 0; i < orbs; i++) {
      const phase = (t / 1000) * 0.35 + i * 0.6;
      const x = WIDTH / 2 + Math.cos(phase) * (300 + i * 15);
      const y = HEIGHT / 2 + Math.sin(phase * 1.3) * (180 + i * 12);
      const r = 120 + Math.sin(phase * 1.7) * 40;
      const orb = ctx.createRadialGradient(x, y, 10, x, y, r);
      if (theme === "electric") {
        orb.addColorStop(0, "rgba(0, 212, 255, 0.55)");
        orb.addColorStop(1, "rgba(0, 212, 255, 0)");
      } else {
        orb.addColorStop(0, "rgba(255, 180, 80, 0.55)");
        orb.addColorStop(1, "rgba(255, 180, 80, 0)");
      }
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Title and subtitle
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    const easedProgress = Math.min(1, progress);
    const titleY = HEIGHT * 0.38 - (1 - easedProgress) * 30;
    const subtitleY = HEIGHT * 0.52 - (1 - easedProgress) * 20;

    ctx.font = "800 64px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillText(title, WIDTH / 2, titleY);

    ctx.font = "400 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(subtitle, WIDTH / 2, subtitleY);

    // Progress indicator
    const barWidth = Math.min(WIDTH * 0.6, 720);
    const barX = (WIDTH - barWidth) / 2;
    const barY = HEIGHT - 60;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(barX, barY, barWidth, 8);
    const p = Math.max(0, Math.min(1, progress));
    const grad = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    grad.addColorStop(0, "#6aa3ff");
    grad.addColorStop(1, "#9b6bff");
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barWidth * p, 8);
  }, [progress]);

  const start = useCallback(
    (durationMs: number, title: string, subtitle: string, theme: "electric" | "sunset", onFrame?: (now: number) => void) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startTimeRef.current = performance.now();
      const tick = () => {
        const now = performance.now();
        const elapsed = now - startTimeRef.current;
        const prog = Math.min(1, elapsed / durationMs);
        setProgress(prog);
        drawFrame(elapsed, title, subtitle, theme);
        onFrame?.(now);
        if (elapsed < durationMs) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [drawFrame]
  );

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { canvasRef, start, stop };
}

function bytesToMb(b: number) {
  return (b / (1024 * 1024)).toFixed(2);
}

export default function Page() {
  const [title, setTitle] = useState("Your YouTube Title");
  const [subtitle, setSubtitle] = useState("Subtitle ? Created with Canvas + MediaRecorder");
  const [durationSec, setDurationSec] = useState(6);
  const [fps, setFps] = useState(30);
  const [theme, setTheme] = useState<"electric" | "sunset">("electric");
  const [state, setState] = useState<RecordingState>({ status: "idle" });
  const { canvasRef, start, stop } = useCanvasAnimation();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const supported = useMemo(() => {
    const mime = "video/webm;codecs=vp9,opus";
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
    if (MediaRecorder.isTypeSupported(mime)) return mime;
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) return "video/webm;codecs=vp8,opus";
    if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
    return null;
  }, []);

  const handleRecord = useCallback(async () => {
    try {
      if (!supported) {
        setState({ status: "error", message: "MediaRecorder not supported in this browser." });
        return;
      }
      const canvas = canvasRef.current!;
      // Ensure canvas size is 720p exactly
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const stream = (canvas as any).captureStream?.(fps) as MediaStream | undefined;
      if (!stream) {
        setState({ status: "error", message: "Canvas captureStream not supported." });
        return;
      }
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: supported,
        videoBitsPerSecond: 4_000_000, // ~4 Mbps for 720p
      });
      mediaRecorderRef.current = recorder;

      const durationMs = Math.max(1000, Math.round(durationSec * 1000));
      const fileName =
        "youtube-720p-" +
        new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-") +
        ".webm";

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      const startedAt = performance.now();
      setState({ status: "recording", startedAt });
      recorder.start(100); // collect data in 100ms chunks

      // Drive animation
      start(durationMs, title, subtitle, theme);

      // Stop after duration
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), durationMs);
      });
      recorder.stop();
      stop();
      setState({ status: "processing" });

      const blob = new Blob(chunksRef.current, { type: supported });
      const url = URL.createObjectURL(blob);
      setState({
        status: "done",
        url,
        size: blob.size,
        fileName,
        durationMs,
      });
    } catch (err: any) {
      setState({ status: "error", message: err?.message ?? "Recording failed." });
    }
  }, [canvasRef, durationSec, fps, start, stop, subtitle, supported, theme, title]);

  const reset = useCallback(() => {
    setState({ status: "idle" });
    chunksRef.current = [];
    mediaRecorderRef.current?.stop?.();
  }, []);

  const disabled = state.status === "recording" || state.status === "processing";

  return (
    <main className="container">
      <div className="card">
        <h1 className="title">YouTube 720p Video Generator</h1>
        <p className="muted">
          Create a 1280?720 WebM video in your browser. Upload directly to YouTube.
        </p>

        <div className="controls">
          <div className="control">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Video title" />
          </div>
          <div className="control">
            <label>Subtitle</label>
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle" />
          </div>
          <div className="control">
            <label>Duration (seconds)</label>
            <input
              type="number"
              min={2}
              max={60}
              value={durationSec}
              onChange={(e) => setDurationSec(Number(e.target.value))}
            />
          </div>
          <div className="control">
            <label>Frame rate</label>
            <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
              <option value={24}>24 fps</option>
              <option value={25}>25 fps</option>
              <option value={30}>30 fps</option>
              <option value={50}>50 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </div>
          <div className="control">
            <label>Theme</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value as any)}>
              <option value="electric">Electric (cool)</option>
              <option value="sunset">Sunset (warm)</option>
            </select>
          </div>
        </div>

        <div className="actions">
          <button onClick={handleRecord} disabled={disabled}>
            {state.status === "recording" ? "Recording?" : "Create 720p Video"}
          </button>
          {state.status !== "idle" && (
            <button onClick={reset} disabled={state.status === "recording"} style={{ background: "rgba(255,255,255,0.14)" }}>
              Reset
            </button>
          )}
        </div>
        <div className="hint">
          Note: The generated file is WebM (VP8/VP9). YouTube accepts WebM uploads.
        </div>

        <div className="canvasWrap">
          <canvas ref={canvasRef} style={{ width: "100%", maxWidth: "960px", borderRadius: 12 }} width={WIDTH} height={HEIGHT} />
          {state.status === "recording" && (
            <div className="muted">Recording? your video is being captured.</div>
          )}
          {state.status === "processing" && <div className="muted">Processing? finalizing your video file.</div>}
          {state.status === "done" && (
            <div>
              <a className="download" href={state.url} download={state.fileName}>
                Download video ({bytesToMb(state.size)} MB)
              </a>
              <div className="hint">
                Duration: {(state.durationMs / 1000).toFixed(2)}s ? Resolution: 1280?720 ? FPS: {fps}
              </div>
            </div>
          )}
          {state.status === "error" && <div style={{ color: "#ffb4b4" }}>Error: {state.message}</div>}
        </div>
      </div>
    </main>
  );
}

