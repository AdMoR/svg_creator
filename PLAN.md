# SVG Drawer: text-to-SVG with GRPO (handoff plan)

Status: **plan v2, approved decisions, nothing built yet** (2026-11-22).
Human-readable version of this plan: https://claude.ai/artifact/7n3ozkUywKjdSmE1V3ESyN (same content, plus visual examples).

This file is written for an agent who picks up the project cold. Read sections 1–4 before writing code. Section 5 holds the phase-by-phase tasks with acceptance criteria. Section 6 has the schemas and prompts. Section 9 lists what must be verified rather than assumed.

---

## 1. Goal in one paragraph

Train **Qwen3.5-0.8B** with **GRPO** to generate SVG from a text description. Training data is built from StarVector's **SVG-Stack** (`starvector/svg-stack` on Hugging Face). Each SVG is a *seed*. We render it to PNG. A **teacher** (quantized Qwen3.8-27B with its vision projector) looks at the render and writes a detailed description, an atomic yes/no **rubric**, and difficulty tags. From those seeds we build a second dataset of `(image, rubric item) → true/false` pairs, with deliberate perturbations:
- removed details stay true,
- added, flipped or mismatched details are false,
- an added detail is kept only after checking it is absent from the image.

A **judge** (Qwen3.5-0.8B, LoRA fine-tuned) learns to answer these pairs. During GRPO, the **policy** (Qwen3.5-0.8B + LoRA) writes an SVG from the full description. We render it, the judge checks each rubric item, and the reward is the fraction of items passed. "Valid SVG" counts as item R0. Everything is tracked in **MLflow**, and each main step has a human review gate built on MLflow labeling sessions.

## 2. Glossary

| Term | Meaning |
|---|---|
| seed | One SVG from SVG-Stack that passed curation. `seed_id` = sha256 of the normalized SVG (first 16 hex chars). |
| render | SVG rasterized with resvg to **384×384 PNG on a white background**. The same settings are used everywhere (seeds, mutations, policy outputs). |
| description | Detailed, visual-only text description of the render (60–200 words). The **only** policy input. |
| short_prompt | A ≤15-word version of the description. Used **only** to build judge V1 pairs, never as policy input. |
| rubric | 5–15 atomic, visually checkable statements `R1..Rn`, each true for the seed render. `R0` = "output is valid, renderable SVG", checked by code. |
| control item | A statement known to be false for a render (added, flipped or mismatched detail). Used in judge data, and optionally appended to the reward (A7). |
| teacher | `unsloth/Qwen3.8-27B-GGUF` IQ4_XS + mmproj on `llama-server`. Runs **only** in P0, P2, P3 and P6. |
| judge | Qwen3.5-0.8B + LoRA that answers `yes`/`no` for (image, statement). |
| policy | Qwen3.5-0.8B + LoRA trained with GRPO to emit SVG. |
| gate | A human review checkpoint with a numeric pass criterion. A phase scales past its pilot only after the gate passes. |

## 3. Environment (observed 2026-11-22)

| Resource | State | Notes |
|---|---|---|
| Repo | `/media/amor/data/code_dw/svg_drawer`, git initialised, branch `master`, **no commits**, empty except this file | Main branch for PRs is `main`. Branch before committing. Commit only when the user asks. |
| GPU | RTX 4080, 16 GB | A process from `/media/amor/data/code_dw/neuron_personality_qwen` holds ~3.9 GB. **The user will pause it** during P2/P3/P5/P6. Check `nvidia-smi` before starting any GPU phase and ask the user if it is still running. Never kill it yourself. |
| RAM / CPU | 31 GB total (~16 GB free), 16 threads | No room for big CPU offload of the 27B. |
| Disk | `/media/amor/data`, 7.1 TB free | |
| Python | system 3.10.12; `uv` at `~/.local/bin/uv` | Create the project with Python 3.12 via uv. |
| MLflow | **3.18.0** server at `http://127.0.0.1:5000`, run from the other project's venv (`neuron_personality_qwen/.venv`), SQLite backend | Shared with another experiment. Use only experiments prefixed `svg_drawer/`. Do not restart or reconfigure the server. The MLflow install ships a skill at `.../site-packages/mlflow/assistant/skills/mlflow-trace-instrumentation/SKILL.md`; read it before writing tracing code. |
| llama.cpp | `/media/amor/data/code_dw/llama.cpp/build/bin/llama-server` and `llama-mtmd-cli` are built | Check that the build supports the Qwen3.8 architecture + mmproj (P0). Rebuild only if needed. |
| HF cache | `~/.cache/huggingface/hub/models--unsloth--Qwen3.8-27B-GGUF` and `models--Qwen--Qwen3.5-0.8B` exist but contain **refs only, no weights** | Download in P0. |
| Unsloth | Repo checkout at `/media/amor/data/code_dw/unsloth` | Fallback RL stack only. |

