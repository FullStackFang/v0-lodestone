"use client";

/** The field drawn: the card at the centre, its neighbours fanned out by
 *  closeness, the neighbour line as a dashed ring. Canvas 2D at a fixed
 *  logical size, scaled by CSS. A peer card opens on click; a paper or patent
 *  opens its own page in a new tab when it has one. */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Field, FieldNode } from "@/lodestone/field";

const W = 1390;
const H = 720;
const CX = W / 2;
const CY = H / 2 - 10;
const INK = "#0f1922";
const PAPER = "#fcfbf8";
const PLUM = "#72307c";
const TEAL = "#14494f";
const LIME = "#e5ff66";
const PINK = "#f3adff";
const META = "#6f736e";

interface Placed extends FieldNode {
  tx: number; ty: number; x: number; y: number; p: number; rank: number;
}

const radius = (score: number) => 120 + (0.92 - score) * 1500;

function place(nodes: FieldNode[]): Placed[] {
  const n = nodes.length;
  return nodes.map((node, i) => {
    const r = radius(node.score);
    const ang = -Math.PI / 2 + (i * (Math.PI * 2)) / n + (i % 2 ? 0.18 : -0.18);
    const x = CX + Math.cos(ang) * r * 1.55;
    const y = CY + Math.sin(ang) * r * 0.86;
    return { ...node, rank: i, tx: Math.max(90, Math.min(W - 90, x)), ty: Math.max(70, Math.min(H - 110, y)), x: CX, y: CY, p: 0 };
  });
}

