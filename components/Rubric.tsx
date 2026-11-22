"use client";
import { useState } from "react";
import { candidates, rubric } from "@/lib/data";

export default function Rubric() {
  const [i, setI] = useState(3);
  const c = candidates[i];
  const passed = c.r0 ? 1 + c.pass.length : 0;
  const total = rubric.length + 1;
  const reward = c.r0 ? passed / total : 0;

  return (
    <div className="card">
      <div className="tabs" role="tablist">
        {candidates.map((x, k) => (
          <button key={x.key} role="tab" aria-selected={k === i} onClick={() => setI(k)}>
            {x.name}
          </button>
        ))}
      </div>

      <div className="grid2">
        <div>
          <div className="figure">
            {c.svg ? (
              <div dangerouslySetInnerHTML={{ __html: c.svg }} />
            ) : (
              <div className="broken">No image: the SVG could not be rendered</div>
            )}
          </div>
          <p className="muted small">{c.note}</p>
        </div>

        <div>
          <ul className="items">
            <li className={c.r0 ? "ok" : "ko"}>
              <span className="mark">{c.r0 ? "✓" : "✗"}</span>
              <b>R0</b> Valid, renderable SVG <em>(checked by code)</em>
            </li>
            {rubric.map((r) => {
              const ok = c.r0 && c.pass.includes(r.id);
              return (
                <li key={r.id} className={ok ? "ok" : "ko"}>
                  <span className="mark">{ok ? "✓" : "✗"}</span>
                  <b>{r.id}</b> {r.text}
                </li>
              );
            })}
          </ul>
          <div className="reward">
            reward = {passed} / {total} = <strong>{reward.toFixed(1)}</strong>
            {!c.r0 && <span className="muted small"> (R0 failed, so everything is 0)</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