## 4. Decisions

### 4.1 User decisions (final, do not re-litigate)

| # | Decision |
|---|---|
| Q1 | Teacher = `unsloth/Qwen3.8-27B-GGUF` at **IQ4_XS** + its mmproj. Fall back to **UD-Q3_K_XL** only if IQ4_XS + mmproj + KV doesn't fit in ~15 GB even with 1 slot. |
| Q2 | The other experiment is paused during the teacher phases and GRPO. The full 16 GB is available. |
| Q3 | Reward is the **rubric only**. No separate "overall match" LLM judge. |
| Q4 | **1k seeds** for v1 (50-seed pilot first). Scale up only after first GRPO results. |
| Q5 | The policy trains on **full descriptions only**. |
| Q6 | **LoRA** for the policy in v1. |

### 4.2 Architecture decisions (agent may refine with evidence, log changes in MLflow run notes)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| A1 | Teacher serving | `llama-server` + GGUF + `--mmproj`, OpenAI-compatible API, 2 parallel slots (try 4 if memory allows), ctx 8k per slot, KV cache q8_0 | Already built. Supports vision and JSON-schema constrained output. MLflow OpenAI autolog traces every call. |
| A2 | Teacher thinking | Off (`chat_template_kwargs: {"enable_thinking": false}`). A/B on the 50-seed pilot; turn it on only if quality clearly improves | Throughput. |
| A3 | Renderer | `resvg` through the `resvg-py` package (if unavailable, the `resvg` CLI through subprocess), 384 px, white background, 2 s timeout. `cairosvg` only as a cross-check | Strict, fast, deterministic. Same renderer for seeds and policy outputs. |
| A4 | Judgment unit | (render PNG, single statement) → `yes`/`no` | Matches the binary rubric. Removals and additions become item-level operations. The judge sees pixels, so it can't be fooled by code. |
| A5 | Judge | Qwen3.5-0.8B (vision), LoRA SFT, single answer token. Verdict = `p(yes) > τ`, τ tuned on val | Calibrated probability, chat template intact. |
| A6 | Reward | `(R0 + Σ judge(Ri)) / (n + 1)`. If R0 fails, reward = 0. Equal weights | User spec. |
| A7 | Control items in reward | Off in GRPO run 1. On from run 2: append 2 control items per prompt, and each one the judge rejects counts as a pass | Stops a "draw everything" policy. |
| A8 | RL stack | TRL `GRPOTrainer`, vLLM colocate mode, custom reward function. Fallback: Unsloth GRPO if memory is short. Policy LoRA r=32, alpha 64, all linear layers | Simple on one GPU. |
| A9 | Judge at RL time | Loaded in the trainer process, bf16, eval mode, batched forward over all (rollout, item) pairs of a step. No generation, just the logits of the next token | No IPC. |
| A10 | Storage | Source of truth = Parquet + PNG under `data/` (git-ignored), one directory per run id. MLflow holds traces, metrics, eval datasets, prompts and review labels. Every parquet row carries the `trace_id` that produced it | Fast bulk I/O plus lineage. |
| A11 | Splits | Group by near-duplicate cluster (pHash of render, Hamming ≤ 4). **train 80 / val 10 / test 10** (~800/100/100). Test seeds are never used for judge or policy training | SVG-Stack has many near-duplicates. 10 % test allows tag slicing. |
| A12 | Prompts | Every LLM prompt lives in the **MLflow Prompt Registry**: `svg.annotate`, `svg.verify`, `svg.add_detail`, `svg.flip_detail`, `svg.judge`, `svg.policy`. Each trace is tagged with the prompt name@version | Review findings → new prompt version → comparable. |
| A13 | Code | uv project, Python 3.12, pydantic v2 schemas, `typer` CLI named `svgd`, YAML configs. Every step is idempotent and resumable, keyed by `seed_id` (skip ids already in the output parquet) | Long teacher runs get interrupted. |

