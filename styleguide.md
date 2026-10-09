# SymphoServe UI Style Guide

This guide captures the current SymphoServe interface language across the public website, restaurant admin portal, product owner dashboard, and kitchen display. Use it as the default reference when adding screens, components, copy, or visual assets.

## Product Character

SymphoServe should feel calm, practical, restaurant-specific, and dependable under time pressure. The product UI is built for people who are standing, moving, serving guests, checking tickets, closing bills, and making quick operational decisions.

The marketing site can be warmer and more editorial, but the product surfaces should stay quiet, scannable, and work-focused. Avoid generic SaaS decoration, ornamental gradients, excessive shadows, oversized cards, and layouts that make operational tasks feel like a landing page.

## UI Surfaces

### Public Website

The public website is warm, hospitality-oriented, and brand-led.

- Use cream backgrounds, forest green hero sections, gold accents, and large editorial headings.
- Use the SymphoServe logo prominently in the sticky header and footer.
- Use the Symba assistant artwork as a friendly brand cue, not as decoration everywhere.
- Favor full-width sections, strong typographic rhythm, and clean content grids.
- Primary calls to action should be direct: `Book a Demo`, `Explore the platform`, `Meet Symba AI`.

### Restaurant Admin Portal

The admin portal is a dense operational workspace.

- Use a persistent forest sidebar on desktop and a slide-in sidebar on mobile.
- Keep the top bar compact, sticky, and utility-oriented.
- Use panels, tables, status badges, filters, and action rows for repeated workflows.
- Every screen should have one clear primary action.
- Use live indicators and refresh states where operational data changes frequently.

### Product Owner Dashboard

The product owner dashboard shares the admin portal's product system, but it is more back-office and governance-oriented.

- Keep layouts restrained, compact, and data-first.
- Use the same forest sidebar, muted green surfaces, Inter typography, and shadcn-style controls.
- Use page headers, stat cards, tables, audit timelines, status badges, and forms consistently.

### Kitchen Display System

The KDS is a deliberate exception to the light admin UI.

- Use a dark, high-contrast background.
- Use large touch targets, status-first cards, and bold labels.
- Prefer landscape-first layouts with a left workload sidebar and a large card grid.
- Keep color reserved for status, urgency, and action.
- Do not borrow KDS dark styling for normal admin pages.

## Color System

### Current Product Palette

The current product UI is led by forest green, muted green surfaces, cream neutrals, and warm gold/orange accents.

| Token | Value | Use |
| --- | --- | --- |
| Forest 950 | `#0d2d20` | Deep marketing backgrounds, strongest brand text |
| Forest 900 | `#133a29` | Website hero and dark sections |
| Forest 800 | `#17462e` | Product sidebars, primary brand blocks |
| Forest 700 | `#28613f` | Links, hover states, supporting emphasis |
| Product primary | `#3f7334` | Admin and POD primary actions |
| Brand green | `#588c45` | Focus rings, charts, data grid accents |
| Green 500 | `#629b4d` | Marketing accents |
| Green 100 | `#e9f2e3` | Soft chips and website highlights |
| Cream | `#f8f7f2` | Website background |
| Cream dark | `#eeece3` | Warm website bands |
| Product background | `#f6f8f4` | Admin and POD background |
| Product card | `#ffffff` | Cards, dialogs, tables |
| Product muted | `#f0f3ee` | Inputs, subtle blocks, hover backgrounds |
| Product border | `#dce5d9` | Product borders |
| Ink | `#1c2921` | Website body text |
| Product foreground | `#18231a` | Admin and POD body text |
| Muted text | `#647064` / `#68736b` | Supporting text |
| Sun | `#f0c45c` | Website accent and warm CTA |
| Orange | `#f97316` | Attention, bill requests, notification counts |
| Destructive | `#b42318` | Product destructive actions |

### Status Colors

Always pair color with readable text. Do not rely on color alone.

