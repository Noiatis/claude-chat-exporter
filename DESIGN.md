# DESIGN.md

Design notes for the extension. Every choice has a reason; if you cannot write the reason, remove the choice.
(Written following the [anti-slop](https://github.com/miqdadbadjuber/anti-slop) method.)

**Design read:** a practical panel inside the browser for someone who wants to keep their Claude chats or move them to another account. Persian-speaking, in a hurry, in the middle of work. Style: calm and tool-like.

**Dials:** ENERGY 1 / RHYTHM 1 / MOTION 1

## Colour
The identity comes from the Noiatis logo itself: a charcoal ribbon and an orange spark. Result: neutral background and text, one accent colour.

| Role | Light | Dark | Why this value |
|---|---|---|---|
| Background | `#ffffff` / `#f4f2ee` | `#1d1b19` / `#2a2724` | warm white, not cold grey |
| Text | `#1b1917` | `#f0ede8` | contrast 17.5:1 and 14.7:1 |
| Muted text | `#5c574f` | `#b5b0a8` | 7.2:1 and 8.0:1; above the 4.5 minimum |
| Control border | `#85807a` | `#7a756d` | 3.9:1 and 3.8:1; 3 is required |
| Divider | `#e3dfd8` | `#3a3632` | decorative only, so no contrast needed |
| Accent (text, links) | `#b23a06` | `#ff8a3d` | 6.0:1 and 7.3:1 |
| Accent (fill) | `#e8590c` | `#ff8a3d` | 3.6:1 for shapes; **no white text on it** |

All ratios are computed with the WCAG formula, not by eye.

**Accent is used in three places only:** the progress bar, the switch when on, and the focus ring. The primary button is black (text colour), not orange: white text on orange does not reach 4.5, and orange has to stay rare.

## Font
Only **Vazirmatn** (SIL OFL 1.1) for Persian and Latin, so every surface (panel, popup, offline viewer, backup index) speaks with one voice. The files ship inside the extension and nothing is loaded from the network. Weights: 400 for text, 600 for headings (no other weights, to keep the size small). Sizes: 12 / 13 / 15 / 18. Fallback if the font fails to load: Tahoma, then the system font.

## Shape
- Only two corner radii: 6px for controls and 10px for the panel.
- One shadow level: the floating panel and the round button, since they float over another page. Nothing else has a shadow.
- No gradients, glow, glass effects, pills, coloured side bars on cards, or emoji in text. Words replace emoji.
- Icons only where they make something clearer: the check and cross of the steps. Other buttons are text.

## Rhythm and layout
- One focal point per screen: the primary button. Everything else follows it.
- The panel does not use a template "grid of equal cards"; lists are rows separated by thin lines.
- The offline viewer is laid out like a readable document, not like floating cards.

## Motion
- Only while something is running: a small spinner next to the active step and a ring on the round button.
- No entrance animations and no endless loops on static elements.
- With `prefers-reduced-motion`, the spinner does not spin and only the dot remains.

## Accessibility
- The focus indicator is always visible (2px ring in the accent colour).
- No state is shown by colour alone: there is a check or cross, and a word.
- Links are underlined.
- Click targets are at least 32px tall.

## Copy
- Short, specific sentences. No "easily", "powerful", "effortless".
- Errors say what happened and what to do now.
- No invented numbers or statistics; everything shown is counted from the chat itself.

## Deliberately absent
- A "Pro" mode or decorative "new/AI" badges. (The "new/changed" marker next to chats is a real status and stays.)
- Vanity statistics and charts.
- Marketing text inside the extension.