## 5. Phases

GPU tenancy: one heavy tenant at a time. **Teacher ON**: P0 (test), P2, P3, P6. **Teacher OFF**: P1b, P4, P5. Stop llama-server (`pkill -f llama-server` only for the process you started; better, track its PID) before any 0.8B GPU work.

Order: P0 → P1 → P2 pilot → G2 → P2 full → P1b → P3 → G3 → P4 → G4 → P5 → G5 → P6.

### P0: setup and smoke test (½–1 day)

Tasks:
1. `uv init` (Python 3.12) with deps: `mlflow==3.18.*` (match the server), `openai`, `pydantic`, `typer`, `pyyaml`, `pandas`, `pyarrow`, `datasets`, `huggingface_hub`, `resvg-py`, `cairosvg`, `pillow`, `imagehash`, `lxml`, `numpy`, `torch`, `transformers`, `peft`, `trl`, `vllm`, `accelerate`. Pin the versions that support Qwen3.5 (check the Qwen3.5 model card for minimum transformers/vLLM versions).
2. `.gitignore`: `data/`, `.venv/`, `*.gguf`, `mlruns/`, checkpoints.
3. Download models:
   - `huggingface-cli download unsloth/Qwen3.8-27B-GGUF --include "*IQ4_XS*" "*mmproj*"`. List the repo files first and pick the right mmproj file (prefer F16 or BF16).
   - `huggingface-cli download Qwen/Qwen3.5-0.8B`.
4. `scripts/serve_teacher.sh`: launches llama-server with `-m <IQ4_XS gguf> --mmproj <mmproj> -ngl 99 -c 16384 -np 2 --cache-type-k q8_0 --cache-type-v q8_0 --host 127.0.0.1 --port 8081 --jinja`, writes its PID to `data/teacher.pid`. Use port 8081, because 8080 is already used by nginx.
5. Measure: VRAM under load with 2 concurrent image requests, prefill and decode tok/s, and wall time per seed for annotate + verify. Log them to an MLflow run in `svg_drawer/p0_setup`.
6. MLflow setup script (`svgd mlflow init`) that:
   - creates the experiments in §7,
   - registers the initial prompts from `src/svg_drawer/prompts/*.md`,
   - creates the label schemas (§7.3).
7. Smoke test: one SVG → render → annotate → verify, traced end to end. Open the trace in the MLflow UI and confirm **the image is visible** in the LLM span input (see §9).
8. Check that Qwen3.5-0.8B loads in transformers and vLLM with image input, and that `p(yes)` can be read from next-token logits for a yes/no prompt.

Acceptance: teacher runs fully on GPU at IQ4_XS (or the fallback is documented with numbers); one seed is fully traced with the image visible; throughput is logged.

### P1: seed curation (CPU, ½ day)

