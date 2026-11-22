import { duckCorrect, duckLeftNoWing, yellowBlob } from "./duck";

export const description =
  "A flat-style yellow rubber duck seen from the side, facing right. Its round head sits on the upper right of the body and carries a small orange beak pointing right and one black eye. A darker yellow wing shape is drawn on the middle of the body. The duck floats on wavy blue water that fills the bottom of the image, and its belly touches the water line. The background behind the duck is pale blue.";

export const rubric = [
  { id: "R1", text: "A single duck is the main subject", cat: "object" },
  { id: "R2", text: "The duck's body is yellow", cat: "color" },
  { id: "R3", text: "The duck has an orange beak", cat: "color" },
  { id: "R4", text: "The duck faces right", cat: "position" },
  { id: "R5", text: "The duck has one black eye", cat: "count" },
  { id: "R6", text: "A darker wing shape is on the body", cat: "shape" },
  { id: "R7", text: "Blue wavy water fills the bottom", cat: "shape" },
  { id: "R8", text: "The background is pale blue", cat: "background" },
  { id: "R9", text: "The duck sits on the water line", cat: "relation" },
];

// Which items the judge says "yes" to, per candidate. R0 = valid SVG (checked by code).
export const candidates = [
  {
    key: "broken",
    name: "Broken SVG",
    note: "The XML does not parse, so R0 fails and the reward is forced to 0.",
    svg: null as string | null,
    r0: false,
    pass: [] as string[],
  },
  {
    key: "blob",
    name: "Yellow blob",
    note: "Valid, but it is not a recognisable duck.",
    svg: yellowBlob,
    r0: true,
    pass: ["R2", "R7", "R8"],
  },
  {
    key: "left",
    name: "Duck facing left",
    note: "A good duck, but it faces the wrong way and has no wing.",
    svg: duckLeftNoWing,
    r0: true,
    pass: ["R1", "R2", "R3", "R5", "R7", "R8", "R9"],
  },
  {
    key: "good",
    name: "Correct duck",
    note: "Every item is satisfied.",
    svg: duckCorrect,
    r0: true,
    pass: ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"],
  },
];

export const judgePairs = [
  { type: "V0 Positive", stmt: "The duck's body is yellow", label: true, how: "A verified rubric item, as is." },
  { type: "V1 Removal", stmt: "There is a bird", label: true, how: "A less specific statement is still true." },
  { type: "V2 Addition", stmt: "The duck wears a red top hat", label: false, how: "A new detail, kept only if the teacher confirms it is absent." },
  { type: "V3 Flip", stmt: "The duck faces left", label: false, how: "One attribute changed: colour, count, direction, position." },
  { type: "V4 Mismatch", stmt: "A red apple with a green leaf", label: false, how: "An item taken from a similar but different image." },
  { type: "V5 Mutation", stmt: "The duck has one black eye (eye deleted from the SVG)", label: false, how: "Edit the SVG code, re-check every item on the new render." },
  { type: "V6 On-policy", stmt: "Rubric items checked on a real model output", label: null, how: "Teacher labels what the policy actually draws." },
];
