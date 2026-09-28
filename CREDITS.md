# Credits

## Art
All images are **generated in code** by this project (`tools/art/art.js`, rendered by `tools/art/build.mjs` in headless Chrome):
paper-doll layers (`public/assets/doll/*`), luxury items, equipment/staff/investment icons (`public/assets/items/*`),
backgrounds (`public/assets/bg/*`) and the PWA icons (`public/icons/*`).
They are dedicated to the public domain under **CC0 1.0**. No third-party images are used.

- Files are named by ID (e.g. `car_01.png`, `top_suit_01.png`, `bg_villa_01.png`).
- No text is baked into any image: video titles, the KİRALIK tag and the share card text are drawn at runtime from `src/locales/*.json`
  (a unit test asserts the art generator never calls `fillText`/`strokeText`).
- All designs are generic: no real brand, logo, model, show, actor or person is depicted or named.

## Fonts
System font stack only (`system-ui`, Segoe UI, Roboto, Noto Sans, Ubuntu…), all of which cover Turkish (latin-ext). No font files are shipped.

## Code / tools
- [Vite](https://vitejs.dev) — MIT (build)
- [playwright-core](https://playwright.dev) — Apache-2.0 (dev only: art rendering + smoke tests)
