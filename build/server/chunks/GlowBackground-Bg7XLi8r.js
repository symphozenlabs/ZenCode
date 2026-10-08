import { c as attr_class, d as stringify } from './index.js-fmqScc5X.js';

function GlowBackground($$renderer, $$props) {
  let { class: cls = "" } = $$props;
  $$renderer.push(`<div aria-hidden="true"${attr_class(`pointer-events-none absolute inset-0 overflow-hidden ${stringify(cls)}`)}><div class="absolute -top-1/3 left-1/2 h-[70%] w-[90%] -translate-x-1/2 rounded-full opacity-70 blur-3xl" style="background: radial-gradient(closest-side, color-mix(in srgb, var(--color-brand) 45%, transparent), transparent)"></div> <div class="absolute -right-[10%] top-[30%] h-[45%] w-[40%] rounded-full opacity-40 blur-3xl" style="background: radial-gradient(closest-side, color-mix(in srgb, var(--color-sun) 35%, transparent), transparent)"></div></div>`);
}

export { GlowBackground as G };
//# sourceMappingURL=GlowBackground-Bg7XLi8r.js.map
