# Items System

Inventory objects that players collect, drop, and sometimes lose at the worst moment.

## Two tiers

**Declared items** — defined in the adventure's `items` block. Have IDs, labels, descriptions, and sprites. Can gate choices via `hasItems`. Dangerous to drop.

**Freeform items** — invented by the LLM mid-episode. Human-readable label string + sprite fields. No ID. Never gate scripted choices. Safe to drop (usually).

Players see both in the same inventory list with no visual distinction between tiers.

---

## Adventure `items` block

```json
"items": {
  "evidence": {
    "label": "Crystal's Photograph",
    "description": "Evidence of Vangie's false identity. Geneva, 2019.",
    "hint": "This might matter.",
    "sprite": { "base": "document", "color": "cream", "accent": "none" }
  },
  "amulet": {
    "label": "Magdalena's Amulet",
    "description": "It hums. It is warm. Do not drop it.",
    "hint": "This might matter.",
    "sprite": { "base": "orb", "color": "purple", "accent": "glow" }
  }
}
```

### Fields

| Field | Required | Notes |
|---|---|---|
| `label` | yes | Shown in inventory. Max 40 chars. |
| `description` | no | Shown on inventory page. |
| `hint` | no | Subtle warning shown before drop. |
| `sprite` | yes | See sprite spec below. |

---

## Existing declared items

| ID | Adventure | Label | Sprite |
|---|---|---|---|
| `evidence` | passions | Crystal's Photograph | document · cream · none |
| `amulet` | passions | Magdalena's Amulet | orb · purple · glow |
| `iguana` | toast | The Iguana | creature · teal · none |
| `wine_glass` | toast | Roxy's Wine Glass | glass · pink · stain |

---

## Sprite spec

Two-layer stack rendered as SVG at 32×32 pixel grid.

```
1. base shape  — silhouette, currentColor fill
2. accent      — overlay fx (optional)
```

### Base shapes (13)

| ID | Covers |
|---|---|
| `document` | photo, paper, envelope, prenup, vows |
| `bottle` | wine bottle, flask, potion, spray |
| `creature` | iguana, cat, bug, small animal |
| `device` | phone, USB drive, remote, camera |
| `ring` | jewelry, crown, hoop, amulet ring |
| `food` | cake, fruit, canapé, snack |
| `cloth` | veil, scarf, fabric, garment |
| `orb` | gem, crystal ball, glowing object |
| `flora` | flower, orchid, bouquet, plant |
| `key` | key, keycard, fob, access pass |
| `glass` | wine glass, champagne flute, tumbler |
| `trophy` | award, plaque, ribbon, citation |
| `bag` | purse, clutch, tote, suitcase |

Unknown base → fallback to `orb`.

### Colors (5) — all from game palette

| ID | Hex | Vibe |
|---|---|---|
| `gold` | `#ffd54a` | valuable, cursed |
| `pink` | `#ff6fb1` | dramatic, alive |
| `teal` | `#5ee6d6` | strange, tech |
| `cream` | `#f6ead8` | mundane, old |
| `purple` | `#c9b3d6` | suspicious, magical |

Unknown color → fallback to `cream`.

### Accents (4 + none)

| ID | Effect |
|---|---|
| `sparkle` | star bursts — reuses portrait sparkle layer |
| `glow` | soft halo ring |
| `stain` | wine drip / splatter |
| `tear` | ripped edge fragment |
| `none` | no accent (default) |

Unknown accent → `none`.

### Art needed

- 13 base shape SVGs (`src/portrait/item-layers.json`)
- 3 new accent SVGs: `glow`, `stain`, `tear` (sparkle already exists in portrait layers)
- Color applied programmatically via `currentColor` — no separate color art pieces
- **Total: 16 SVG pieces**

---

## LLM output format

LLM receives ITEM BASES / COLORS / ACCENTS as allowlists in the system prompt (same pattern as APPROVED FLAGS and STATS).

