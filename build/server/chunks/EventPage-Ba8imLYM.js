import { l as head, e as escape_html, i as attr, d as stringify, h as ensure_array_like, n as derived, g as spread_props } from './index.js-fmqScc5X.js';
import { T as TBA, f as formatDateRange, a as formatDate } from './format-Cq0oKcht.js';
import { A as Arrow_right, I as Icon, B as Button } from './arrow-right-CCKWqhah.js';
import { P as PageHero } from './PageHero-Bld4OhxE.js';

function Layers($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "layers",
    "size": 24,
    "node": [
      [
        "path",
        {
          "d": "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"
        }
      ],
      [
        "path",
        {
          "d": "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"
        }
      ],
      [
        "path",
        {
          "d": "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"
        }
      ]
    ],
    "aliases": ["layers-3"]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}
function Scroll_text($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "scroll-text",
    "size": 24,
    "node": [
      ["path", { "d": "M15 12h-5" }],
      ["path", { "d": "M15 8h-5" }],
      ["path", { "d": "M19 17V5a2 2 0 0 0-2-2H4" }],
      [
        "path",
        {
          "d": "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"
        }
      ]
    ]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}
function Trophy($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "trophy",
    "size": 24,
    "node": [
      [
        "path",
        { "d": "M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2" }
      ],
      [
        "path",
        { "d": "M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2" }
      ],
      [
        "path",
        {
          "d": "M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"
        }
      ],
      ["path", { "d": "M4 22h16" }],
      [
        "path",
        { "d": "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" }
      ],
      [
        "path",
        { "d": "M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3" }
      ]
    ]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}
