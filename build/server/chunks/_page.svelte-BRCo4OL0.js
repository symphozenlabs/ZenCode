import { g as spread_props, l as head, e as escape_html, h as ensure_array_like, c as attr_class, m as attr_style, f as clsx, i as attr, n as derived, d as stringify } from './index.js-fmqScc5X.js';
import { E as EVENT_IDS } from './site-btfDK_Br.js';
import { f as formatDateRange, T as TBA } from './format-Cq0oKcht.js';
import { I as Icon, B as Button, A as Arrow_right } from './arrow-right-CCKWqhah.js';
import { A as AnimatedGrid } from './AnimatedGrid-BzTnzW2q.js';
import { G as GlowBackground } from './GlowBackground-Bg7XLi8r.js';
import { N as NoiseOverlay } from './NoiseOverlay-D77bFNIU.js';

function Badge_check($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "badge-check",
    "size": 24,
    "node": [
      [
        "path",
        {
          "d": "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        }
      ],
      ["path", { "d": "m16 9-5.5 5.5L8 12" }]
    ],
    "aliases": ["verified"]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}

function Arrow_up_right($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "arrow-up-right",
    "size": 24,
    "node": [
      ["path", { "d": "M7 7h10v10" }],
      ["path", { "d": "M7 17 17 7" }]
    ]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}
function Hammer($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "hammer",
    "size": 24,
    "node": [
      ["path", { "d": "m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9" }],
      ["path", { "d": "m18 15 4-4" }],
      [
        "path",
        {
          "d": "m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"
        }
      ]
    ]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}
function Mic($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "mic",
    "size": 24,
    "node": [
      ["path", { "d": "M12 19v3" }],
      ["path", { "d": "M19 10v2a7 7 0 0 1-14 0v-2" }],
      [
        "rect",
        { "x": "9", "y": "2", "width": "6", "height": "13", "rx": "3" }
      ]
    ]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}
function User_plus($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "user-plus",
    "size": 24,
    "node": [
      ["path", { "d": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
      ["circle", { "cx": "9", "cy": "7", "r": "4" }],
      ["line", { "x1": "19", "x2": "19", "y1": "8", "y2": "14" }],
      ["line", { "x1": "22", "x2": "16", "y1": "11", "y2": "11" }]
    ]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}
function ParticleField($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { class: cls = "" } = $$props;
    $$renderer2.push(`<canvas aria-hidden="true"${attr_class(`pointer-events-none absolute inset-0 h-full w-full ${stringify(cls)}`)}></canvas>`);
  });
}
function FloatingShapes($$renderer) {
  const shapes = [
    { kind: "square", x: "8%", y: "22%", s: 46, d: "0s" },
    { kind: "tri", x: "86%", y: "18%", s: 54, d: "-4s" },
    { kind: "circle", x: "78%", y: "72%", s: 38, d: "-8s" },
    { kind: "plus", x: "16%", y: "76%", s: 30, d: "-2s" },
    { kind: "bracket", x: "92%", y: "46%", s: 34, d: "-6s" }
  ];
  $$renderer.push(`<div aria-hidden="true" class="pointer-events-none absolute inset-0 hidden md:block"><!--[-->`);
  const each_array = ensure_array_like(shapes);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let s = each_array[$$index];
    $$renderer.push(`<svg class="absolute animate-float-slow text-green-300/25"${attr("width", s.s)}${attr("height", s.s)} viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"${attr_style("", { left: s.x, top: s.y, "animation-delay": s.d })}>`);
    if (s.kind === "square") {
      $$renderer.push(`<!--[0--><rect x="6" y="6" width="28" height="28" transform="rotate(12 20 20)"></rect>`);
    } else if (s.kind === "tri") {
      $$renderer.push(`<!--[1--><path d="M20 5 L36 33 H4 Z"></path>`);
    } else if (s.kind === "circle") {
      $$renderer.push(`<!--[2--><circle cx="20" cy="20" r="14"></circle>`);
    } else if (s.kind === "plus") {
      $$renderer.push(`<!--[3--><path d="M20 6 V34 M6 20 H34"></path>`);
    } else {
      $$renderer.push(`<!--[-1--><path d="M15 6 H8 V34 H15 M25 6 H32 V34 H25"></path>`);
    }
    $$renderer.push(`<!--]--></svg>`);
  }
  $$renderer.push(`<!--]--></div>`);
}
function GradientOrb($$renderer, $$props) {
  let { tone = "green", size = "28rem", class: cls = "" } = $$props;
  const color = derived(() => tone === "sun" ? "var(--color-sun)" : "var(--color-green-500)");
  $$renderer.push(`<div aria-hidden="true"${attr_class(`pointer-events-none absolute animate-orb rounded-full opacity-30 blur-3xl ${stringify(cls)}`)}${attr_style("", {
    width: size,
    height: size,
    background: `radial-gradient(closest-side, ${color()}, transparent)`
  })}></div>`);
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    const config = derived(() => data.config);
    const words = ["CODE.", "CREATE.", "COMPETE."];
    const eventHref = { hackathon: "/hackathon", "pitch-fest": "/pitch-fest" };
    const teamLabel = (min, max) => max <= 1 ? "Solo" : min === max ? `${min} per team` : `${min}–${max} per team`;
    const steps = [
      {
        icon: User_plus,
        title: "Register",
        body: "Pick an event and sign up with your team in a few minutes."
      },
      {
        icon: Badge_check,
        title: "Get approved",
        body: "Organisers review every entry. Keep your registration ID handy."
      },
      {
        icon: Hammer,
        title: "Build",
        body: "Show up, plug in and turn the idea into something that works."
      },
      {
        icon: Mic,
        title: "Demo & pitch",
        body: "Take the stage, show what you made and answer the panel."
      }
    ];
    const venue = derived(() => [config().venue, config().city].filter(Boolean).join(", ") || TBA);
    const regStatus = derived(() => EVENT_IDS.some((id) => config().events[id].registrationOpen) ? "Open now" : "Closed");
    head("1ewzqr7", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(config().name)} — ${escape_html(config().tagline)}</title>`);
      });
      $$renderer3.push(`<meta name="description"${attr("content", `${stringify(config().name)}: Hackathon and Pitch Fest. ${stringify(config().tagline)}`)}/>`);
    });
    $$renderer2.push(`<section class="relative isolate overflow-hidden bg-stage pt-16 text-cream">`);
    AnimatedGrid($$renderer2, {});
    $$renderer2.push(`<!----> `);
    GlowBackground($$renderer2, {});
    $$renderer2.push(`<!----> `);
    ParticleField($$renderer2, {});
    $$renderer2.push(`<!----> `);
    FloatingShapes($$renderer2);
    $$renderer2.push(`<!----> `);
    NoiseOverlay($$renderer2, {});
    $$renderer2.push(`<!----> <div class="shell relative grid min-h-[calc(100dvh-4rem)] items-center gap-14 py-16 lg:grid-cols-[1.35fr_1fr]"><div><p class="eyebrow rise flex items-center gap-2 text-sun"><span class="size-1.5 animate-pulse-dot rounded-full bg-sun"></span> ${escape_html(config().name)}${escape_html(config().edition ? ` ${config().edition}` : "")}</p> <h1 class="mt-6 font-display text-[clamp(3.4rem,11vw,8.5rem)] leading-[0.88] font-bold tracking-[-0.03em]" aria-label="Code. Create. Compete."><!--[-->`);
    const each_array = ensure_array_like(words);
    for (let i = 0, $$length = each_array.length; i < $$length; i++) {
      let w = each_array[i];
      $$renderer2.push(`<span${attr_class(`rise block ${i === 2 ? "text-sun" : ""}`)}${attr_style(`--rise-delay: ${stringify(120 + i * 130)}ms`)} aria-hidden="true">${escape_html(w)}</span>`);
    }
    $$renderer2.push(`<!--]--></h1> <p class="rise mt-8 font-mono text-sm tracking-[0.2em] text-cream/60 uppercase" style="--rise-delay: 560ms">Hackathon <span class="text-green-300">•</span> Pitch Fest</p> <div class="rise mt-10 flex flex-wrap gap-3" style="--rise-delay: 680ms">`);
    Button($$renderer2, {
      href: "/register",
      variant: "sun",
      size: "xl",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->Register now `);
        Arrow_right($$renderer3, { class: "size-4" });
        $$renderer3.push(`<!---->`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    Button($$renderer2, {
      href: "#events",
      variant: "stage",
      size: "xl",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->Explore events`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----></div></div> <div class="rise hidden lg:block" style="--rise-delay: 820ms"><div class="overflow-hidden rounded-lg border border-stage-line bg-stage-raised/80 shadow-2xl shadow-black/40"><div class="flex items-center gap-2 border-b border-stage-line px-4 py-3"><span class="size-2.5 rounded-full bg-cream/15"></span> <span class="size-2.5 rounded-full bg-cream/15"></span> <span class="size-2.5 rounded-full bg-cream/15"></span> <span class="ml-3 font-mono text-xs text-cream/40">zencode — events</span></div> <div class="space-y-4 p-5 font-mono text-[13px] leading-relaxed"><p class="text-cream/50"><span class="text-green-300">$</span> zencode --list-events</p> <!--[-->`);
    const each_array_1 = ensure_array_like(EVENT_IDS);
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let id = each_array_1[$$index_1];
      const ev = config().events[id];
      $$renderer2.push(`<div class="border-l-2 border-green-300/40 pl-3"><p class="text-cream">${escape_html(ev.title)}</p> <p class="text-cream/50">date   ${escape_html(formatDateRange(ev.startDate, ev.endDate))}</p> <p class="text-cream/50">team   ${escape_html(teamLabel(ev.teamMin, ev.teamMax))}</p> <p${attr_class(clsx(ev.registrationOpen ? "text-green-300" : "text-attention"))}>status ${escape_html(ev.registrationOpen ? "registration open" : "registration closed")}</p></div>`);
    }
    $$renderer2.push(`<!--]--> <p class="text-cream/50"><span class="text-green-300">$</span> venue: <span class="text-cream/80">${escape_html(venue())}</span><span class="ml-1 inline-block h-4 w-2 translate-y-0.5 animate-pulse-dot bg-sun"></span></p></div></div></div></div></section> <section class="border-b border-line bg-cream-dark"><dl class="shell grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x"><!--[-->`);
    const each_array_2 = ensure_array_like([
      {
        k: "Hackathon",
        v: formatDateRange(config().events.hackathon.startDate, config().events.hackathon.endDate)
      },
      {
        k: "Pitch Fest",
        v: formatDateRange(config().events["pitch-fest"].startDate, config().events["pitch-fest"].endDate)
      },
      { k: "Venue", v: venue() },
      { k: "Registration", v: regStatus() }
    ]);
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let f = each_array_2[$$index_2];
      $$renderer2.push(`<div class="px-0 py-6 md:px-6 md:first:pl-0"><dt class="eyebrow text-muted-foreground">${escape_html(f.k)}</dt> <dd class="mt-1.5 font-display text-lg font-medium text-forest-950">${escape_html(f.v)}</dd></div>`);
    }
    $$renderer2.push(`<!--]--></dl></section> <section id="events" class="scroll-mt-16 py-24 md:py-28"><div class="shell"><div class="flex flex-wrap items-end justify-between gap-6"><div><p class="eyebrow text-forest-700">The events</p> <h2 class="mt-3 max-w-xl font-display text-4xl font-semibold tracking-tight text-forest-950 md:text-6xl">Two stages. Build it, then pitch it.</h2></div></div> <div class="mt-14 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2"><!--[-->`);
    const each_array_3 = ensure_array_like(EVENT_IDS);
    for (let i = 0, $$length = each_array_3.length; i < $$length; i++) {
      let id = each_array_3[i];
      const ev = config().events[id];
      $$renderer2.push(`<a${attr("href", eventHref[id])} class="group relative flex flex-col bg-cream p-8 transition-colors duration-200 hover:bg-white md:p-10"><div class="flex items-start justify-between"><span class="font-mono text-sm text-forest-700">0${escape_html(i + 1)}</span> `);
      Arrow_up_right($$renderer2, {
        class: "size-6 text-forest-700 transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-1"
      });
      $$renderer2.push(`<!----></div> <h3 class="mt-16 font-display text-4xl font-semibold tracking-tight text-forest-950 md:text-5xl">${escape_html(ev.title)}</h3> <p class="mt-4 max-w-md text-[17px] leading-relaxed text-muted-foreground">${escape_html(ev.summary)}</p> <dl class="mt-10 grid grid-cols-3 gap-4 border-t border-line pt-6 text-sm"><div><dt class="eyebrow text-muted-foreground">Date</dt> <dd class="mt-1 font-medium text-forest-950">${escape_html(formatDateRange(ev.startDate, ev.endDate))}</dd></div> <div><dt class="eyebrow text-muted-foreground">Team</dt> <dd class="mt-1 font-medium text-forest-950">${escape_html(teamLabel(ev.teamMin, ev.teamMax))}</dd></div> <div><dt class="eyebrow text-muted-foreground">Entry</dt> <dd${attr_class(`mt-1 font-medium ${ev.registrationOpen ? "text-forest-700" : "text-destructive"}`)}>${escape_html(ev.registrationOpen ? "Open" : "Closed")}</dd></div></dl></a>`);
    }
    $$renderer2.push(`<!--]--></div></div></section> <section class="relative overflow-hidden bg-forest-950 py-24 text-cream md:py-28">`);
    AnimatedGrid($$renderer2, { animated: false, masked: true });
    $$renderer2.push(`<!----> `);
    GradientOrb($$renderer2, { tone: "sun", class: "-bottom-40 -left-32" });
    $$renderer2.push(`<!----> <div class="shell relative"><div><p class="eyebrow text-sun">How it works</p> <h2 class="mt-3 max-w-xl font-display text-4xl font-semibold tracking-tight md:text-5xl">From sign-up to stage in four steps.</h2></div> <ol class="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8"><!--[-->`);
    const each_array_4 = ensure_array_like(steps);
    for (let i = 0, $$length = each_array_4.length; i < $$length; i++) {
      let s = each_array_4[i];
      $$renderer2.push(`<li class="relative border-t border-green-300/25 pt-6"><span class="absolute -top-px left-0 h-px w-12 bg-sun"></span> <div class="flex items-center gap-3"><span class="font-mono text-xs text-sun">0${escape_html(i + 1)}</span> `);
      if (s.icon) {
        $$renderer2.push("<!--[-->");
        s.icon($$renderer2, { class: "size-5 text-green-300" });
        $$renderer2.push("<!--]-->");
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push("<!--]-->");
      }
      $$renderer2.push(`</div> <h3 class="mt-5 font-display text-2xl font-semibold">${escape_html(s.title)}</h3> <p class="mt-2 text-[15px] leading-relaxed text-cream/65">${escape_html(s.body)}</p></li>`);
    }
    $$renderer2.push(`<!--]--></ol></div></section> <section class="py-24 md:py-28"><div class="shell grid gap-12 lg:grid-cols-[1fr_1.6fr]"><div><p class="eyebrow text-forest-700">Schedule</p> <h2 class="mt-3 font-display text-4xl font-semibold tracking-tight text-forest-950 md:text-5xl">What happens when.</h2> `);
    Button($$renderer2, {
      href: "/schedule",
      variant: "outline",
      size: "lg",
      class: "mt-8",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->Full schedule `);
        Arrow_right($$renderer3, { class: "size-4" });
        $$renderer3.push(`<!---->`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----></div> <div>`);
    if (config().schedule.length) {
      $$renderer2.push(`<!--[0--><ul class="divide-y divide-line border-y border-line"><!--[-->`);
      const each_array_5 = ensure_array_like(config().schedule.slice(0, 5));
      for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
        let item = each_array_5[$$index_5];
        $$renderer2.push(`<li class="grid grid-cols-[6.5rem_1fr] gap-4 py-5 sm:grid-cols-[9rem_1fr_auto]"><span class="font-mono text-sm text-forest-700 tabular">${escape_html(item.day)}<br/>${escape_html(item.time)}</span> <span class="font-display text-lg font-medium text-forest-950">${escape_html(item.title)}</span> <span class="hidden text-sm text-muted-foreground sm:block">${escape_html(item.location)}</span></li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    } else {
      $$renderer2.push(`<!--[-1--><div class="rounded-lg border border-dashed border-forest-700/30 p-10 text-center"><p class="font-display text-xl text-forest-950">The schedule will be announced soon.</p> <p class="mt-2 text-muted-foreground">Register now and we'll share timings with approved teams.</p></div>`);
    }
    $$renderer2.push(`<!--]--></div></div></section> `);
    if (config().sponsors.length) {
      $$renderer2.push(`<!--[0--><section class="border-t border-line bg-cream-dark py-16"><div class="shell"><p class="eyebrow text-center text-muted-foreground">Supported by</p> <ul class="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6"><!--[-->`);
      const each_array_6 = ensure_array_like(config().sponsors);
      for (let $$index_6 = 0, $$length = each_array_6.length; $$index_6 < $$length; $$index_6++) {
        let s = each_array_6[$$index_6];
        $$renderer2.push(`<li>`);
        if (s.url) {
          $$renderer2.push(`<!--[0--><a${attr("href", s.url)} rel="noopener" target="_blank" class="font-display text-xl font-semibold text-forest-900/70 hover:text-forest-950">${escape_html(s.name)}</a>`);
        } else {
          $$renderer2.push(`<!--[-1--><span class="font-display text-xl font-semibold text-forest-900/70">${escape_html(s.name)}</span>`);
        }
        $$renderer2.push(`<!--]--></li>`);
      }
      $$renderer2.push(`<!--]--></ul></div></section>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-BRCo4OL0.js.map
