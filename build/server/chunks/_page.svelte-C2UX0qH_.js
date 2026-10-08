import { o as props_id, c as attr_class, d as stringify, i as attr, f as clsx, e as escape_html, q as attributes, r as bind_props, n as derived, g as spread_props, l as head, h as ensure_array_like } from './index.js-fmqScc5X.js';
import './state.svelte-D_1B4cRP.js';
import { e as emptyRegistration } from './registration-BcueNbWR.js';
import { I as Icon, B as Button, A as Arrow_right } from './arrow-right-CCKWqhah.js';
import { A as AnimatedGrid } from './AnimatedGrid-BzTnzW2q.js';
import { G as GlowBackground } from './GlowBackground-Bg7XLi8r.js';
import './site-btfDK_Br.js';

function Field($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      label,
      value = void 0,
      error,
      hint,
      tone = "product",
      id,
      class: cls = "",
      $$slots,
      $$events,
      ...rest
    } = $$props;
    const inputId = derived(() => id ?? `f-${uid}`);
    const describedBy = derived(() => error ? `${inputId()}-err` : hint ? `${inputId()}-hint` : void 0);
    $$renderer2.push(`<div${attr_class(`flex flex-col gap-1.5 ${stringify(cls)}`)}><label${attr("for", inputId())}${attr_class(clsx(tone === "site" ? "font-mono text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase" : "text-[13px] font-medium text-foreground"))}>${escape_html(label)}</label> <input${attributes(
      {
        id: inputId(),
        value,
        "aria-invalid": error ? "true" : void 0,
        "aria-describedby": describedBy(),
        class: `w-full rounded-md border bg-card text-foreground placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] duration-150 outline-none focus:border-ring focus:ring-3 focus:ring-ring/20 ${tone === "site" ? "h-12 px-4 text-base" : "h-9 px-3 text-sm"} ${error ? "border-destructive" : "border-input"}`,
        ...rest
      },
      void 0,
      void 0,
      void 0,
      4
    )}/> `);
    if (error) {
      $$renderer2.push(`<!--[0--><p${attr("id", `${stringify(inputId())}-err`)} class="text-[13px] text-destructive">${escape_html(error)}</p>`);
    } else if (hint) {
      $$renderer2.push(`<!--[1--><p${attr("id", `${stringify(inputId())}-hint`)} class="text-[13px] text-muted-foreground">${escape_html(hint)}</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
    bind_props($$props, { value });
  });
}

function Check($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "check",
    "size": 24,
    "node": [["path", { "d": "M20 6 9 17l-5-5" }]]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}

function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    const config = derived(() => data.config);
    const STEPS = ["Personal", "Academic", "Event", "Team", "Review"];
    let form = emptyRegistration();
    let step = 0;
    let errors = {};
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      head("1c0wpx5", $$renderer3, ($$renderer4) => {
        $$renderer4.title(($$renderer5) => {
          $$renderer5.push(`<title>Register — ${escape_html(config().name)}</title>`);
        });
      });
      {
        $$renderer3.push(`<!--[-1--><section class="relative overflow-hidden bg-stage pt-16 text-cream">`);
        AnimatedGrid($$renderer3, {});
        $$renderer3.push(`<!----> `);
        GlowBackground($$renderer3, { class: "opacity-50" });
        $$renderer3.push(`<!----> <div class="shell relative py-14 md:py-16"><p class="eyebrow text-sun">Registration</p> <h1 class="mt-3 font-display text-4xl font-semibold tracking-tight md:text-6xl">Join ${escape_html(config().name)}.</h1> <p class="mt-3 max-w-xl text-cream/65">No account needed — fill in the form and you'll get a registration ID.</p></div></section> <section class="py-12 md:py-16" style="scroll-margin-top: 5rem"><div class="shell grid gap-10 lg:grid-cols-[15rem_1fr]"><nav aria-label="Registration progress"><ol class="flex gap-1 overflow-x-auto pb-2 lg:sticky lg:top-24 lg:flex-col lg:gap-0 lg:overflow-visible"><!--[-->`);
        const each_array_2 = ensure_array_like(STEPS);
        for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
          let label = each_array_2[i];
          const done = i < step;
          const current = i === step;
          $$renderer3.push(`<li class="flex-1 lg:flex-none"><button type="button"${attr("disabled", i > step, true)}${attr("aria-current", current ? "step" : void 0)}${attr_class(`group flex w-full min-w-[4.5rem] flex-col items-start gap-1 border-t-2 pt-2 text-left transition-colors duration-200 lg:flex-row lg:items-center lg:gap-3 lg:border-t-0 lg:border-l-2 lg:py-3 lg:pl-4 ${current ? "border-forest-700" : done ? "border-forest-700/40" : "border-line"}`)}><span${attr_class(`font-mono text-xs ${current ? "text-forest-700" : "text-muted-foreground"}`)}>`);
          if (done) {
            $$renderer3.push("<!--[0-->");
            Check($$renderer3, { class: "inline size-3.5 text-forest-700" });
          } else {
            $$renderer3.push(`<!--[-1-->0${escape_html(i + 1)}`);
          }
          $$renderer3.push(`<!--]--></span> <span${attr_class(`text-[13px] font-medium lg:text-[15px] ${current ? "text-forest-950" : "text-muted-foreground"}`)}>${escape_html(label)}</span></button></li>`);
        }
        $$renderer3.push(`<!--]--></ol></nav> <div class="min-w-0 overflow-hidden rounded-lg border border-line bg-white"><!---->`);
        {
          $$renderer3.push(`<form class="p-6 md:p-10" novalidate=""><p class="font-mono text-xs text-forest-700">Step 0${escape_html(step + 1)} / 05</p> <h2 class="mt-2 font-display text-3xl font-semibold tracking-tight text-forest-950">${escape_html(STEPS[step])}</h2> <div class="mt-8">`);
          {
            $$renderer3.push(`<!--[0--><div class="grid gap-5 md:grid-cols-2">`);
            Field($$renderer3, {
              tone: "site",
              class: "md:col-span-2",
              label: "Full name",
              error: errors["personal.name"],
              autocomplete: "name",
              maxlength: 80,
              get value() {
                return form.personal.name;
              },
              set value($$value) {
                form.personal.name = $$value;
                $$settled = false;
              }
            });
            $$renderer3.push(`<!----> `);
            Field($$renderer3, {
              tone: "site",
              label: "Email",
              type: "email",
              error: errors["personal.email"],
              autocomplete: "email",
              inputmode: "email",
              get value() {
                return form.personal.email;
              },
              set value($$value) {
                form.personal.email = $$value;
                $$settled = false;
              }
            });
            $$renderer3.push(`<!----> `);
            Field($$renderer3, {
              tone: "site",
              label: "Phone",
              type: "tel",
              error: errors["personal.phone"],
              autocomplete: "tel",
              inputmode: "tel",
              get value() {
                return form.personal.phone;
              },
              set value($$value) {
                form.personal.phone = $$value;
                $$settled = false;
              }
            });
            $$renderer3.push(`<!----></div>`);
          }
          $$renderer3.push(`<!--]--></div> `);
          {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> <div class="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">`);
          {
            $$renderer3.push(`<!--[-1--><span></span>`);
          }
          $$renderer3.push(`<!--]--> `);
          {
            $$renderer3.push("<!--[0-->");
            Button($$renderer3, {
              type: "submit",
              variant: "default",
              size: "lg",
              class: "min-w-32",
              children: ($$renderer4) => {
                $$renderer4.push(`<!---->Continue `);
                Arrow_right($$renderer4, { class: "size-4" });
                $$renderer4.push(`<!---->`);
              },
              $$slots: { default: true }
            });
          }
          $$renderer3.push(`<!--]--></div></form>`);
        }
        $$renderer3.push(`<!----></div></div></section>`);
      }
      $$renderer3.push(`<!--]-->`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-C2UX0qH_.js.map