Tasks (`svgd seeds build --n-candidates 1200`):
1. Stream `starvector/svg-stack` (columns `Filename`, `Svg`) with `datasets` streaming. Shuffle with a fixed seed. Process until there are enough candidates (stream a few hundred thousand rows; don't download the whole set unless needed).
2. Normalize: strip comments, `<metadata>`, editor namespaces (inkscape/sodipodi), and XML declarations; round numbers to 1 decimal. Keep the normalized SVG.
3. Filters, in order, logging the drop count for each:
   1. parses as XML; root is `<svg>`;
   2. no `<image>`, no external `href`, no `<script>`, no `<foreignObject>`;
   3. resvg renders within 2 s;
   4. render isn't blank or near-solid (pixel std > threshold; non-white pixel ratio between 2 % and 98 %);
   5. ≤ 1,500 tokens with the Qwen3.5 tokenizer;
   6. `<text>` elements don't dominate (drop if text is present and covers most of the drawn area, or simply drop any `<text>` for v1);
   7. pHash dedup: keep one per cluster, keep `cluster_id`.
4. Deterministic features: `n_elements`, `n_path_cmds`, `n_colors`, `has_gradient`, `has_stroke_only`, `has_transform`, `svg_tokens`, `bbox_fill_ratio`.
5. Stratify: bucket by complexity (tertiles of a z-scored mix of `n_elements`, `n_path_cmds`, `n_colors`, `svg_tokens`) and sample evenly to 1,200 candidates.
6. Split by `cluster_id`: 80/10/10.
7. Write `data/p1/<run_id>/seeds.parquet` and `data/p1/<run_id>/renders/<seed_id>.png`. Build an HTML contact sheet (200 random thumbnails with id + features) and log it as a run artifact.

Gate **G1**: the user views the contact sheet (100–200 seeds) and marks keep/drop. Pass if ≥ 90 % are keepable. Otherwise tighten the filters.

### P2: annotation (teacher ON, ~1 day for 1k)

Per seed (`svgd annotate --run <p1_run> --limit 50` for the pilot, then all):
1. **Annotate** call: the image only (base64 PNG in an OpenAI `image_url` content part) + the `svg.annotate` prompt. JSON output constrained by `response_format: {type: json_schema, ...}` with the schema in §6.2. Temperature 0.3.
2. **Verify** calls: one per rubric item, with the image + the `svg.verify` prompt (§6.4), answer `yes`/`no`, temperature 0, `max_tokens` 2. Batch through the parallel slots. Drop items answered `no`. Drop the seed if < 4 items remain.
3. Log the auto verdicts as MLflow feedback on the trace (source type `LLM_JUDGE`, name `verify/R<k>`).
4. Write `data/p2/<run_id>/annotations.parquet`: `seed_id, split, description, short_prompt, rubric (list of {id,text,category}), dropped_items, tags (struct), difficulty_bucket, trace_id, prompt_versions`.
5. Difficulty bucket (analytics only): z-scored mix of the deterministic features + ordinal tags → easy/medium/hard tertiles.

Pilot specifics: run 50 seeds twice, with thinking off and thinking on, and compare in G2. Optionally a third variant that also gives the SVG code to the teacher. Keep the image-only variant unless the code variant is clearly better at counts and colors without leaking code vocabulary into descriptions.

Gate **G2** (labeling session `G2-annotation-<batch>`, 50 pilot traces, then 1 % of the full run):
- `description_faithful` ≥ 90 % pass;
- ≤ 5 % of rubric items flagged in `bad_items`.

If the gate fails: look at the comment patterns, write a new prompt version, and re-run the pilot.

### P1b: base policy samples (teacher OFF, 1–2 h)

Stop the teacher. With vLLM, run base Qwen3.5-0.8B + the `svg.policy` system prompt on the full description of every **train** seed: 2 samples each, temperature 1.0, max 1,536 tokens. Extract and render the SVGs, keeping failures (R0 = false). Write `data/p1b/<run_id>/samples.parquet` and the renders. Log the base R0 rate as a metric; this is the baseline for O1.

### P3: judge dataset (teacher ON, ½–1 day)

Each row: `pair_id, seed_id, split, image_path, image_kind (seed|mutation|policy), statement, label (bool), variation_type, category, source_trace_id`.

| Type | Image | Statement | Label | Construction | Mix |
|---|---|---|---|---|---|
| V0 positive | seed | its own verified items | true | direct | 30 % |
| V1 removal | seed | a less specific statement (short_prompt, or an item generalised, e.g. "a bird" for "a duck") | true | teacher generalisation + verify = yes | 10 % |
| V2 addition | seed | plausible new detail ("The duck wears a red top hat") | false | `svg.add_detail` proposes 3; **absence check**: teacher with image + `svg.verify` must answer `no`, otherwise discard | 15 % |
| V3 flip | seed | one attribute changed (color, count, direction, position) | false | `svg.flip_detail` + absence check | 15 % |
| V4 mismatch | seed | items from another seed | false | hard negatives: same `domain`/`style` tags + nearest description by embedding (e.g. a small sentence-embedding model on CPU); some random. Absence check applies | 10 % |
| V5 SVG mutation | mutated seed render | original items | mixed | code edits: recolor one fill, delete one element, mirror horizontally, translate. Re-verify **every** item on the mutated render with the teacher; the label is the teacher answer | 10 % |
| V6 on-policy | P1b sample render | target seed's items | mixed | teacher verify on each item | 10 % |

- Target ~50/50 true/false overall and per `category`.
- Expected size ≈ 15–20k pairs from ~800 train seeds. Build val/test pairs from val/test seeds the same way.
- Also export `judge_gold_v1` candidates: every item a human touched in G2, plus the G3 sample.

Gate **G3** (labeling session `G3-pairs`, 200 pairs, over-sampling V2/V3/V5): `label_correct` ≥ 95 %. Pay attention to "addition already present" cases.

### P4: judge training (teacher OFF, 2–4 h)

- Input: chat template, user turn = image + `svg.judge` prompt (§6.5); target = `yes` or `no`. Loss only on the answer token.
- LoRA r=16 (try 32), lr 1e-4, 1–2 epochs, early stopping on val balanced accuracy. Use bf16 and gradient checkpointing.
- Baseline: the untuned Qwen3.5-0.8B with the same prompt, on the same eval sets.
- Tune τ on val: maximise balanced accuracy, subject to FPR ≤ 10 % on V2+V3+V4.
- Eval with `mlflow.genai.evaluate` (or a custom eval loop logged to MLflow) on val pairs and `judge_gold_v1`, sliced by `variation_type`, `category` and `style`.
- Register the adapter as an MLflow model `svg_drawer_judge`, with τ in its metadata.

Gate **G4**:
- balanced accuracy ≥ 90 % vs teacher labels (val);
- FPR on control types ≤ 10 %;
- agreement with the human gold set ≥ 85 %;
- clearly above the untuned baseline.

### P5: GRPO (teacher OFF, 1–3 days)

- Dataset: train seeds, prompt = system `svg.policy` + user = full description. Reward rubric = the full verified rubric (+ R0).
- Reward function: see §6.6. It returns the scalar reward, and logs the per-item verdicts.
- Starting hyper-parameters:

| Setting | Value |
|---|---|
| Group size | 8 |
| Prompts per step | 8 |
| Max completion | 1,536 tokens |
| Temperature | 1.0 |
| LR (LoRA) | sweep 5e-6, 1e-5, 2e-5 |
| KL β | 0.0 to start; 0.02–0.04 if outputs degrade |
| LoRA | r=32, alpha 64, all linear |
| Epochs | ~1 epoch ≈ 100 steps; run 3–5 epochs, watching for overfit and a rising zero-advantage share |
| Curriculum | optional easy→all by `difficulty_bucket`, as an ablation |
| Thinking | disabled |

- Memory plan, about 12.5 GB in total: policy + LoRA + optimizer ≈ 2.2 GB, vLLM colocate ≈ 4.5 GB (`gpu_memory_utilization` ≈ 0.3), judge ≈ 1.8 GB, activations ≈ 4 GB with gradient checkpointing. If OOM, reduce max completion or prompts per step, or switch to Unsloth.
- Per-step metrics to MLflow:
  - mean, std and max reward; R0 rate;
  - pass rate per rubric `category`;
  - control pass rate (run 2+);
  - mean completion length;
  - zero-advantage group share;
  - judge p(yes) histogram (every 50 steps);
  - KL.
- Trace every 20th group: prompt, completion, render (attachment or artifact), and per-item verdicts as feedback assessments (source `LLM_JUDGE`, name `judge/R<k>`, value bool, rationale = p(yes)). Tag traces with `step`, `seed_id` and `run_id`.
- Save a checkpoint every 50 steps.

Gate **G5** (labeling session `G5-rollouts-<ckpt>`, 50 rollouts, highest-reward first): `reward_agrees` ≥ 85 %, and no `hacking` pattern. If hacking is found: add control items (A7) and/or new V6 data → judge v2.

### P6: evaluation and teacher audit (teacher ON, ½–1 day)

- Stop training, start the teacher.
- For the base model and each selected checkpoint, generate on the **test** seeds (1 sample at temperature 0.7, plus 4 samples for pass@k if time allows). Score each output twice:
  1. with the judge,
  2. with the teacher (`svg.verify` on every item).
- Metrics, all sliced by tags and difficulty bucket:
  - R0 rate;
  - judge score;
  - teacher score;
  - **gap = judge − teacher**.
- Diagnostic only: CLIP or DINO similarity between the output render and the seed render.
- Judge/teacher disagreements become V6 pairs for judge v2 and are queued for human review.
- Log a summary report (markdown or HTML) as a run artifact.

### Success criteria (initial targets)

| Stage | Metric | Target |
|---|---|---|
| Annotation | human-rated faithful descriptions | ≥ 90 % |
| Annotation | rubric items correct | ≥ 95 % |
| Judge data | human agreement with generated labels | ≥ 95 % |
| Judge | balanced accuracy vs teacher (val) | ≥ 90 % |
| Judge | FPR on control items | ≤ 10 % |
| Judge | agreement with human gold | ≥ 85 % |
| Policy | R0 rate on test | ≥ 95 % |
| Policy | teacher-audited rubric score | +0.15 absolute over base |
| Policy | judge − teacher gap | ≤ 0.10 |

## 6. Schemas, prompts, reward

### 6.1 Rubric writing rules (embed in `svg.annotate`)

- **Atomic:** one fact per item. "The beak is orange" and "the beak points right" are two items.
- **Visually checkable** from a 384 px render by someone who hasn't read the description. No mood or intent words.
- **Robust to valid redraws:** use relative positions ("upper left", "left of") and color families ("yellow", not hex codes).
- **Order:** main subject → key parts → colors → layout/relations → background.
- **Size:** 5 to 15 items, scaled with complexity. Each item has a `category` from: `object|count|color|shape|position|relation|style|background`.
- **No negations** in the positive rubric.
- **Description:** visual only. Never mention "SVG", "icon file", "vector", or coordinates.

### 6.2 Annotation output schema (JSON schema for constrained decoding)

```json
{
  "description": "string, 60-200 words",
  "short_prompt": "string, <= 15 words",
  "rubric": [{"id": "R1", "text": "string", "category": "object|count|color|shape|position|relation|style|background"}],
  "tags": {
    "visual_complexity": "low|medium|high",
    "element_count": "1|2-3|4-7|8-15|16+",
    "color_complexity": "mono|2-3|4-6|7+|gradient",
    "spatial_relations": "none|simple|complex",
    "style": "glyph_icon|line_art|flat_illustration|logo_emblem|pattern|diagram|detailed_illustration",
    "domain": "animal|person|object|food|nature|vehicle|building|symbol|abstract|ui|other",
    "abstraction": "figurative|symbolic|abstract"
  }
}
```
Define this as a pydantic model in `teacher/schemas.py` and generate the JSON schema from it. Enforce `minItems: 5, maxItems: 15` on the rubric.

### 6.3 `svg.annotate` prompt outline

> You are describing an image so that an artist could redraw it from the text alone. Look only at the image. Write a detailed visual description, a short prompt, a rubric following these rules: [§6.1], and tags. Return only JSON matching the schema.

### 6.4 `svg.verify` prompt (shared by the verify pass, the absence checks, and teacher labels)

> Look at the image. Statement: "{statement}". Is this statement true for the image? Answer with exactly one word: yes or no.

The teacher must not see the description when verifying.

### 6.5 `svg.judge` prompt (judge training and inference)

Same wording as `svg.verify`, so teacher labels and judge inputs match. Read the verdict from the logits of the first answer token: compare the `yes` and `no` token ids, and check the exact token ids for the Qwen3.5 tokenizer, with and without a leading space.

### 6.6 `svg.policy` system prompt and reward

System prompt: "You draw images as SVG. Reply with a single complete SVG document and nothing else. Use a viewBox."

```python
def reward(completion: str, rubric: list[str], controls: list[str] = ()) -> float:
    svg = extract_svg(completion)      # first <svg ...>...</svg>, tolerate ``` fences; else None
    png = render(svg) if svg else None # resvg, 384px, white bg, 2s timeout (same as seeds)
    if png is None:                    # R0 failed
        return 0.0
    passed = 1                         # R0
    passed += sum(judge(png, s) for s in rubric)        # p(yes) > tau
    passed += sum(not judge(png, s) for s in controls)  # A7, run 2+
    return passed / (1 + len(rubric) + len(controls))
```

- Batch all judge calls of a GRPO step into one forward pass, grouped by image.
- Rendering runs in a process pool so a hung render can't block training.
- Unit tests: invalid XML → 0; empty `<svg/>` → valid but blank (R0 true; it will fail the items); a code fence wrapper is handled; a known-good seed SVG scores high with a stub judge.

### 6.7 Worked example (for sanity checks)

Seed: a yellow flat duck facing right, on wavy blue water, pale blue sky.

- Rubric:
  - R1 single duck is the main subject;
  - R2 body yellow;
  - R3 orange beak;
  - R4 faces right;
  - R5 one black eye;
  - R6 darker wing shape on body;
  - R7 blue wavy water at the bottom;
  - R8 pale blue background;
  - R9 duck sits on the water line.
- Judge pairs:
  - V2 "The duck wears a red top hat" → false, kept after the teacher says no hat;
  - V2 "There is water below the duck" → **discarded**, already present;
  - V3 "The duck faces left" → false;
  - V5 eye deleted → R5 false, the others true.
- GRPO group example (n+1 = 10):
  - broken SVG → 0.0;
  - yellow blob on blue → 0.4;
  - duck facing left without a wing → 0.8;
  - correct duck → 1.0.

## 7. MLflow conventions

Tracking URI `http://127.0.0.1:5000`. Set it in config, never hard-code it in many places.

### 7.1 Experiments

| Experiment | Runs | Traces |
|---|---|---|
| `svg_drawer/p0_setup` | throughput and memory measurements | smoke test |
| `svg_drawer/p1_seeds` | one per curation version: filter params, drop counts, histograms, contact sheet | — |
| `svg_drawer/p2_annotation` | one per batch: prompt versions, throughput, verify-drop rate, gate metrics | one per seed; root span `annotate_seed` → `render`, `teacher.annotate`, `teacher.verify` ×n, `finalize`. Tags: `seed_id`, `split`, `style`, `domain`, `prompt_v`, `batch` |
| `svg_drawer/p1b_base_samples` | R0 rate, lengths | sampled generations |
| `svg_drawer/p3_judge_data` | one per build: variation mix, label balance, discard counts | one per teacher-generated variation (add/flip/mismatch absence checks, mutation verify) |
| `svg_drawer/p4_judge` | training runs + eval runs | eval rows |
| `svg_drawer/p5_grpo` | one per GRPO run | every 20th group |
| `svg_drawer/p6_eval` | one per checkpoint audited | teacher audit calls |

Use `mlflow.openai.autolog()` for teacher calls, plus manual spans (`@mlflow.trace` / `mlflow.start_span`) for render and finalize. **Disable autolog inside the GRPO loop.** Trace rollouts manually and only for sampled groups, so the shared server isn't flooded.

### 7.2 Datasets and models

- MLflow evaluation datasets: `seeds_gold_v1` (human-approved annotations), `judge_gold_v1` (human-labelled pairs), `policy_test_v1` (test prompts + rubrics).
- Model registry: `svg_drawer_judge` (adapter + τ), `svg_drawer_policy` (adapter checkpoints selected in P6).
- Every automatic verdict is logged as feedback with source `LLM_JUDGE` or `CODE`; human labels use source `HUMAN`, so they can be separated.

### 7.3 Label schemas and review workflow

| Schema | Type | Used in |
|---|---|---|
| `description_faithful` | pass/fail | G2 |
| `bad_items` | free text or multi-select of R-ids | G2 |
| `tags_ok` | pass/fail | G2 |
| `keep_seed` | yes/no | G2 |
| `label_correct` | yes/no | G3 |
| `ambiguous` | yes/no | G3 |
| `reward_agrees` | yes/no | G5 |
| `hacking` | yes/no | G5 |
| `comment` | text | all |

CLI:
- `svgd review create <gate> --batch <id> --n <k>` samples traces by tag, ensures the schemas exist, creates a labeling session and prints its URL.
- `svgd review pull <gate> --batch <id>` exports human assessments to `data/reviews/<gate>_<batch>.parquet`, computes the gate metrics, and logs them as `gate/<gate>/*` on the batch run.

The human does the review in the MLflow UI. The agent never fills human labels. Use the MLflow 3.18 APIs (`mlflow.genai.label_schemas`, `mlflow.genai.labeling` / labeling sessions, `mlflow.log_feedback`). Check the exact names against the installed version and the bundled skill.

### 7.4 Trace reuse

- Parquet rows keep `trace_id`, so any bad label can be traced back to the call and prompt version.
- After each GRPO run, sampled rollout traces are re-labelled by the teacher in P6; disagreements → V6 pairs for judge v2.
- Prompts whose groups always had zero advantage are tagged, so later runs can drop them.

## 8. Repository layout

```
svg_drawer/
├── PLAN.md
├── pyproject.toml            # uv, python 3.12
├── configs/                  # p0.yaml … p6.yaml: paths, model ids, thresholds, MLflow URI
├── scripts/serve_teacher.sh  # llama-server launch, PID file
├── src/svg_drawer/
│   ├── cli.py                # typer app "svgd"
│   ├── prompts/              # *.md sources for the prompt registry
│   ├── seeds/      load.py  normalize.py  filter.py  render.py  features.py  split.py  contact_sheet.py
│   ├── teacher/    client.py  schemas.py  annotate.py  verify.py
│   ├── judge_data/ variations.py  svg_mutate.py  hard_negatives.py  build.py
│   ├── judge/      dataset.py  train.py  infer.py  evaluate.py
│   ├── rl/         rewards.py  train_grpo.py  rollout_logging.py
│   ├── eval/       audit.py  report.py
│   └── tracking/   mlflow_setup.py  review.py
├── tests/                    # render, normalize, schema, extract_svg, reward, svg_mutate
└── data/                     # git-ignored: p1/, p1b/, p2/, p3/, reviews/, checkpoints/
```

## 9. Verify, don't assume

1. The 27B GGUF is served by the local llama.cpp build with mmproj (architecture support). If not, `git pull` and rebuild llama.cpp, after asking the user, since that checkout may be shared.
2. IQ4_XS + mmproj + KV for 2 slots fits in 16 GB. Otherwise use 1 slot, then UD-Q3_K_XL. Record the numbers.
3. llama-server honours `response_format` json_schema with image input, and `enable_thinking=false` through `chat_template_kwargs`.
4. The MLflow 3.18 trace UI shows base64 images from OpenAI-format messages. If not, attach the PNG to the trace (attachment API if present) or log it as a run artifact and put the artifact path in span attributes.
5. The MLflow labeling session / label schema APIs and their names in 3.18.
6. Qwen3.5-0.8B accepts image input in transformers and vLLM, and TRL `GRPOTrainer` supports it as a text-only policy with vLLM colocate.
7. The exact `yes`/`no` token ids for the Qwen3.5 tokenizer.
8. The SVG-Stack column names and licence fields; store the source `Filename` for attribution.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Judge too lenient on crude renders → policy learns blobs | V6 on-policy pairs, FPR gate, control items (A7), teacher audit gap |
| Teacher miscounts or hallucinates | verify pass, G2, the `count` category tracked separately |
| Added detail already present → contradictory labels | mandatory absence check on V2/V3/V4, over-sampled in G3 |
| 27B too slow | measured in P0; thinking off; parallel slots; 1k seeds leaves margin |
| 0.8B vision too weak for fine details | per-category gates; moving the judge to a larger model needs the **user's approval** |
| Long SVGs exhaust the completion budget | 1,500-token filter, coordinate rounding, optional curriculum |
| Small dataset (1k) → judge overfit, few GRPO steps | cluster split, early stopping, multiple GRPO epochs while watching zero-advantage share; scale only after v1 |
| Shared MLflow server overloaded | `svg_drawer/` experiments only, sampled rollout tracing, no per-step image logging |

## 11. Ground rules for the implementing agent

- Do not touch the other project (`neuron_personality_qwen`), its MLflow server process, or its GPU process. Ask the user to pause or resume it.
- Commit only when the user asks; branch off `master` first. Never commit `data/`, model weights, or secrets.
- Before each gate, stop and hand the labeling session URL to the user. Don't continue past a gate without the user's results.
- Ask the user before any change to the decisions in §4.1.
- When a step's real numbers differ from this plan (throughput, memory, pair counts), update this file and the MLflow run notes.
