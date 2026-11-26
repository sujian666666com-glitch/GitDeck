## UI Style Guidelines

### Design Principles

Adopt a minimalist, compact, and flat desktop-tool aesthetic with restrained whitespace and low visual noise. Establish hierarchy through subtle grayscale differences, alignment, typography, and 1px borders rather than heavy shadows or decorative elements.

Prioritize object names, current states, and primary actions. Use progressive disclosure for secondary functionality through hover actions, keyboard focus, context menus, inline expansion, and detail drawers. Determine layout and navigation patterns according to business requirements.

### Theme and Color System

Support Light, Dark, and System themes, following the system preference by default. All styles must reference semantic design tokens. Hardcoded colors in components are prohibited.

| Token | Light | Dark |
|---|---|---|
| `app` | `#FBFBFB` | `#101011` |
| `surface` | `#FFFFFF` | `#141416` |
| `subtle` | `#F3F3F4` | `#222224` |
| `hover` | `#EBEBED` | `#29292D` |
| `ink` | `#1D1D1F` | `#F0EFED` |
| `ink-2` | `#3C3C43` | `#CFCECC` |
| `muted` | `#8E8E93` | `#A3A3A8` |
| `faint` | `#C2C2C7` | `#74747C` |
| `line` | `#EAEAEA` | `#2C2C2F` |
| `line-strong` | `#D6D6DA` | `#414145` |
| `accent` | `#2F6FEB` | `#3672D6` |
| `accent-hover` | `#2560D6` | `#326AC6` |
| `accent-soft` | `#E8F0FE` | `#203451` |
| `focus` | `#3B82F6` | `#88B3FF` |

### Typography

Use system sans-serif fonts with appropriate CJK fallbacks. Use system monospace fonts for code and identifiers, and `tabular-nums` for numerical alignment.

- Page titles: 17px, semibold.
- Dialog titles: 15px, semibold.
- Section headings: 14px, medium.
- Body text: 13px, line-height 1.45.
- Secondary text: 12px.
- Status badges: 11px.

Apply `user-select: none` to the application shell. Enable `select-text` only for inputs and readable or copyable content.

### Border Radius and Component Sizes

| Radius | Components |
|---|---|
| Full | Tabs, tags, count badges |
| 12px | Dialogs, popovers, drawers, large buttons, input areas |
| 10px | Menu panels, standard buttons |
| 8px | Small buttons, icon buttons |
| 6px | Menu items, tooltips |

Button heights: 28px, 32px, and 40px for small, standard, and large variants respectively.

Use neutral backgrounds for secondary actions and the accent color for primary actions.

### Interaction States

- Hovered elements use the `hover` token.
- Selected rows use `accent-soft`.
- Selected tabs use a `subtle` background with medium font weight.
- Primary button hover states use `accent-hover`.
- Keyboard focus uses a distinct 2px focus ring.
- Secondary inline actions appear on hover or keyboard focus.

Status badges use low-saturation backgrounds paired with matching foreground colors. Always include text or icons rather than relying solely on color.

### Borders and Shadows

Use 1px semantic borders and subtle grayscale differences to establish visual hierarchy. Avoid unnecessary borders and shadows on ordinary interface elements.

Floating surfaces use a 1px `line` border and a lightweight shadow:

`0 10px 28px rgb(0 0 0 / 0.1), 0 1px 3px rgb(0 0 0 / 0.08)`

### Icons and Implementation

- Use `lucide-react` for consistent line-style icons.
- Use Radix UI for accessible menus, dialogs, popovers, and other interactive overlays.
- Provide accessible names and tooltips for icon-only buttons.
- Preserve keyboard navigation and visible focus indicators.
- Clearly communicate the consequences of destructive actions and use explicit action labels for confirmation.
- Maintain consistent semantic tokens, component dimensions, and interaction patterns throughout the application.

The overall interface should feel like a refined, native desktop productivity tool: compact, restrained, responsive, and functional, without unnecessary visual decoration.
