import Rubric from "@/components/Rubric";
import { description, judgePairs, rubric } from "@/lib/data";
import { duckCorrect } from "@/lib/duck";

const flow = [
  { n: 1, t: "Collect SVGs", d: "Take ~1,000 clean SVGs from SVG-Stack. Each is a seed. Render it to a 384×384 PNG." },
  { n: 2, t: "Teacher annotates", d: "A big model (Qwen3.8-27B) looks at the picture and writes a description and a yes/no rubric." },
  { n: 3, t: "Build judge data", d: "Turn rubric items into (image, statement) → true/false pairs, including tricky false ones." },
  { n: 4, t: "Train the judge", d: "Fine-tune Qwen3.5-0.8B to answer yes or no for a statement about an image." },
  { n: 5, t: "Train the policy with GRPO", d: "Qwen3.5-0.8B writes SVGs from descriptions. The judge scores them against the rubric. Reward = share of items passed." },
  { n: 6, t: "Evaluate", d: "On unseen seeds, compare the judge score with the big teacher's score to catch reward hacking." },
];

export default function Page() {
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">SVG Drawer</p>
        <h1>Teach a tiny model to draw with SVG</h1>
        <p className="lead">
          Qwen3.5-0.8B reads a text description and writes an SVG. A small judge checks the drawing against a
          checklist. The share of boxes ticked is the reward used for reinforcement learning (GRPO).
        </p>
      </header>

      {/* 1. Workflow */}
      <section>
        <h2>1. The workflow</h2>
        <ol className="flow">
          {flow.map((s) => (
            <li key={s.n}>
              <span className="num">{s.n}</span>
              <div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <h3 className="sub">How the judge is trained (step 4)</h3>
        <p>
          The judge answers one question: <em>“Is this statement true for this image?”</em> with <code>yes</code> or{" "}
          <code>no</code>. To learn that, it needs many true <b>and</b> false statements. We make them from the
          teacher’s rubric, using the duck example below:
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Statement shown with the duck image</th>
                <th>Label</th>
                <th>How it is made</th>
              </tr>
            </thead>
            <tbody>
              {judgePairs.map((p) => (
                <tr key={p.type}>
                  <td><b>{p.type}</b></td>
                  <td>{p.stmt}</td>
                  <td>
                    <span className={p.label === null ? "pill" : p.label ? "pill yes" : "pill no"}>
                      {p.label === null ? "mixed" : p.label ? "yes" : "no"}
                    </span>
                  </td>
                  <td className="muted">{p.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="bullets">
          <li>About 15–20k pairs, balanced around 50 % yes / 50 % no.</li>
          <li>
            Every invented false statement is checked by the teacher first. If the detail is actually in the image
            (for example “water below the duck”), the pair is thrown away.
          </li>
          <li>
            Training: LoRA fine-tune, the loss is only on the single answer token. At use time we read{" "}
            <code>p(yes)</code> and say yes when it is above a threshold τ tuned on validation data.
          </li>
          <li>
            Pass bar: ≥ 90 % balanced accuracy against teacher labels and ≤ 10 % false positives on the invented
            statements, before the judge is allowed to score RL.
          </li>
        </ul>
      </section>

      {/* 2. Example */}
      <section>
        <h2>2. A simulated input and the expected output</h2>
        <div className="grid2">
          <div className="card">
            <p className="label">Input: the only thing the policy sees</p>
            <blockquote>{description}</blockquote>
          </div>
          <div className="card">
            <p className="label">Expected output: one SVG document</p>
            <div className="figure" dangerouslySetInnerHTML={{ __html: duckCorrect }} />
            <details>
              <summary>Show the SVG code</summary>
              <pre>{duckCorrect.replace(/></g, ">\n<")}</pre>
            </details>
          </div>
        </div>
        <p className="muted small">
          During training the same description comes with a hidden checklist, which the teacher wrote and verified
          from the original picture.
        </p>
      </section>

      {/* 3. Rubric matching */}
      <section>
        <h2>3. How the rubric scores a drawing</h2>
        <p>
          The rubric for this duck has {rubric.length} atomic, visual statements. <b>R0</b> (“the SVG is valid”) is
          checked by code. The judge answers the others, one by one, on the rendered image. Pick a candidate output
          to see its score.
        </p>
        <Rubric />
        <p className="muted small">
          Reward = (R0 + number of items the judge says yes to) ÷ (number of items + 1). Equal weights, no other
          judge. That gives GRPO a smooth signal: 0.0 → 0.3 → 0.8 → 1.0, not just right/wrong.
        </p>
      </section>

      {/* 4. Performance placeholder */}
      <section>
        <h2>4. Performance: Qwen3.5-0.8B before and after RL</h2>
        <div className="card placeholder">
          <p className="label">Placeholder: results will be added after training</p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Metric (test seeds)</th>
                  <th>Before RL (base)</th>
                  <th>After RL</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Valid SVG rate (R0)", "≥ 95 %"],
                  ["Judge rubric score", "n/a"],
                  ["Teacher-audited rubric score", "+0.15 over base"],
                  ["Judge − teacher gap", "≤ 0.10"],
                ].map(([m, t]) => (
                  <tr key={m}>
                    <td>{m}</td>
                    <td className="tbd">TBD</td>
                    <td className="tbd">TBD</td>
                    <td className="muted">{t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="chartbox">Before / after side-by-side renders and reward curve: coming soon</div>
        </div>
      </section>

      <footer>Based on PLAN.md in this repository.</footer>
    </main>
  );
}