function EventPage($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { config, eventId } = $$props;
    const ev = derived(() => config.events[eventId]);
    const deadlinePassed = derived(() => !!ev().registrationDeadline && Date.now() > (/* @__PURE__ */ new Date(`${ev().registrationDeadline}T23:59:59`)).getTime());
    const open = derived(() => ev().registrationOpen && !deadlinePassed());
    const facts = derived(() => [
      { k: "Date", v: formatDateRange(ev().startDate, ev().endDate) },
      { k: "Duration", v: ev().duration || TBA },
      {
        k: "Team size",
        v: ev().teamMax <= 1 ? "Solo" : ev().teamMin === ev().teamMax ? `${ev().teamMin} people` : `${ev().teamMin}–${ev().teamMax} people`
      },
      {
        k: "Register by",
        v: formatDate(ev().registrationDeadline) || TBA
      },
      {
        k: "Venue",
        v: [config.venue, config.city].filter(Boolean).join(", ") || TBA
      }
    ]);
    head("1ueyzy1", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(ev().title)} — ${escape_html(config.name)}</title>`);
      });
      $$renderer3.push(`<meta name="description"${attr("content", ev().summary)}/>`);
    });
    {
      let aside = function($$renderer3) {
        $$renderer3.push(`<dl class="rise divide-y divide-stage-line rounded-lg border border-stage-line bg-stage-raised/70" style="--rise-delay: 200ms"><!--[-->`);
        const each_array = ensure_array_like(facts());
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let f = each_array[$$index];
          $$renderer3.push(`<div class="flex items-baseline justify-between gap-4 px-5 py-3.5"><dt class="eyebrow text-cream/45">${escape_html(f.k)}</dt> <dd class="text-right font-display text-[15px] font-medium text-cream">${escape_html(f.v)}</dd></div>`);
        }
        $$renderer3.push(`<!--]--></dl>`);
      };
      PageHero($$renderer2, {
        eyebrow: `${stringify(config.name)} · ${stringify(ev().title)}`,
        title: ev().title,
        description: ev().summary,
        aside,
        children: ($$renderer3) => {
          if (open()) {
            $$renderer3.push("<!--[0-->");
            Button($$renderer3, {
              href: `/register?event=${stringify(eventId)}`,
              variant: "sun",
              size: "xl",
              children: ($$renderer4) => {
                $$renderer4.push(`<!---->Register for ${escape_html(ev().title)} `);
                Arrow_right($$renderer4, { class: "size-4" });
                $$renderer4.push(`<!---->`);
              },
              $$slots: { default: true }
            });
          } else {
            $$renderer3.push(`<!--[-1--><span class="inline-flex h-13 items-center rounded-md border border-attention/40 px-6 font-mono text-sm text-attention">Registration closed</span>`);
          }
          $$renderer3.push(`<!--]--> `);
          Button($$renderer3, {
            href: "/rules",
            variant: "stage",
            size: "xl",
            children: ($$renderer4) => {
              $$renderer4.push(`<!---->Read the rules`);
            },
            $$slots: { default: true }
          });
          $$renderer3.push(`<!---->`);
        }
      });
    }
    $$renderer2.push(`<!----> <section class="py-20 md:py-24"><div class="shell grid gap-12 lg:grid-cols-[1fr_1.5fr]"><p class="eyebrow text-forest-700">About</p> <p class="font-display text-2xl leading-snug text-forest-950 md:text-3xl">${escape_html(ev().description)}</p></div></section> <section class="border-y border-line bg-cream-dark py-20 md:py-24"><div class="shell grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-3"><div class="bg-cream p-8">`);
    Layers($$renderer2, { class: "size-5 text-forest-700" });
    $$renderer2.push(`<!----> <h2 class="mt-5 font-display text-2xl font-semibold text-forest-950">Tracks</h2> `);
    if (ev().tracks.length) {
      $$renderer2.push(`<!--[0--><ul class="mt-5 space-y-2.5"><!--[-->`);
      const each_array_1 = ensure_array_like(ev().tracks);
      for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
        let t = each_array_1[i];
        $$renderer2.push(`<li class="flex gap-3 text-[15px] text-ink"><span class="font-mono text-xs leading-6 text-forest-700">${escape_html(String(i + 1).padStart(2, "0"))}</span>${escape_html(t)}</li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    } else {
      $$renderer2.push(`<!--[-1--><p class="mt-3 text-muted-foreground">Tracks will be announced.</p>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="bg-cream p-8">`);
    Trophy($$renderer2, { class: "size-5 text-forest-700" });
    $$renderer2.push(`<!----> <h2 class="mt-5 font-display text-2xl font-semibold text-forest-950">Prizes</h2> `);
    if (ev().prizes.length) {
      $$renderer2.push(`<!--[0--><ul class="mt-5 divide-y divide-line"><!--[-->`);
      const each_array_2 = ensure_array_like(ev().prizes);
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let p = each_array_2[$$index_2];
        $$renderer2.push(`<li class="flex items-baseline justify-between gap-4 py-2.5"><span class="eyebrow text-muted-foreground">${escape_html(p.place)}</span> <span class="text-right font-display font-medium text-forest-950">${escape_html(p.reward)}</span></li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    } else {
      $$renderer2.push(`<!--[-1--><p class="mt-3 text-muted-foreground">Prizes will be announced.</p>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="bg-cream p-8">`);
    Scroll_text($$renderer2, { class: "size-5 text-forest-700" });
    $$renderer2.push(`<!----> <h2 class="mt-5 font-display text-2xl font-semibold text-forest-950">Event rules</h2> `);
    if (ev().rules.length) {
      $$renderer2.push(`<!--[0--><ul class="mt-5 space-y-2.5 text-[15px] text-ink"><!--[-->`);
      const each_array_3 = ensure_array_like(ev().rules.slice(0, 5));
      for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
        let r = each_array_3[$$index_3];
        $$renderer2.push(`<li class="flex gap-3"><span class="mt-2.5 size-1 shrink-0 bg-forest-700"></span>${escape_html(r)}</li>`);
      }
      $$renderer2.push(`<!--]--></ul> <a href="/rules" class="mt-5 inline-flex items-center gap-1 text-sm font-medium text-forest-700 hover:underline">All rules `);
      Arrow_right($$renderer2, { class: "size-3.5" });
      $$renderer2.push(`<!----></a>`);
    } else {
      $$renderer2.push(`<!--[-1--><p class="mt-3 text-muted-foreground">Rules will be published before the event.</p>`);
    }
    $$renderer2.push(`<!--]--></div></div></section>`);
  });
}

export { EventPage as E };
//# sourceMappingURL=EventPage-Ba8imLYM.js.map