| Status | Treatment |
| --- | --- |
| New / ordering / issued | Green-blue or emerald-tinted badge in the current admin theme |
| Accepted / billed | Green or secondary positive badge |
| Preparing | Amber badge |
| Ready / paid / available / printed | Emerald badge |
| Served / closed / draft / unavailable | Neutral zinc or muted badge |
| Bill requested / payment pending | Orange badge |
| Rejected / cancelled / void / failed | Red badge |
| KDS new | Light gray |
| KDS preparing / partial | Yellow |
| KDS ready | Green |
| KDS late | Red |

### Legacy Color Note

Older design-system notes reference navy `#072D6C` and cyan `#12A9D6`. Treat those as legacy anchors unless a screen already uses them. New product work should follow the current forest-green system.

## Typography

### Product UI

- Use `Inter Variable` for admin and product dashboard screens.
- Body text: `14px` to `16px`.
- Page titles: `24px` to `28px`, semibold, tight but readable.
- Section titles: `16px` to `20px`, semibold.
- Labels and metadata: `11px` to `13px`, semibold where needed.
- Use tabular figures for money, order numbers, time, counts, and metrics.
- Avoid negative letter spacing in compact product UI except where already inherited from existing components.

### Marketing UI

- Use the existing marketing split: display headings in `Playfair Display`, UI text in `Google Sans` or the system sans fallback.
- Hero headings use large editorial sizing, roughly `44px` to `76px`.
- Section headings use `36px` to `58px`.
- Body copy stays relaxed at `16px` to `20px` with generous line height.
- Use uppercase eyebrow labels sparingly, usually `10px` to `12px` with wide tracking.

## Spacing And Density

- Use a 4px base rhythm.
- Product pages should feel compact but never cramped.
- Admin and POD content usually uses `16px`, `24px`, or `32px` page spacing.
- Repeated panels use `16px` to `24px` internal padding.
- Touch targets should be at least `44px` high for mobile, KDS, and high-frequency operational actions.
- Website sections can breathe more, commonly `80px` to `110px` vertical padding on desktop.

## Shape, Borders, And Shadows

- Product controls: rounded medium, usually `6px` to `10px`.
- Product panels and cards: `8px` to `12px`.
- Marketing feature cards can be more squared and editorial; avoid excessive pill shapes.
- KDS cards use firm rectangular structure with rounded corners and high contrast.
- Prefer borders and spacing over heavy shadows.
- Shadows should be shallow in product UI. Use stronger shadows only for overlays, menus, popovers, and marketing hero visuals.

## Core Tokens

Use semantic CSS variables where the app provides them.

```css
:root {
  --background: #f6f8f4;
  --foreground: #18231a;
  --card: #ffffff;
  --primary: #3f7334;
  --primary-foreground: #ffffff;
  --secondary: #eef4ea;
  --secondary-foreground: #2f5a29;
  --muted: #f0f3ee;
  --muted-foreground: #647064;
  --accent: #e5f0df;
  --accent-foreground: #2f5f29;
  --destructive: #b42318;
  --border: #dce5d9;
  --input: #cedacb;
  --ring: #588c45;
  --sidebar: #17462e;
  --sidebar-accent: #23613f;
  --sidebar-primary: #8dbd77;
  --radius: 0.4rem;
}
```

Marketing-specific CSS variables currently live in the website layout:

```css
:root {
  --forest-950: #0d2d20;
  --forest-900: #133a29;
  --forest-800: #17462e;
  --forest-700: #28613f;
  --green-500: #629b4d;
  --green-100: #e9f2e3;
  --cream: #f8f7f2;
  --cream-dark: #eeece3;
  --ink: #1c2921;
  --muted: #68736b;
  --line: #dfe4dd;
  --sun: #f0c45c;
  --sun-light: #f9e5a9;
}
```

## Components

### Buttons

Product buttons use the shadcn-style variants already in the codebase.

| Variant | Use |
| --- | --- |
| `default` | Primary screen action |
| `outline` | Secondary action on light surfaces |
| `secondary` | Lower-emphasis grouped actions |
| `ghost` | Toolbar, menu, icon, and row actions |
| `destructive` | Dangerous or irreversible actions |
| `link` | Text-style navigation |

