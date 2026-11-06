# Design

The base look for every screen. It comes from the Beans&Beats deck and the earlier demo. That Li (UI owner) reviews it and may change it; follow this file until then. See it live at `/design`.

## The look

- **Black on white**, like the deck. Heavy all-caps headlines, huge numbers, thick black rules. No gradients, soft shadows, rounded cards, emoji, illustrations or component-library styling.
- **One signal colour, `signal` (#FF4D00), for READY and nothing else:** the guest's ready screen, the ready board's marker, ready cards in the queue, and the arrival flash. Errors and destructive actions use `error` (#B3261E), never `signal`.
- **Each screen has one fixed look, and there is no dark mode.**
  - Staff screens (order, queue, menu, report): black on white.
  - Ready board: white on black, so it reads from across the hall.
  - Guest ready state: black on orange, the whole screen.
- **Font:** "BB Heros", which is real Helvetica Neue on Apple devices and TeX Gyre Heros (a free Helvetica clone, in `public/fonts/`) everywhere else.

## Tokens

All in `src/app/globals.css`. Use these, not raw Tailwind colours like `zinc-500` or `lime-400`.

| Kind    | Use                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------- |
| Colours | `ink`, `paper`, `panel`, `muted`, `faint`, `hair`, `signal`, `error` (e.g. `bg-panel`, `text-muted`) |
| Type    | `display` (order numbers, the big word), `headline`, `section-title`, `eyebrow`                      |
| Numbers | `numeral` on every order number, price and total (tabular digits)                                    |
| Rule    | `rule` for the deck's 3px black top border                                                           |
| Touch   | `min-h-tap` (52px): nothing tappable on a staff screen is smaller                                    |
| Motion  | `animate-arrive`: the 0.9 s orange flash when an order becomes ready                                 |

## Components

- **Buttons:** always `Button` from `src/components/button.tsx`. Variants: `primary` (black, the one main action), `secondary` (outline), `danger` (cancel or delete), `quiet` (Undo, small links). `block` makes it full width.
- **One main action per screen:** one `primary` button that is obviously the next step (Submit order, Mark ready).
- **Cards:** `bg-panel` with a `rule` top border. Ready cards swap the rule for a 6px `border-signal` top.

## Words

- Buttons are a verb and an object: "Submit order", "Mark ready", "Mark collected". Not "OK" or "Continue".
- Loading text uses a real ellipsis: "Submitting…", "Loading…".
- Errors say what happened and what to do next: "No connection. Your order is saved and will send when you're back online."
- Money is shown as `S$8.00` with `formatPrice`, always with `numeral`.

## Rules every screen follows

These come from Vercel's Web Interface Guidelines; most are already handled in `globals.css`.

- Keyboard focus stays visible (an orange outline from `:focus-visible`). Never remove an outline without replacing it.
- `<button>` for actions, `<Link>` or `<a>` for navigation. No clickable `<div>`.
- Every input has a `<label>`. Use the right `type` and `inputMode` (`tel` for mobile numbers).
- Status changes the user should hear, like the guest's status or an Undo toast, go in an `aria-live="polite"` region.
- Destructive actions need an Undo or a confirm, never immediate.
- Long names truncate (`truncate`, plus `min-w-0` inside flex). Empty lists show a short message, never a blank area.
- Animate only `transform`, `opacity` and colours. Respect reduced motion (done globally). No scroll animations, parallax or fade-ins.
- Full-screen pages (board, guest page) pad for phone notches with `env(safe-area-inset-*)`. The board sets `themeColor` to black and `color-scheme: dark`.
- Staff cards stay still while baristas tap; only the card that changed flashes.
