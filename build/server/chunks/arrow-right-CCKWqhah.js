import { c as attr_class, d as stringify, i as attr, q as attributes, h as ensure_array_like, u as element, k as getContext, n as derived, v as fallback, w as to_array, f as clsx, g as spread_props } from './index.js-fmqScc5X.js';

const defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};
const mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
function isDefined(value) {
  return value !== null && value !== void 0;
}
function buildLucideIconNode(icon, params = {}) {
  const attributeNames = params.attributeNames ?? {};
  const getAttributeName = (attributeName) => attributeNames[attributeName] ?? attributeName;
  const viewBoxWidth = icon.size ?? icon.width ?? defaultAttributes["width"];
  const viewBoxHeight = icon.size ?? icon.height ?? defaultAttributes["height"];
  const aliasClassNames = icon.aliases?.filter((alias) => typeof alias === "string" && alias.trim() !== "").map((alias) => `lucide-${alias}`) ?? [];
  const iconClassNames = [...icon.name ? [`lucide-${icon.name}`] : [], ...aliasClassNames];
  const classNamesFromClassName = params.className?.split(" ").filter(Boolean) ?? [];
  const className = params.includeDefaultClasses === false ? mergeClasses(...classNamesFromClassName) : mergeClasses("lucide", ...iconClassNames, ...classNamesFromClassName);
  const calculatedStrokeWidth = params.absoluteStrokeWidth ? Number(params.strokeWidth ?? defaultAttributes["stroke-width"]) * Number(icon.size ?? icon.width ?? defaultAttributes["width"]) / Number(params.size ?? params.width ?? defaultAttributes["width"]) : params.strokeWidth ?? defaultAttributes["stroke-width"];
  const attributes2 = {
    ...Object.entries(defaultAttributes).reduce((attrs, [attrName, value]) => {
      attrs[getAttributeName(attrName)] = value;
      return attrs;
    }, {}),
    ..."color" in params && params.color && {
      [getAttributeName("stroke")]: params.color
    },
    ..."size" in params && isDefined(params.size) && {
      [getAttributeName("width")]: params.size,
      [getAttributeName("height")]: params.size
    },
    ..."width" in params && isDefined(params.width) && {
      [getAttributeName("width")]: params.width
    },
    ..."height" in params && isDefined(params.height) && {
      [getAttributeName("height")]: params.height
    },
    [getAttributeName("stroke-width")]: calculatedStrokeWidth,
    ...className && {
      [getAttributeName("class")]: className
    },
    [getAttributeName("viewBox")]: `0 0 ${viewBoxWidth} ${viewBoxHeight}`,
    ...params.hasA11yProp === false ? {
      [getAttributeName("aria-hidden")]: "true"
    } : {},
    ..."attributes" in params && params.attributes
  };
  return [
    "svg",
    attributes2,
    icon.node.map((child) => {
      const [name, attrs, children] = child;
      const nextAttrs = params.nonScalingStroke ? { [getAttributeName("vector-effect")]: "non-scaling-stroke", ...attrs } : attrs;
      return children ? [name, nextAttrs, children] : [name, nextAttrs];
    })
  ];
}
const hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
  return false;
};
const LucideContext = /* @__PURE__ */ Symbol("lucide-context");
const getLucideContext = () => getContext(LucideContext);
function Icon($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const globalProps = getLucideContext() ?? {};
    const {
      color = globalProps.color ?? "currentColor",
      size = globalProps.size ?? 24,
      width = size,
      height = size,
      strokeWidth = globalProps.strokeWidth ?? 2,
      absoluteStrokeWidth = globalProps.absoluteStrokeWidth ?? false,
      nonScalingStroke = globalProps.nonScalingStroke ?? false,
      iconNode = [],
      icon = { node: iconNode, aliases: [], size: 24 },
      class: propsClass,
      children,
      $$slots,
      $$events,
      ...props
    } = $$props;
    const hasAccessibleProp = derived(() => Boolean(children) || hasA11yProp(props));
    const $$d = derived(() => buildLucideIconNode(icon, {
      color,
      width,
      height,
      strokeWidth,
      absoluteStrokeWidth,
      nonScalingStroke,
      // @TODO: maybe drop the extra `lucide-icon` class altogether.
      className: mergeClasses("lucide-icon", globalProps.class),
      hasA11yProp: hasAccessibleProp(),
      attributes: props
    })), $$derived_array = derived(() => to_array($$d(), 3)), svgAttributes = derived(() => $$derived_array()[1]), builtIconNode = derived(() => fallback($$derived_array()[2], () => [], true));
    const iconAttributes = derived(() => ({
      ...svgAttributes(),
      class: [...svgAttributes().class.split(" "), propsClass]
    }));
    $$renderer2.push(`<svg${attributes({ ...iconAttributes() }, void 0, void 0, void 0, 3)}><!--[-->`);
    const each_array = ensure_array_like(builtIconNode());
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let [tag, attrs] = each_array[$$index];
      element($$renderer2, tag, () => {
        $$renderer2.push(`${attributes({ ...attrs }, void 0, void 0, void 0, 3)}`);
      });
    }
    $$renderer2.push(`<!--]-->`);
    children?.($$renderer2);
    $$renderer2.push(`<!----></svg>`);
  });
}
function Spinner($$renderer, $$props) {
  let { class: cls = "size-5", label } = $$props;
  $$renderer.push(`<svg${attr_class(`animate-spin ${stringify(cls)}`)} viewBox="0 0 24 24" fill="none"${attr("role", label ? "status" : void 0)}${attr("aria-label", label)}${attr("aria-hidden", label ? void 0 : "true")}><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.2" stroke-width="3"></circle><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path></svg>`);
}