**Declared item give:**
```json
"give": [{ "id": "usb_drive", "label": "USB Drive — DO NOT OPEN", "sprite": { "base": "device", "color": "teal", "accent": "glow" } }]
```

**Freeform item give:**
```json
"give": [{ "label": "a damp orchid", "sprite": { "base": "flora", "color": "pink", "accent": "none" } }]
```

### System prompt addition

```
ITEM BASES: document | bottle | creature | device | ring | food | cloth | orb | flora | key | glass | trophy | bag
ITEM COLORS: gold | pink | teal | cream | purple
ITEM ACCENTS: sparkle | glow | stain | tear | none

You may give the player one item per beat. Pick the closest base, a color that fits the
vibe, and an accent if something physically happened to it. Keep the label specific and
strange. Max 40 characters. Declared items in APPROVED ITEMS may be given by id.
```

### Sanitizer rules

- `label` missing or >40 chars → reject whole give
- `base` not in allowlist → `orb`
- `color` not in allowlist → `cream`
- `accent` not in allowlist → `none`
- `id` present but not in `adventure.items` → strip `id` (becomes freeform)
- `hasItems` on LLM-generated choices → only declared item IDs pass; freeform items cannot gate choices
- Inventory cap: 8 items max, oldest dropped when exceeded

---

## Engine changes

### Inventory becomes `object[]`

Scripted `give: ["evidence"]` → engine hydrates to full object on apply:
```js
{ id: "evidence", label: "Crystal's Photograph", sprite: { base: "document", color: "cream", accent: "none" } }
```

Freeform `give: [{ label: "a damp orchid", sprite: {...} }]` → stored as-is (no `id` field).

### `hasItems` / `notItems` conditions

Check `item.id` only. Freeform items (no `id`) never satisfy `hasItems` conditions.

### `dropItem(adventure, state, itemId)`

New exported engine function. Removes item by `id` for declared items. UI also allows dropping freeform items by label/index.

---

## UI — Inventory screen

Mobile-first. Primary target: 390px wide, thumb-reachable, 44px minimum touch targets. Old-school full-screen grid — no transparency, no overlays, no swipe gestures. Feels like a JRPG inventory, not a mobile sheet.

### Entry point

"INVENTORY" button in the footer (same row as cast memory / episode picker). Gold border, Press Start 2P, full width. Only shown when inventory is non-empty — otherwise hidden. Tapping navigates to the inventory screen (replaces current view entirely).

### Inventory screen layout

Full screen, opaque `#170a21` with scanlines. No game content visible behind it.

```
┌─────────────────────────────────┐
│  ══ INVENTORY ══════════════════│  ← gold heading, Press Start 2P
│                                 │
│  ┌───────┐ ┌───────┐ ┌───────┐  │
│  │[sprite│ │[sprite│ │       │  │
│  │  64px]│ │  64px]│ │ EMPTY │  │  ← item grid, 3 cols
│  │       │ │       │ │       │  │
│  │Label  │ │Label  │ │  ---  │  │
│  └───────┘ └───────┘ └───────┘  │
│                                 │
│  ┌─────────────────────────────┐│
│  │ SELECTED ITEM DETAILS       ││  ← detail panel
│  │ Full label                  ││
│  │ Description text            ││
│  │ Hint (if any, in pink)      ││
│  └─────────────────────────────┘│
│                                 │
│  [ DROP ITEM ]   [ ◄ BACK ]     │  ← action row, thumb zone
└─────────────────────────────────┘
```

### Item grid

- 3 columns, equal width cells
- Each cell: gold border 2px, background `#24112f`, padding 8px
- Item sprite: 64×64px, `shape-rendering: crispEdges`, centered
- Label below sprite: cream, VT323 14px, truncated to 1 line
- Empty slots: dim purple border, `---` centered, no label
- Selected cell: pink border 2px, background `#3a1a4d`
- Tap cell → selects it, updates detail panel. No double-tap required.

### Detail panel

Shows selected item's full label, description, and hint. Always visible — shows placeholder text when nothing selected ("Select an item."). Gold border 2px, background `#24112f`.

