import { m as attr_style } from './index.js-fmqScc5X.js';

function NoiseOverlay($$renderer, $$props) {
  let { opacity = 0.06 } = $$props;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
  const noise = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  $$renderer.push(`<div aria-hidden="true" class="pointer-events-none absolute inset-0 mix-blend-overlay"${attr_style("", { opacity, "background-image": noise })}></div>`);
}

export { NoiseOverlay as N };
//# sourceMappingURL=NoiseOverlay-D77bFNIU.js.map
