import { c as attr_class, m as attr_style, d as stringify } from './index.js-fmqScc5X.js';

function AnimatedGrid($$renderer, $$props) {
  let { size = 64, masked = true, animated = true, class: cls = "" } = $$props;
  $$renderer.push(`<div aria-hidden="true"${attr_class(`pointer-events-none absolute inset-0 ${animated ? "animate-grid-drift" : ""} ${stringify(cls)}`)}${attr_style("", {
    "background-size": `${stringify(size)}px ${stringify(size)}px`,
    "background-image": "linear-gradient(to right, color-mix(in srgb, var(--color-green-300) 9%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-green-300) 9%, transparent) 1px, transparent 1px)",
    "mask-image": masked ? "radial-gradient(ellipse 75% 65% at 50% 40%, black 30%, transparent 100%)" : void 0
  })}></div>`);
}

export { AnimatedGrid as A };
//# sourceMappingURL=AnimatedGrid-BzTnzW2q.js.map
