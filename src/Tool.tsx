// Captionary: write or import captions, style them in your own type, and burn them into the video in the browser.
import { useEffect, useRef, useState } from "react";
import { download, uid, useStored } from "./lib/store";
import { Section } from "./ui/kit";

const T = "captionary";
type Cue = { id: string; start: number; end: number; text: string };
type Style = { font: string; size: number; color: string; box: string; boxAlpha: number; pos: "bottom" | "middle" | "top"; upper: boolean; weight: number };
const FONTS = ["Hanken Grotesk", "Gloock", "DM Mono", "Georgia", "Arial"];
const DEFAULT_STYLE: Style = { font: "Hanken Grotesk", size: 6, color: "#FFFFFF", box: "#151933", boxAlpha: 0.75, pos: "bottom", upper: false, weight: 700 };
const SAMPLE: Cue[] = [
  { id: "c1", start: 0.2, end: 2.4, text: "This is the glaze test that went wrong." },
  { id: "c2", start: 2.6, end: 4.8, text: "[kiln door creaks]" },
  { id: "c3", start: 5, end: 8, text: "And this is what it looked like after." },
];

const ts = (s: number, sep = ",") => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60), ms = Math.round((s % 1) * 1000); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}${sep}${String(ms).padStart(3, "0")}`; };
const parseT = (s: string) => { const [a, b = "0"] = s.trim().replace(",", ".").split("."); const p = a.split(":").map(Number); while (p.length < 3) p.unshift(0); return p[0] * 3600 + p[1] * 60 + p[2] + Number("0." + b); };
function parseSubs(text: string): Cue[] {
  return text.replace(/\r/g, "").split(/\n\s*\n/).map(block => {
    const lines = block.split("\n").filter(l => l.trim() && l.trim() !== "WEBVTT");
    const ti = lines.findIndex(l => l.includes("-->"));
    if (ti < 0) return null;
    const [a, b] = lines[ti].split("-->");
    return { id: uid(), start: parseT(a), end: parseT(b.split(" ")[1] ?? b), text: lines.slice(ti + 1).join("\n") };
  }).filter(Boolean) as Cue[];
}
const toSrt = (cues: Cue[]) => cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}`).join("\n\n");
const toVtt = (cues: Cue[]) => "WEBVTT\n\n" + cues.map(c => `${ts(c.start, ".")} --> ${ts(c.end, ".")}\n${c.text}`).join("\n\n");

