import { l as head, d as stringify, h as ensure_array_like, i as attr, c as attr_class, e as escape_html, n as derived } from './index.js-fmqScc5X.js';
import { a as EVENT_LABELS } from './site-btfDK_Br.js';
import { P as PageHero } from './PageHero-Bld4OhxE.js';
import './AnimatedGrid-BzTnzW2q.js';
import './GlowBackground-Bg7XLi8r.js';
import './NoiseOverlay-D77bFNIU.js';

function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    const config = derived(() => data.config);
    let filter = "all";
    const filters = [
      { id: "all", label: "All" },
      { id: "hackathon", label: "Hackathon" },
      { id: "pitch-fest", label: "Pitch Fest" },
      { id: "general", label: "General" }
    ];
    const days = derived(() => {
      const items = config().schedule.filter((s) => filter === "all");
      const map = /* @__PURE__ */ new Map();
      for (const item of items) map.set(item.day, [...map.get(item.day) ?? [], item]);
      return [...map.entries()];
    });
    const tag = (e) => e === "general" ? "General" : EVENT_LABELS[e];
    head("20dkl1", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Schedule — ${escape_html(config().name)}</title>`);
      });
    });
    PageHero($$renderer2, {
      eyebrow: "Schedule",
      title: "The run of show.",
      description: `Every session, check-in and deadline across ${stringify(config().name)} in one place.`
    });
    $$renderer2.push(`<!----> <section class="py-16 md:py-20"><div class="shell">`);
    if (config().schedule.length) {
      $$renderer2.push(`<!--[0--><div class="flex flex-wrap gap-2" role="group" aria-label="Filter schedule"><!--[-->`);
      const each_array = ensure_array_like(filters);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let f = each_array[$$index];
        $$renderer2.push(`<button type="button"${attr("aria-pressed", filter === f.id)}${attr_class(`h-10 rounded-md border px-4 text-sm font-medium transition-colors duration-150 ${filter === f.id ? "border-forest-900 bg-forest-900 text-cream" : "border-line bg-white text-ink hover:border-forest-700/40"}`)}>${escape_html(f.label)}</button>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="mt-12 space-y-14">`);
      const each_array_1 = ensure_array_like(days());
      if (each_array_1.length !== 0) {
        $$renderer2.push("<!--[-->");
        for (let $$index_2 = 0, $$length = each_array_1.length; $$index_2 < $$length; $$index_2++) {
          let [day, items] = each_array_1[$$index_2];
          $$renderer2.push(`<div class="grid gap-6 lg:grid-cols-[14rem_1fr]"><h2 class="font-display text-2xl font-semibold text-forest-950 lg:sticky lg:top-24 lg:self-start">${escape_html(day)}</h2> <ol class="divide-y divide-line border-y border-line"><!--[-->`);
          const each_array_2 = ensure_array_like(items);
          for (let $$index_1 = 0, $$length2 = each_array_2.length; $$index_1 < $$length2; $$index_1++) {
            let item = each_array_2[$$index_1];
            $$renderer2.push(`<li class="grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[7rem_1fr_auto] sm:items-baseline"><span class="font-mono text-sm text-forest-700 tabular">${escape_html(item.time)}</span> <span><span class="block font-display text-lg font-medium text-forest-950">${escape_html(item.title)}</span> `);
            if (item.location) {
              $$renderer2.push(`<!--[0--><span class="text-sm text-muted-foreground">${escape_html(item.location)}</span>`);
            } else {
              $$renderer2.push("<!--[-1-->");
            }
            $$renderer2.push(`<!--]--></span> <span class="eyebrow w-fit rounded-sm border border-line bg-cream-dark px-2 py-1 text-forest-800">${escape_html(tag(item.event))}</span></li>`);
          }
          $$renderer2.push(`<!--]--></ol></div>`);
        }
      } else {
        $$renderer2.push(`<!--[!--><p class="text-muted-foreground">Nothing scheduled for this event yet.</p>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push(`<!--[-1--><div class="rounded-lg border border-dashed border-forest-700/30 p-12 text-center"><p class="font-display text-2xl text-forest-950">The schedule will be announced soon.</p> <p class="mt-2 text-muted-foreground">Approved teams will receive timings ahead of the event.</p></div>`);
    }
    $$renderer2.push(`<!--]--></div></section>`);
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-DK87kW9A.js.map