If `item.hint` is set, show it in pink below description:
```
CRYSTAL'S PHOTOGRAPH
Evidence of Vangie's false identity.
Geneva, 2019.

! This might matter.        ← pink, warning prefix
```

Freeform items have no hint. No visual distinction between tiers in the grid — same cell layout.

### Action row

Pinned to bottom of screen (thumb zone). Two buttons, full-width split:

- `DROP ITEM` — pink, only enabled when an item is selected. Tap → item removed, cell becomes empty slot, detail panel resets. No confirmation. No animation needed.
- `◄ BACK` — gold, always enabled. Returns to game.

Both buttons: 44px height minimum, Press Start 2P label.

### Drop behavior

- Tap `DROP ITEM` → item removed from engine state immediately
- Cell becomes empty slot
- If dropped item had `hint` → detail panel flashes "DISCARDED." in pink for 1s, then resets
- If `prefers-reduced-motion` → no flash, instant reset
- No undo

### Empty state

If player opens inventory with no items (edge case — button is hidden, but handle it):
```
══ INVENTORY ══════════════

  YOUR HANDS ARE
  SUSPICIOUSLY EMPTY.

  Producers suggest you
  pick something up.

              [ ◄ BACK ]
```

### Inventory strip (main game view)

Compact strip below the scene panel, above choices. Shows item sprites at 32×32px in a horizontal row. Tapping the strip navigates to inventory screen. Max 8 items (engine cap). Only shown when inventory non-empty.

```
┌──────────────────────────────────┐
│  BAG: [🖼][🖼][🖼]               │  ← tap to open inventory
└──────────────────────────────────┘
```

Gold border, `#24112f` background, "BAG:" label in gold Press Start 2P. Sprites only — no labels in strip (too cramped at 390px).

### New UI files

| File | Contents |
|---|---|
| `app/src/components/InventoryScreen.jsx` | Full-screen inventory grid + detail panel |
| `app/src/components/ItemCell.jsx` | Single grid cell (sprite, label, selected state) |
| `app/src/components/InventoryStrip.jsx` | Compact strip for main game view |
| `app/src/components/ItemSprite.jsx` | Renders item SVG at given size |

---

## Files to create / modify

| File | Change |
|---|---|
| `schema/adventure.schema.json` | Add `itemDef`, add `items` block to adventure, update `give` to allow objects |
| `adventures/passions.json` | Add `items` block |
| `adventures/toast.json` | Add `items` block |
| `src/engine/engine.js` | Hydrate string give → object; add `dropItem`; inventory cap |
| `src/engine/conditions.js` | `hasItems`/`notItems` check `item.id` |
| `src/validate/validate.js` | Validate `items` block; check give IDs; validate sprite allowlists |
| `functions/api/scene.mjs` | Sanitizer sprite passthrough; system prompt; inventory in user message |
| `src/portrait/item-layers.json` | New — 13 base shapes + 3 accent layer definitions |
| `src/portrait/item-render.js` | New — `renderItem(sprite, options)` → SVG |
| `docs/ADVENTURE_FORMAT.md` | Document `items` block |
| `docs/adventure-authoring-brief.md` | Same |
| `app/src/components/InventoryScreen.jsx` | New — full-screen grid, detail panel, drop/back actions |
| `app/src/components/ItemCell.jsx` | New — single grid cell with sprite + selected state |
| `app/src/components/InventoryStrip.jsx` | New — compact strip for main game view |
| `app/src/components/ItemSprite.jsx` | New — renders item SVG at given size |

## Implementation order

1. Schema + adventure JSON (data layer, validator still passes)
2. Engine + conditions (inventory becomes objects, hasItems updated)
3. Validator (catches undeclared give IDs, bad sprites)
4. `scene.mjs` (LLM can now give items with sprites)
5. `item-layers.json` + `item-render.js` (art + renderer, unblocks UI)
6. UI — `InventoryStrip` → `InventorySheet` → `ItemCard` → `ItemSprite`
7. Tests throughout each step
8. Docs update last
