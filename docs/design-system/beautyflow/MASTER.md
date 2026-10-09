# BeautyFlow UI master

This project override takes priority over generic generated recommendations. The accepted reference is Linear, Vercel Dashboard, Notion, Stripe Dashboard, and Raycast: compact, neutral, professional, and data-first. Do not use claymorphism, playful gradients, decorative blobs, or invented data.

## Palette and typography

- Light: background `#FAFAFA`, surface `#FFFFFF`, hover `#F4F4F5`, border `#E4E4E7`, text `#09090B`, muted text `#52525B`, accent `#5B5BD6`.
- Dark: background `#09090B`, surface `#18181B`, border `#27272A`, text `#FAFAFA`, muted text `#A1A1AA`, accent `#7C7CE8`.
- Use Inter Variable from the local font package. Body 14px; page heading 24px/600; section heading 18px/600; small copy 13px; uppercase labels 12px/500. Use tabular numerals for time, counts, and money.
- Controls use 6px radius, cards 8px, dialogs 12px. Use thin borders and a subtle `0 1px 2px rgba(0,0,0,.04)` shadow. No large shadows.
- Read colors through `packages/client/src/styles/tokens.css` and Tailwind theme tokens. Do not add inline styles or another stylesheet.

## Product shell

- Desktop: 240px collapsible sidebar, 48px topbar, compact page content. Sidebar groups are РАБОТА, БАЗА, ФИНАНСЫ, СИСТЕМА.
- Topbar includes breadcrumbs, a working keyboard-accessible quick switcher, a permission-aware create appointment action, an appointments link, and account actions.
- Mobile: use the navigation drawer and fixed bottom navigation; pad page content above the bottom bar. A master sees only routes and records allowed by their session.
- Tables and calendar are dense, opaque neutral surfaces. Glass is limited to the landing header, app sidebar/topbar, auth surfaces, and dialog backdrop.

## Interaction and accessibility

- Use the Font Awesome solid/regular set already installed. No emoji or Lucide icons.
- Every action must work against an existing route/API or be rendered as non-interactive text. Do not add fake notification content, demo records, or dead-end buttons.
- Use visible `focus-visible` rings, labels, correct table semantics, 150ms color transitions, Escape/backdrop dismissal for dialogs, and reduced-motion support.
- Keep light/dark states and test widths 320, 375, 768, 1024, and 1440px without horizontal page overflow.

## Screen hierarchy

- Dashboard: four compact KPIs without colored strips, a real revenue line chart, and upcoming appointment rows.
- Calendar: 7-column week, 15-minute grid, staff-color border on appointment blocks, current-time line. On narrow screens default to day view. Masters have no staff filter.
- Lists: compact filter row and dense data table; at mobile widths use readable stacked records where implemented.
- Dialogs: dark translucent backdrop with blur; 12px surface radius; title row, labeled fields/detail pairs, and a footer for primary/secondary actions.
- Landing: 56px/600 headline, concise copy, actual product screenshots, restrained scroll reveal, and a subtle 5–10px pointer parallax. Respect reduced motion.

## Implementation constraints

- UI changes belong in `packages/client`; shared copy belongs in `packages/shared/src/i18n/ru.ts`.
- Do not change contracts, APIs, backend code, data flow, or access rules to achieve a visual effect.
- Use product data from the API. A static product screenshot may illustrate the public landing, but protected application screenshots must come from an authenticated runtime.