function drawCaption(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, st: Style) {
  const fs = Math.round((h * st.size) / 100);
  const isDesc = /^\[.*\]$/.test(text.trim());
  ctx.font = `${isDesc ? "italic " : ""}${st.weight} ${fs}px "${st.font}", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const t = st.upper ? text.toUpperCase() : text;
  const maxW = w * 0.86, lines: string[] = [];
  for (const para of t.split("\n")) { let cur = ""; for (const word of para.split(" ")) { const test = cur ? cur + " " + word : word; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; } else cur = test; } lines.push(cur); }
  const lh = fs * 1.25, blockH = lines.length * lh;
  const cy = st.pos === "top" ? h * 0.1 + blockH / 2 : st.pos === "middle" ? h / 2 : h * 0.9 - blockH / 2;
  lines.forEach((ln, i) => {
    const y = cy - blockH / 2 + lh * (i + 0.5), tw = ctx.measureText(ln).width, pad = fs * 0.35;
    if (st.boxAlpha > 0) { ctx.globalAlpha = st.boxAlpha; ctx.fillStyle = st.box; ctx.fillRect(w / 2 - tw / 2 - pad, y - lh / 2, tw + pad * 2, lh); ctx.globalAlpha = 1; }
    ctx.fillStyle = st.color; ctx.fillText(ln, w / 2, y);
  });
}

export default function Captionary() {
  const [cues, setCues] = useStored<Cue[]>(T, "cues", SAMPLE);
  const [st, setSt] = useStored<Style>(T, "style", DEFAULT_STYLE);
  const [src, setSrc] = useState("");
  const [name, setName] = useState("video");
  const [now, setNow] = useState(0);
  const [typed, setTyped] = useState("");
  const [render, setRender] = useState<{ pct: number; url?: string; err?: string } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const active = sorted.filter(c => now >= c.start && now <= c.end);

  // Live preview: draw captions on a canvas over the video (or a placeholder when no video is loaded).
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const v = video.current;
    const w = (c.width = v?.videoWidth || 1280), h = (c.height = v?.videoHeight || 720);
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    if (!src) { ctx.fillStyle = "#2B3050"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "#A0A6C0"; ctx.font = `${h * 0.04}px "DM Mono"`; ctx.textAlign = "center"; ctx.fillText("Your video appears here", w / 2, h * 0.4); }
    active.forEach(cu => drawCaption(ctx, cu.text, w, h, st));
  }, [now, st, cues, src, active]);

  useEffect(() => {
    if (!src) { const id = setInterval(() => setNow(n => (n + 0.1) % 9), 100); return () => clearInterval(id); }
  }, [src]);

  const addAtNow = () => {
    if (!typed.trim()) return;
    const start = video.current?.currentTime ?? now;
    setCues([...cues, { id: uid(), start: Math.round(start * 10) / 10, end: Math.round((start + Math.max(1.5, typed.split(" ").length * 0.4)) * 10) / 10, text: typed.trim() }]);
    setTyped("");
  };
  const set = (id: string, p: Partial<Cue>) => setCues(cues.map(c => (c.id === id ? { ...c, ...p } : c)));

  const burn = async () => {
    const v = video.current; if (!v || !src) return;
    const w = v.videoWidth, h = v.videoHeight;
    const out = document.createElement("canvas"); out.width = w; out.height = h;
    const ctx = out.getContext("2d")!;
    const stream = out.captureStream(30);
    try {
      const vs = (v as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      vs?.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch { /* video without audio */ }
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(m => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => { setRender({ pct: 100, url: URL.createObjectURL(new Blob(chunks, { type: mime || "video/webm" })) }); v.muted = false; };
    v.currentTime = 0; v.muted = false;
    await new Promise(r => (v.onseeked = r));
    rec.start(250);
    setRender({ pct: 0 });
    const frame = () => {
      ctx.drawImage(v, 0, 0, w, h);
      sorted.filter(c => v.currentTime >= c.start && v.currentTime <= c.end).forEach(c => drawCaption(ctx, c.text, w, h, st));
      setRender({ pct: Math.round((v.currentTime / v.duration) * 100) });
      if (!v.ended && !v.paused) requestAnimationFrame(frame); else if (rec.state === "recording") rec.stop();
    };
    v.onended = () => { if (rec.state === "recording") rec.stop(); };
    await v.play().catch(err => setRender({ pct: 0, err: String(err) }));
    requestAnimationFrame(frame);
  };

  return (
    <div className="stack">
      <div className="grid2">
        <Section title="Video" aside={<label className="btn small primary">Choose video<input type="file" accept="video/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { setSrc(URL.createObjectURL(f)); setName(f.name.replace(/\.[^.]+$/, "")); setRender(null); } }} /></label>}>
          <div className="cp-stage">
            {src && <video ref={video} src={src} controls playsInline onTimeUpdate={e => setNow(e.currentTarget.currentTime)} onLoadedMetadata={e => setNow(e.currentTarget.currentTime + 0.001)} />}
            <canvas ref={canvas} className={src ? "cp-over" : "cp-solo"} aria-label="Caption preview" />
          </div>
          <form className="row" style={{ marginTop: 12 }} onSubmit={e => { e.preventDefault(); addAtNow(); }}>
            <label className="field" style={{ flexGrow: 4 }}><span>Pause the video, type what is said, press Enter</span><input id="cp-typed" className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder="[music] or what the speaker says" /></label>
            <button className="btn" type="submit">Add at {now.toFixed(1)}s</button>
          </form>
          <p className="note" style={{ marginTop: 6 }}>Text in [brackets] shows in italics as a sound or visual description.</p>
        </Section>
        <Section title="Style">
          <div className="stack" style={{ gap: 10 }}>
            <div className="row">
              <label className="field"><span>Font</span><select id="cp-font" className="input" value={st.font} onChange={e => setSt({ ...st, font: e.target.value })}>{FONTS.map(f => <option key={f}>{f}</option>)}</select></label>
              <label className="field"><span>Weight</span><select id="cp-weight" className="input" value={st.weight} onChange={e => setSt({ ...st, weight: +e.target.value })}>{[400, 500, 600, 700].map(x => <option key={x}>{x}</option>)}</select></label>
              <label className="field"><span>Position</span><select id="cp-pos" className="input" value={st.pos} onChange={e => setSt({ ...st, pos: e.target.value as Style["pos"] })}><option value="bottom">Bottom</option><option value="middle">Middle</option><option value="top">Top</option></select></label>
            </div>
            <label className="field"><span>Size: {st.size}% of video height</span><input id="cp-size" type="range" min={3} max={12} step={0.5} value={st.size} onChange={e => setSt({ ...st, size: +e.target.value })} /></label>
            <div className="row">
              <label className="field"><span>Text colour</span><input id="cp-color" type="color" className="input" style={{ height: 42, padding: 2 }} value={st.color} onChange={e => setSt({ ...st, color: e.target.value })} /></label>
              <label className="field"><span>Box colour</span><input id="cp-box" type="color" className="input" style={{ height: 42, padding: 2 }} value={st.box} onChange={e => setSt({ ...st, box: e.target.value })} /></label>
              <label className="field"><span>Box opacity</span><input id="cp-alpha" type="range" min={0} max={1} step={0.05} value={st.boxAlpha} onChange={e => setSt({ ...st, boxAlpha: +e.target.value })} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={st.upper} onChange={e => setSt({ ...st, upper: e.target.checked })} />Capital letters</label>
          </div>
        </Section>
      </div>

      <Section title={`Captions (${cues.length})`} aside={<>
        <label className="btn small">Import SRT or VTT<input type="file" accept=".srt,.vtt,text/vtt" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) setCues(parseSubs(await f.text())); }} /></label>
        <button className="btn small" onClick={() => download(`${name}.srt`, toSrt(sorted), "text/plain")}>Download SRT</button>
        <button className="btn small" onClick={() => download(`${name}.vtt`, toVtt(sorted), "text/vtt")}>Download VTT</button>
      </>}>
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Start</th><th>End</th><th>Text</th><th /></tr></thead>
          <tbody>{sorted.map(c => (
            <tr key={c.id} style={{ background: active.includes(c) ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined }}>
              <td><input className="input num" style={{ width: 80 }} aria-label="Start seconds" value={c.start} onChange={e => set(c.id, { start: parseFloat(e.target.value) || 0 })} /></td>
              <td><input className="input num" style={{ width: 80 }} aria-label="End seconds" value={c.end} onChange={e => set(c.id, { end: parseFloat(e.target.value) || 0 })} /></td>
              <td><input className="input" aria-label="Caption text" value={c.text} onChange={e => set(c.id, { text: e.target.value })} /></td>
              <td className="r" style={{ whiteSpace: "nowrap" }}>
                {src && <button className="btn ghost small" onClick={() => { if (video.current) video.current.currentTime = c.start; }}>Go</button>}
                <button className="btn ghost small danger" onClick={() => setCues(cues.filter(x => x.id !== c.id))}>Delete</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </Section>

      <Section title="Burn captions into the video">
        {!src ? <p className="empty-note">Choose a video first.</p> : (
          <div className="stack" style={{ gap: 12 }}>
            <p>The video plays once while it records with your captions drawn in. Keep this tab open until it finishes.</p>
            <div className="row" style={{ alignItems: "center" }}>
              <button className="btn primary" onClick={burn} disabled={!!render && render.pct < 100 && !render.err}>Burn in captions</button>
              {render && !render.url && !render.err && <span className="pill warn">Recording… {render.pct}%</span>}
              {render?.err && <span className="pill bad">{render.err}</span>}
              {render?.url && <a className="btn" href={render.url} download={`${name}-captioned.webm`}>Download captioned video</a>}
            </div>
            <p className="note">Saves as WebM, which YouTube, Instagram and TikTok accept.</p>
          </div>
        )}
      </Section>
      <style>{`.cp-stage{position:relative;border-radius:8px;overflow:hidden;background:#000}.cp-stage video{display:block;width:100%}.cp-over{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.cp-solo{display:block;width:100%;aspect-ratio:16/9}`}</style>
    </div>
  );
}
