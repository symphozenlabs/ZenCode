import { l as head, h as ensure_array_like, i as attr, d as stringify, e as escape_html, n as derived } from './index.js-fmqScc5X.js';
import { E as EVENT_IDS } from './site-btfDK_Br.js';
import { P as PageHero } from './PageHero-Bld4OhxE.js';
import './AnimatedGrid-BzTnzW2q.js';
import './GlowBackground-Bg7XLi8r.js';
import './NoiseOverlay-D77bFNIU.js';

function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    const config = derived(() => data.config);
    const sections = derived(() => [
      {
        id: "general",
        title: "General",
        rules: config().generalRules
      },
      ...EVENT_IDS.map((id) => ({
        id,
        title: config().events[id].title,
        rules: config().events[id].rules
      }))
    ]);
    head("4qniyj", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Rules — ${escape_html(config().name)}</title>`);
      });
    });
    PageHero($$renderer2, {
      eyebrow: "Rules",
      title: "Play fair. Build boldly.",
      description: "The ground rules for every participant and team."
    });
    $$renderer2.push(`<!----> <section class="py-16 md:py-20"><div class="shell grid gap-12 lg:grid-cols-[14rem_1fr]"><nav aria-label="Rule sections" class="hidden lg:block"><ul class="sticky top-24 space-y-1 border-l border-line"><!--[-->`);
    const each_array = ensure_array_like(sections());
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let s = each_array[$$index];
      $$renderer2.push(`<li><a${attr("href", `#${stringify(s.id)}`)} class="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm text-muted-foreground hover:border-forest-700 hover:text-forest-950">${escape_html(s.title)}</a></li>`);
    }
    $$renderer2.push(`<!--]--></ul></nav> <div class="space-y-16"><!--[-->`);
    const each_array_1 = ensure_array_like(sections());
    for (let $$index_2 = 0, $$length = each_array_1.length; $$index_2 < $$length; $$index_2++) {
      let s = each_array_1[$$index_2];
      $$renderer2.push(`<section${attr("id", s.id)} class="scroll-mt-24"><h2 class="font-display text-3xl font-semibold tracking-tight text-forest-950">${escape_html(s.title)}</h2> `);
      if (s.rules.length) {
        $$renderer2.push(`<!--[0--><ol class="mt-6 divide-y divide-line border-y border-line"><!--[-->`);
        const each_array_2 = ensure_array_like(s.rules);
        for (let i = 0, $$length2 = each_array_2.length; i < $$length2; i++) {
          let rule = each_array_2[i];
          $$renderer2.push(`<li class="grid grid-cols-[3rem_1fr] py-4 text-[16px] leading-relaxed text-ink"><span class="font-mono text-sm leading-7 text-forest-700">${escape_html(String(i + 1).padStart(2, "0"))}</span> <span>${escape_html(rule)}</span></li>`);
        }
        $$renderer2.push(`<!--]--></ol>`);
      } else {
        $$renderer2.push(`<!--[-1--><p class="mt-4 text-muted-foreground">Rules for this section will be published before the event.</p>`);
      }
      $$renderer2.push(`<!--]--></section>`);
    }
    $$renderer2.push(`<!--]--></div></div></section>`);
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-DXnAm_nK.js.map