function Button($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      variant = "default",
      size = "md",
      href,
      loading = false,
      disabled,
      type = "button",
      class: cls = "",
      children,
      $$slots,
      $$events,
      ...rest
    } = $$props;
    const variants = {
      default: "bg-primary text-primary-foreground hover:bg-primary-hover",
      outline: "border border-input bg-card text-foreground hover:bg-muted",
      secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
      ghost: "text-foreground hover:bg-muted",
      destructive: "bg-destructive text-white hover:bg-destructive/90",
      link: "text-forest-700 underline-offset-4 hover:underline px-0!",
      // Public site
      sun: "bg-sun text-forest-950 hover:bg-sun-light font-semibold",
      stage: "border border-green-300/30 text-cream hover:border-green-300/60 hover:bg-white/5"
    };
    const sizes = {
      sm: "h-8 px-3 text-[13px] gap-1.5",
      md: "h-9 px-4 text-sm gap-2",
      lg: "h-11 px-5 text-sm gap-2",
      xl: "h-13 px-7 text-[15px] gap-2.5 tracking-wide",
      icon: "size-9"
    };
    const classes = derived(() => [
      "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap select-none",
      "transition-[background-color,border-color,color,opacity] duration-150 active:translate-y-px",
      "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
      variants[variant],
      sizes[size],
      cls
    ].join(" "));
    if (href) {
      $$renderer2.push(`<!--[0--><a${attr("href", href)}${attr_class(clsx(classes()))}${attr("aria-disabled", disabled || void 0)}>`);
      children($$renderer2);
      $$renderer2.push(`<!----></a>`);
    } else {
      $$renderer2.push(`<!--[-1--><button${attributes({
        type,
        class: clsx(classes()),
        disabled: disabled || loading,
        "aria-busy": loading || void 0,
        ...rest
      })}>`);
      if (loading) {
        $$renderer2.push("<!--[0-->");
        Spinner($$renderer2, { class: "size-4" });
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      children($$renderer2);
      $$renderer2.push(`<!----></button>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}

function Arrow_right($$renderer, $$props) {
  let { $$slots, $$events, ...props } = $$props;
  const iconData = {
    "name": "arrow-right",
    "size": 24,
    "node": [
      ["path", { "d": "M5 12h14" }],
      ["path", { "d": "m12 5 7 7-7 7" }]
    ]
  };
  Icon($$renderer, spread_props([props, { icon: iconData }]));
}

export { Arrow_right as A, Button as B, Icon as I };
//# sourceMappingURL=arrow-right-CCKWqhah.js.map
