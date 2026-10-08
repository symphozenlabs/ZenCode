import './state.svelte-D_1B4cRP.js';
import { c as attr_class, d as stringify, f as clsx, g as spread_props, h as ensure_array_like, i as attr, e as escape_html } from './index.js-fmqScc5X.js';
import { p as page } from './index2-CqD-R3qc.js';
import { I as Icon, B as Button, A as Arrow_right } from './arrow-right-CCKWqhah.js';
import { A as AnimatedGrid } from './AnimatedGrid-BzTnzW2q.js';

function Logo($$renderer, $$props) {
  let { tone = "light", class: cls = "" } = $$props;
  $$renderer.push(`<span${attr_class(`inline-flex items-center gap-2.5 ${stringify(cls)}`)}><svg viewBox="0 0 32 32" class="size-8 shrink-0" aria-hidden="true"><rect width="32" height="32" rx="7"${attr_class(clsx(tone === "light" ? "fill-forest-800" : "fill-forest-950"))}></rect><path d="M9 10h14L9 22h14" fill="none" class="stroke-sun" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"></path></svg> <span${attr_class(`font-display text-[17px] font-bold tracking-[0.18em] ${tone === "light" ? "text-cream" : "text-forest-950"}`)}>ZENCODE</span></span>`);
}

function Menu($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "menu",
    "size": 24,
    "node": [
      ["path", { "d": "M4 5h16" }],
      ["path", { "d": "M4 12h16" }],
      ["path", { "d": "M4 19h16" }]
    ]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}

function SiteHeader($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const links = [
      { href: "/hackathon", label: "Hackathon" },
      { href: "/pitch-fest", label: "Pitch Fest" },
      { href: "/schedule", label: "Schedule" },
      { href: "/rules", label: "Rules" }
    ];
    let menuOpen = false;
    const isActive = (href) => page.url.pathname.startsWith(href);
    $$renderer2.push(`<header${attr_class(`fixed inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-200 ${"border-b border-transparent"}`)}><div class="shell flex h-16 items-center justify-between gap-6"><a href="/" aria-label="ZenCode home">`);
    Logo($$renderer2, {});
    $$renderer2.push(`<!----></a> <nav class="hidden items-center gap-1 md:flex" aria-label="Main"><!--[-->`);
    const each_array = ensure_array_like(links);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let l = each_array[$$index];
      $$renderer2.push(`<a${attr("href", l.href)}${attr("aria-current", isActive(l.href) ? "page" : void 0)} class="rounded-md px-3 py-2 text-sm text-cream/70 transition-colors duration-150 hover:text-cream aria-[current=page]:text-sun">${escape_html(l.label)}</a>`);
    }
    $$renderer2.push(`<!--]--></nav> <div class="flex items-center gap-2">`);
    Button($$renderer2, {
      href: "/register",
      variant: "sun",
      size: "md",
      class: "hidden sm:inline-flex",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->Register `);
        Arrow_right($$renderer3, { class: "size-4" });
        $$renderer3.push(`<!---->`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> <button type="button" class="grid size-10 place-items-center rounded-md text-cream md:hidden"${attr("aria-label", "Open menu")}${attr("aria-expanded", menuOpen)} aria-controls="mobile-nav">`);
    {
      $$renderer2.push("<!--[-1-->");
      Menu($$renderer2, { class: "size-5" });
    }
    $$renderer2.push(`<!--]--></button></div></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></header>`);
  });
}
function SiteFooter($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { config } = $$props;
    const year = (/* @__PURE__ */ new Date()).getFullYear();
    $$renderer2.push(`<footer class="relative overflow-hidden bg-stage text-cream"><section class="relative border-b border-stage-line">`);
    AnimatedGrid($$renderer2, { animated: false });
    $$renderer2.push(`<!----> <div class="shell relative flex flex-col items-start justify-between gap-8 py-16 md:flex-row md:items-end"><div><p class="eyebrow text-sun">Registrations</p> <h2 class="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">Your team. Your idea.<br/>Your stage.</h2></div> `);
    Button($$renderer2, {
      href: "/register",
      variant: "sun",
      size: "xl",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->Register for ${escape_html(config.name)}`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----></div></section> <div class="shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]"><div>`);
    Logo($$renderer2, {});
    $$renderer2.push(`<!----> <p class="mt-4 max-w-xs text-sm text-cream/60">${escape_html(config.tagline)}</p></div> <nav aria-label="Footer"><p class="eyebrow text-cream/40">Explore</p> <ul class="mt-4 space-y-2.5 text-sm text-cream/75"><li><a class="hover:text-sun" href="/hackathon">Hackathon</a></li> <li><a class="hover:text-sun" href="/pitch-fest">Pitch Fest</a></li> <li><a class="hover:text-sun" href="/schedule">Schedule</a></li> <li><a class="hover:text-sun" href="/rules">Rules</a></li></ul></nav> <div><p class="eyebrow text-cream/40">Contact</p> <ul class="mt-4 space-y-2.5 text-sm text-cream/75">`);
    if (config.contactEmail) {
      $$renderer2.push(`<!--[0--><li><a class="hover:text-sun"${attr("href", `mailto:${stringify(config.contactEmail)}`)}>${escape_html(config.contactEmail)}</a></li>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (config.venue || config.city) {
      $$renderer2.push(`<!--[0--><li>${escape_html([config.venue, config.city].filter(Boolean).join(", "))}</li>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (config.organizers.length) {
      $$renderer2.push(`<!--[0--><li class="text-cream/50">Organised by ${escape_html(config.organizers.join(", "))}</li>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (!config.contactEmail && !config.venue && !config.organizers.length) {
      $$renderer2.push(`<!--[0--><li class="text-cream/50">Details to be announced</li>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></ul></div></div> <div class="border-t border-stage-line"><div class="shell flex flex-wrap items-center justify-between gap-3 py-5 font-mono text-xs text-cream/40"><span>© ${escape_html(year)} ${escape_html(config.name)}</span> <a href="/admin/login" class="hover:text-cream/70">Organiser login</a></div></div></footer>`);
  });
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data, children } = $$props;
    $$renderer2.push(`<div class="site flex min-h-dvh flex-col bg-cream"><a href="#main" class="sr-only z-50 rounded-md bg-sun px-4 py-2 text-forest-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a> `);
    SiteHeader($$renderer2);
    $$renderer2.push(`<!----> <!---->`);
    {
      $$renderer2.push(`<main id="main" class="flex-1">`);
      children($$renderer2);
      $$renderer2.push(`<!----></main>`);
    }
    $$renderer2.push(`<!----> `);
    SiteFooter($$renderer2, { config: data.config });
    $$renderer2.push(`<!----></div>`);
  });
}

export { _layout as default };
//# sourceMappingURL=_layout.svelte-CFQUDFTJ.js.map