function draw(ctx: CanvasRenderingContext2D, field: Field, nodes: Placed[], hover: number) {
  const ring = radius(field.line);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(15,25,34,.07)";
  for (let x = 20; x < W; x += 28) for (let y = 20; y < H; y += 28) { ctx.beginPath(); ctx.arc(x, y, 1, 0, 7); ctx.fill(); }

  ctx.save(); ctx.translate(CX, CY); ctx.scale(1.55, 0.86);
  ctx.beginPath(); ctx.setLineDash([5, 7]); ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(114,48,124,.55)"; ctx.arc(0, 0, ring, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  ctx.fillStyle = PLUM; ctx.font = "600 9.5px Geist, system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(`${field.line.toFixed(2)} NEIGHBOUR LINE`, CX, CY - ring * 0.86 - 8);

  nodes.forEach((nd, i) => {
    const dim = hover >= 0 && hover !== i;
    const peer = nd.kind === "peer";
    ctx.globalAlpha = nd.p * (dim ? 0.25 : 1);
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(nd.x, nd.y);
    if (nd.close) { ctx.lineWidth = 2; ctx.strokeStyle = peer ? PLUM : TEAL; ctx.setLineDash([]); }
    else { ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(15,25,34,.3)"; ctx.setLineDash([3, 5]); }
    ctx.stroke(); ctx.setLineDash([]);
    if (hover === i || (hover < 0 && nd.close)) {
      const mx = (CX + nd.x) / 2, my = (CY + nd.y) / 2;
      ctx.fillStyle = PAPER; ctx.fillRect(mx - 18, my - 9, 36, 16);
      ctx.fillStyle = nd.close ? (peer ? PLUM : TEAL) : "#5c6066"; ctx.font = "500 11px Geist, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(nd.score.toFixed(2), mx, my + 3);
    }
    ctx.globalAlpha = 1;
  });

  nodes.forEach((nd, i) => {
    const dim = hover >= 0 && hover !== i;
    const peer = nd.kind === "peer";
    ctx.globalAlpha = nd.p * (dim ? 0.3 : 1);
    const color = peer ? PLUM : TEAL;
    if (peer) { ctx.beginPath(); ctx.arc(nd.x, nd.y, hover === i ? 17 : 14, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = PAPER; ctx.stroke(); }
    else if (nd.kind === "patent") { ctx.beginPath(); ctx.rect(nd.x - 8, nd.y - 8, 16, 16); ctx.fillStyle = PAPER; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = color; ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(nd.x, nd.y, hover === i ? 11 : 9, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = PAPER; ctx.stroke(); }
    if (nd.close && peer) { ctx.beginPath(); ctx.arc(nd.x, nd.y, 22, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = LIME; ctx.stroke(); }
    const label = nd.title.length > 34 ? `${nd.title.slice(0, 33).trim()}…` : nd.title;
    ctx.fillStyle = INK; ctx.font = `${peer ? "500 13px" : "400 12px"} "Source Serif 4", Georgia, serif`; ctx.textAlign = "center";
    ctx.fillText(label, nd.x, nd.y + (peer ? 34 : 26));
    ctx.fillStyle = META; ctx.font = "400 10px Geist, system-ui, sans-serif";
    ctx.fillText(nd.meta, nd.x, nd.y + (peer ? 48 : 40));
    ctx.globalAlpha = 1;
  });

  const w = 300, h = 104;
  ctx.save(); ctx.shadowColor = "rgba(15,25,34,.35)"; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(CX - w / 2, CY - h / 2, w, h, 16); ctx.fill(); ctx.restore();
  ctx.fillStyle = field.center.mine ? LIME : PINK; ctx.font = "600 9px Geist, system-ui, sans-serif"; ctx.textAlign = "left";
  ctx.fillText(`${field.center.mine ? "YOUR CARD" : "PEER CARD"}  ·  ${field.center.owner.toUpperCase()}`, CX - w / 2 + 20, CY - h / 2 + 26);
  ctx.fillStyle = PAPER; ctx.font = '500 17px "Source Serif 4", Georgia, serif';
  const lines: string[] = [];
  let line = "";
  for (const wd of field.center.title.split(" ")) {
    const t = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(t).width > w - 40 && line) { lines.push(line); line = wd; } else line = t;
  }
  lines.push(line);
  lines.slice(0, 2).forEach((ln, i) => ctx.fillText(i === 1 && lines.length > 2 ? `${ln}…` : ln, CX - w / 2 + 20, CY - h / 2 + 54 + i * 22));
}

export function FieldStage({ field }: { field: Field }) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; text: string } | null>(null);
  const [hand, setHand] = useState(false);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nodes = place(field.nodes);
    let hover = -1;
    let raf = 0;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const t0 = performance.now(), D = 900, STAG = 70;
    const ease = (t: number) => 1 - Math.pow(2, -10 * Math.max(0, Math.min(1, t)));
    const tick = (now: number) => {
      let done = true;
      for (const nd of nodes) {
        const p = reduce ? 1 : ease((now - t0 - nd.rank * STAG) / D);
        if (p < 1) done = false;
        nd.p = p; nd.x = CX + (nd.tx - CX) * p; nd.y = CY + (nd.ty - CY) * p;
      }
      draw(ctx, field, nodes, hover);
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const pick = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (W / r.width), my = (e.clientY - r.top) * (H / r.height);
      let best = -1, bd = 26;
      nodes.forEach((nd, i) => { const d = Math.hypot(nd.x - mx, nd.y - my); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    const onMove = (e: MouseEvent) => {
      const i = pick(e);
      if (i === hover) return;
      hover = i;
      draw(ctx, field, nodes, hover);
      if (i < 0) { setTip(null); setHand(false); return; }
      const nd = nodes[i];
      const r = cv.getBoundingClientRect();
      const peer = nd.kind === "peer";
      setHand(peer || !!nd.href);
      setTip({
        x: (nd.x * r.width) / W, y: (nd.y * r.height) / H, title: nd.title,
        text: `${peer ? `${nd.meta} · peer card` : `${nd.kind}${nd.meta ? ` · ${nd.meta}` : ""}`} · cosine ${nd.score.toFixed(2)} · ${nd.close ? "within reach" : "below the line"}${peer ? " · click to open" : nd.href ? " · click to open the source" : ""}`,
      });
    };
    const onLeave = () => { hover = -1; draw(ctx, field, nodes, hover); setTip(null); setHand(false); };
    const onClick = (e: MouseEvent) => {
      const i = pick(e);
      if (i < 0) return;
      const nd = nodes[i];
      if (nd.kind === "peer" && nd.href) router.push(nd.href);
      else if (nd.href) window.open(nd.href, "_blank", "noopener");
    };
    cv.addEventListener("mousemove", onMove);
    cv.addEventListener("mouseleave", onLeave);
    cv.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("mousemove", onMove);
      cv.removeEventListener("mouseleave", onLeave);
      cv.removeEventListener("click", onClick);
    };
  }, [field, router]);

  return <>
    <canvas ref={canvas} className={hand ? "hand" : undefined} width={W} height={H} style={{ width: "100%", height: "auto", aspectRatio: "1390 / 720" }} role="img" aria-label="The card at the centre with its peers and prior art placed by closeness" />
    <div className={tip ? "tip show" : "tip"} style={tip ? { left: tip.x, top: tip.y } : undefined} aria-hidden="true">
      {tip ? <><b>{tip.title}</b><span>{tip.text}</span></> : null}
    </div>
  </>;
}