Guidelines:

- Use one primary button per screen section.
- Include icons for tool actions where the meaning is familiar.
- Keep button labels short and action-oriented.
- Default product button height is compact (`36px`), but operational actions often use `40px` to `44px`.
- Disabled buttons should keep their layout and reduce opacity.
- Active press may translate by 1px, as current product buttons do.

### Inputs And Forms

- Inputs use white or muted backgrounds, green focus rings, and compact labels.
- Use visible labels or `sr-only` labels for every field.
- Use `14px` input text in product UI.
- Group related fields in bordered white panels.
- Put help text below the field, not in large instructional blocks.
- Errors use red text and should explain what action is needed.

### Panels And Cards

Use panels for operational grouping, not decoration.

- Product panels: white background, `1px` border, subtle shadow only when needed.
- Stat cards: label, value, optional helper, optional icon chip.
- Repeated cards should have stable dimensions where possible.
- Avoid cards inside cards. Use sections, dividers, or grid layout instead.

### Page Headers

Product page headers should include:

- Optional eyebrow or contextual date.
- Clear page title.
- One-sentence description.
- Right-aligned actions on desktop, wrapping below on mobile.

Use restrained title sizing: `text-2xl` or around `28px`.

### Navigation

Admin and POD navigation use:

- Fixed or sticky forest sidebar on desktop.
- Mobile overlay plus slide-in navigation.
- Section labels in small uppercase text.
- Icon plus label rows.
- Active item with deeper green background.
- Orange count badges for urgent activity.

Keep sidebar labels concise and operational.

### Status Badges

Status badges use:

- Inline-flex layout.
- Minimum height around `24px`.
- `12px` text.
- Medium or semibold weight.
- Rounded-md corners.
- Border plus soft background.
- A small dot is acceptable when paired with text.

### Tables And Data Grids

- Use AG Grid or existing table components for data-heavy workflows.
- Headers should be subtle green-tinted or muted.
- Row hover should be gentle, not high contrast.
- Numeric data should use tabular figures.
- Align numbers and money consistently.
- On narrow screens, prefer cards or stacked rows over horizontal page scrolling.

### Dialogs, Drawers, And Popovers

- Use dialogs for confirmations and focused forms.
- Use drawers or side panels for editing dense operational records.
- Keep headers sticky when content scrolls.
- Put destructive actions away from primary save actions.
- Overlays should use a dark translucent backdrop and clear focus management.

### Notifications And Live State

- Use live badges for connection state, new activity, and unread counts.
- Orange is reserved for attention counts and bill/payment urgency.
- Use `aria-live` text for async state changes where the user may not see the change.
- Loading should preserve layout with skeletons or stable containers.

## Layout Patterns

### Product Workspace

- `min-h-dvh` background.
- Sidebar plus main content on desktop.
- Sticky top bar with search, live status, notifications, and profile/actions.
- Main content constrained around `1500px` to `1540px`.
- Content spacing: `p-4`, `p-6`, or `p-8` depending on viewport.

### Marketing Page

- Sticky header with logo, desktop nav, CTA, and mobile menu.
- Full-width hero with brand color background.
- `shell` container: `min(100% - 48px, 1180px)`.
- Alternating full-width bands, section grids, and editorial copy blocks.
- Footer includes logo, navigation, contact routes, and a final CTA band.

### Kitchen Board

- Dark root: `#07111d`.
- Header: `#101c2c`.
- Sidebar: `#0d1a29`.
- Main board: `#081321`.
- Grid: `repeat(auto-fit, minmax(270px, 1fr))`.
- Controls are at least `44px`.
- Status tabs use rounded segmented controls.
- KOT cards prioritize table/order label, elapsed time, status, item rows, and action buttons.

## Motion

- Product motion should be fast and purposeful: `150ms` to `220ms`.
- Use motion for hover, press, menu entry, progress, and state transitions.
- Avoid decorative entrance animations in product workflows.
- Preserve reduced-motion behavior. Existing CSS reduces animation and transition duration under `prefers-reduced-motion: reduce`.
- Operational refreshes should not move controls while staff are acting.

