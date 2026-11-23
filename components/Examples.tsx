"use client";
import { useState } from "react";
import examples from "@/lib/examples.json";

// SVGs are model outputs: render through <img> data URI so scripts never run and styles stay isolated.
const uri = (svg: string) => "data:image/svg+xml;utf8," + encodeURIComponent(svg);

export default function Examples() {
  const [i, setI] = useState(0);
  const e = examples[i];
  const panels = [
    { t: "Original seed", svg: e.seed, s: null as number | null },
    { t: "Before RL (base)", svg: e.base, s: e.base_score },
    { t: "After RL (trained)", svg: e.policy, s: e.policy_score },
  ];
  return (
    <div className="card">
      <div className="tabs" role="tablist">
        {examples.map((x, k) => (
          <button key={x.id} role="tab" aria-selected={k === i} onClick={() => setI(k)}>
            {x.domain}{x.kind === "loss" ? " (failure)" : ""}
          </button>
        ))}
      </div>
      <blockquote>{e.description}</blockquote>
      <div className="grid3">
        {panels.map((p) => (
          <div key={p.t}>
            <p className="label">{p.t}{p.s !== null ? ` · teacher score ${p.s.toFixed(2)}` : ""}</p>
            <div className="figure"><img src={uri(p.svg)} alt={p.t} width="100%" /></div>
          </div>
        ))}
      </div>
      <details>
        <summary>Rubric and trained model SVG code</summary>
        <ul className="bullets">{e.rubric.map((r: any) => <li key={r.id}>{r.text}</li>)}</ul>
        <pre>{e.policy}</pre>
      </details>
    </div>
  );
}
