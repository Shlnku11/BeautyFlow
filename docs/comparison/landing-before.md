# Landing baseline: Linear vs BeautyFlow

- Captured: 2026-10-08 (local task date)
- Viewport: Chromium, 1440 × 900. Baseline side-by-side uses dark theme on both sides; the original light capture is retained too.
- Reference: [linear.app](https://linear.app/) public landing page. This is the current product marketing page, not a logged-in Linear dashboard. The suggested `https://linear.app/team` URL returned Linear's login screen in this browser session, so it is not used as the Landing reference.
- Our page: `http://localhost:5173/`, BeautyFlow public landing page.
- Screenshot method: Playwright Chromium screenshot CLI at the same viewport. Linear was captured after `DOMContentLoaded` plus 9 seconds so its initial hero animation had settled; BeautyFlow after `DOMContentLoaded` plus 2.2 seconds.
- DOM measurements were collected with Playwright in Chromium. Screen positions below are viewport CSS pixels and rounded. Screenshots are the visual record; capture files are not edited except for the labeled side-by-side montage.

## Artifacts

- [Baseline comparison: Linear vs BeautyFlow before](landing-linear-vs-ours.png)
- [After comparison: Linear vs BeautyFlow after](landing-linear-vs-ours-after.png)
- [Linear source capture](landing-linear-reference.png)
- [BeautyFlow before, light](landing-before-light.png)
- [BeautyFlow before, dark](landing-before-dark.png)
- [BeautyFlow after, light](../screenshots/landing-after-light.png)
- [BeautyFlow after, dark](../screenshots/landing-after-dark.png)
- Full-page after captures are in [`docs/screenshots/`](../screenshots/).

## Observed differences

Some differences are required by the product (salon CRM vs product-development software) and are not defects by themselves. The first group identifies measurable styling/layout differences; the final group calls out content differences that must remain BeautyFlow-specific.

### Layout and visual system

1. Linear's page background is near-black (`rgb(8, 9, 10)`); BeautyFlow's is off-white (`rgb(250, 250, 250)`).
2. Linear uses a dark first fold with white primary text and muted gray secondary text. BeautyFlow uses a light first fold with near-black heading and blue-gray body copy.
3. Linear's header is 73px high; BeautyFlow's is 65px.
4. Linear's logo starts about 79px from the left edge; BeautyFlow's logo starts 32px from the edge.
5. Linear's logo is a white circular mark plus a white wordmark. BeautyFlow uses a violet square with “B” plus a black wordmark.
6. Linear's header links form a right-aligned group beginning around x=741px. BeautyFlow puts its four section links in a centered group, beginning around x=495px.
7. Linear shows six header navigation links (`Product`, `Resources`, `Customers`, `Pricing`, `Now`, `Contact`); BeautyFlow shows four (`Возможности`, `Как работает`, `Преимущества`, `Демо`).
8. Linear separates `Contact` from `Log in` with a vertical divider; BeautyFlow has no divider before `Войти`.
9. Linear's header signup action is a white pill with dark text. BeautyFlow's is a violet rounded rectangle with white text.
10. Linear's hero H1 begins at x=78px; BeautyFlow's at x=32px.
11. Linear's H1 box is about 1282 × 128px at x=78, y=272; BeautyFlow's is about 534 × 112px at x=32, y=261.
12. Linear's H1 is 64px, weight 510, with 64px line height; BeautyFlow's is 56px, weight 600, with 56px line height.
13. Linear's computed font stack begins with `Inter Variable`; BeautyFlow's begins with `ui-sans-serif, system-ui`.
14. Linear's hero title uses nearly the full content width; BeautyFlow constrains the title to the left column, forcing the product-specific headline to wrap within about 534px.
15. Linear's subtitle is one muted line at this viewport. BeautyFlow's longer Russian subtitle wraps into two lines and uses a higher-contrast color.
16. Linear places a `New · Loops →` link at the far right of the subtitle row; BeautyFlow has no secondary link aligned to its subtitle.
17. Both headings sit roughly 200px below the header, but their left edges and content widths create different alignment systems (78px reference inset vs 32px BeautyFlow inset).
18. Linear's product preview begins at x≈60px, y≈528px, and spans about 1320px. BeautyFlow's mock dashboard begins at x≈606px, y≈161px, and spans about 802px.
19. Linear places its product preview below the headline/subtitle. BeautyFlow places the mock dashboard beside the headline in a split hero.
20. Linear's preview continues below the 900px viewport. BeautyFlow's dashboard mockup ends around y≈613px and is fully visible in the first fold.
21. Linear's embedded product UI is dark. BeautyFlow's embedded dashboard mockup is predominantly pale gray despite the light outer page.
22. Linear's screenshot has a thin dark border and rounded corners against the black page; BeautyFlow's preview has a light border and shadow against the light page.
23. Linear layers a floating assistant/chat panel over the lower-right of its product image. BeautyFlow's mockup has no overlapping floating panel.
24. Linear's preview contains populated issue/activity details. BeautyFlow's mock dashboard is an empty state with zero KPIs and no upcoming appointments.
25. The BeautyFlow “Рабочие инструменты салона” section heading is already visible at y≈797px, with the tops of three feature columns at the bottom of the viewport. Linear's first fold is still occupied by its product preview at y=900px.
26. BeautyFlow shows two hero actions (`Начать бесплатно`, `Войти`) and repeats account actions in the header. Linear's first-fold hero has no separate CTA pair; the visible signup action is in its header.
27. Linear's CTA has a fully pill-shaped silhouette. BeautyFlow's buttons have a smaller corner radius.
28. Linear's header border is a low-contrast dark separator; BeautyFlow's header has a light gray separator.

### Product-specific differences to preserve

29. Linear's English headline describes product development for teams and agents; BeautyFlow's Russian headline describes online salon booking. This is expected product copy, not text to copy from the reference.
30. Linear's navigation describes product pages, customers, pricing, and news; BeautyFlow's describes salon software features and onboarding. Keep BeautyFlow's information architecture.
31. Linear's embedded UI shows issues, reviews, and activity; BeautyFlow's preview should show salon CRM concepts (appointments, clients, staff, payments). The current empty dashboard content is the part that weakens the product demo.
32. BeautyFlow has a purple brand accent; Linear's captured marketing surface is mostly monochrome, with color limited to small product UI details. Whether to reduce purple is a design decision for the redesign, not an automatic requirement from this comparison.

## Baseline conclusion

## After implementation comparison

The first-fold layout was rebuilt around the requested landing requirements. In the 1440 × 900 Chromium capture, BeautyFlow's header is 72px vs Linear's 73px; the H1 begins at (80, 269) vs (78, 272), uses 64px Inter Variable, and occupies two lines. The actual dashboard preview starts at y=549 and is 870px wide (60.4% of the viewport), within the requested 60–70% range and continuing below the fold. The light and dark `<picture>` sources resolve to real screenshots captured from `/app/dashboard` and `/app/calendar`; the CTA surface remains `#09090B` in both themes. At 1440px, document width equals viewport width.

The largest initial visual gaps are closed: the page uses a single-column hero, large below-fold product image, Inter typography, right-aligned navigation, matching content inset, a 40px dark CTA section, four-column footer, and theme-specific product images. There remain five intentional differences from Linear: BeautyFlow branding/primary color, salon-specific Russian navigation and copy, salon CRM content in the actual preview, no Linear-specific assistant overlay, and the preview width required by this brief (60.4% vs Linear's ~92%). Those are not changed to fake Linear UI or violate the stated preview size.

`docs/screenshots/landing-after-light.png` and `landing-after-dark.png` are the final viewport screenshots. `landing-full-after-light.png` and `landing-full-after-dark.png` show all reveal sections after actual scrolling. No exact-parity claim is made: the Landing now follows the agreed structure, but literal screenshot differences remain for product-specific reasons.

The baseline rating was capped at 7/10 before comparison. The after score is recorded separately in `docs/AUDIT.md`; it is not 10/10 because the reference comparison still has the differences above.