## Accessibility

- Every interactive icon needs an accessible name.
- Keep visible focus rings. Current product focus uses green ring treatment; website focus uses gold.
- Use semantic buttons for actions and links for navigation.
- Do not communicate status by color alone.
- Preserve keyboard navigation for menus, dialogs, search, and data actions.
- Keep contrast high in the KDS and operational alert states.
- Use `aria-current` for active navigation and `aria-expanded` for expandable controls.
- Use `aria-live` for live notifications and background operation updates.

## Voice And Copy

### Product UI

Product copy should be short, concrete, and action-focused.

Use:

- `Test KOT`
- `Enable alerts`
- `Mark attended`
- `Open Tables`
- `Payment pending`
- `Everything is caught up`

Avoid:

- Marketing claims inside operational screens.
- Long explanatory paragraphs in dashboards.
- Cute labels for serious states.
- Ambiguous verbs like `Process` when the action can be named.

### Marketing UI

Marketing copy can be warmer and more narrative, but should stay clear.

Use:

- Restaurant-specific language.
- Human service context.
- Direct CTAs.
- Short supporting paragraphs.

Avoid:

- Generic transformation claims.
- Feature lists that read like an unrelated SaaS template.
- Pricing or capability claims that are not backed by the product.

## Imagery And Brand Assets

- Use the supplied SymphoServe logo without stretching, recoloring, or changing proportions.
- Preserve clear space around the logo.
- Use assistant artwork where it helps explain the Symba experience or adds a friendly brand cue.
- Product screens should not use decorative illustration unless it directly supports an empty state or onboarding moment.
- Marketing pages may use richer visuals, but the first viewport should make SymphoServe immediately recognizable.

## Implementation Rules

- Prefer existing Svelte components and local utilities before adding new component patterns.
- Use Tailwind tokens and CSS variables instead of raw repeated hex values.
- Keep hardcoded colors limited to surface-specific exceptions, such as KDS dark mode or print/PDF outputs.
- Use Lucide icons for product UI actions when an icon exists.
- Keep component APIs small and aligned with existing shadcn-svelte variants.
- Do not introduce a second design system inside one-off pages.
- When changing shared UI, verify admin, POD, marketing, and mobile behavior where the token or component is shared.

## Do And Do Not

Do:

- Build dense, scannable product pages.
- Keep actions close to the data they affect.
- Use green as the brand and action foundation.
- Use orange for attention, not general decoration.
- Use warm editorial styling on the marketing site.
- Keep KDS bold, dark, and action-first.

Do not:

- Add decorative gradient blobs, glass panels, or generic bento blocks to product screens.
- Use color without text for status.
- Make admin pages feel like marketing pages.
- Use rounded pills everywhere.
- Add layout-shifting hover states.
- Hide primary actions inside menus when they are central to the workflow.

## Source Files

This guide is based on the current UI implementation in:

- `website/src/routes/layout.css`
- `website/src/lib/components/MarketingHeader.svelte`
- `website/src/lib/components/MarketingFooter.svelte`
- `website/src/routes/+page.svelte`
- `adminPortal/src/routes/layout.css`
- `adminPortal/src/lib/components/navigation/admin-shell.svelte`
- `adminPortal/src/lib/components/common/page-header.svelte`
- `adminPortal/src/lib/components/common/status-badge.svelte`
- `adminPortal/src/lib/components/ui/button/button.svelte`
- `adminPortal/src/lib/components/kitchen/kitchen-board.svelte`
- `adminPortal/src/lib/domain/status.ts`
- `adminPortal/src/lib/domain/kds.ts`
- `productAdmin/src/routes/layout.css`
- `productAdmin/src/routes/+layout.svelte`
- `productAdmin/src/lib/components/pod/page-header.svelte`
- `productAdmin/src/lib/components/pod/status-badge.svelte`
- `productAdmin/src/lib/components/pod/stat-card.svelte`
