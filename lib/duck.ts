// Hand-written SVGs for the worked example (PLAN.md §6.7).
const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 384">${inner}</svg>`;

const sky = `<rect width="384" height="384" fill="#d6ebff"/>`;
const water = `<path d="M0 285 Q24 268 48 285 T96 285 T144 285 T192 285 T240 285 T288 285 T336 285 T384 285 V384 H0 Z" fill="#2f80ed"/>`;
const body = `<ellipse cx="180" cy="245" rx="95" ry="58" fill="#ffd21f"/><circle cx="262" cy="160" r="42" fill="#ffd21f"/><path d="M122 212 Q92 150 128 142 Q122 190 168 205 Z" fill="#ffd21f"/>`;
const beak = `<path d="M297 152 L340 166 L297 180 Z" fill="#ff8a00"/>`;
const eye = `<circle cx="274" cy="148" r="5.5" fill="#111"/>`;
const wing = `<ellipse cx="160" cy="245" rx="44" ry="26" fill="#e0a800"/>`;

export const duckCorrect = wrap(`${sky}${body}${wing}${beak}${eye}${water}`);

// Same duck, mirrored, and no wing.
export const duckLeftNoWing = wrap(
  `${sky}<g transform="translate(384 0) scale(-1 1)">${body}${beak}${eye}</g>${water}`
);

export const yellowBlob = wrap(
  `${sky}<ellipse cx="190" cy="230" rx="110" ry="80" fill="#ffd21f"/>${water}`
);

// Broken output: never closed, so the XML parser rejects it.
export const brokenCode = `<svg viewBox="0 0 384 384">
  <ellipse cx="180" cy="245" rx="95" ry="58" fill="#ffd21f"
  <circle cx="262" cy="160" r="42" fill="#ffd21f"/>`;
