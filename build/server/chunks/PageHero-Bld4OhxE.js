import { e as escape_html } from './index.js-fmqScc5X.js';
import { A as AnimatedGrid } from './AnimatedGrid-BzTnzW2q.js';
import { G as GlowBackground } from './GlowBackground-Bg7XLi8r.js';
import { N as NoiseOverlay } from './NoiseOverlay-D77bFNIU.js';

function PageHero($$renderer, $$props) {
  let { eyebrow, title, description, children, aside } = $$props;
  $$renderer.push(`<section class="relative overflow-hidden bg-stage pt-16 text-cream">`);
  AnimatedGrid($$renderer, {});
  $$renderer.push(`<!----> `);
  GlowBackground($$renderer, { class: "opacity-60" });
  $$renderer.push(`<!----> `);
  NoiseOverlay($$renderer, {});
  $$renderer.push(`<!----> <div class="shell relative grid gap-10 py-20 md:py-24 lg:grid-cols-[1.5fr_1fr] lg:items-end"><div><p class="eyebrow text-sun">${escape_html(eyebrow)}</p> <h1 class="mt-4 font-display text-5xl leading-[1.02] font-semibold tracking-tight md:text-7xl">${escape_html(title)}</h1> `);
  if (description) {
    $$renderer.push(`<!--[0--><p class="mt-6 max-w-2xl text-lg leading-relaxed text-cream/70">${escape_html(description)}</p>`);
  } else {
    $$renderer.push("<!--[-1-->");
  }
  $$renderer.push(`<!--]--> `);
  if (children) {
    $$renderer.push(`<!--[0--><div class="mt-9 flex flex-wrap gap-3">`);
    children($$renderer);
    $$renderer.push(`<!----></div>`);
  } else {
    $$renderer.push("<!--[-1-->");
  }
  $$renderer.push(`<!--]--></div> `);
  if (aside) {
    $$renderer.push(`<!--[0--><div>`);
    aside($$renderer);
    $$renderer.push(`<!----></div>`);
  } else {
    $$renderer.push("<!--[-1-->");
  }
  $$renderer.push(`<!--]--></div></section>`);
}

export { PageHero as P };
//# sourceMappingURL=PageHero-Bld4OhxE.js.map
