# Tailwind CSS v4 Styling Guide - OneMind

**Last Updated**: November 11, 2025  
**Tailwind Version**: v4.x  
**Project**: Tauri 2 + React 19 + Tailwind CSS v4

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Theme Architecture](#theme-architecture)
4. [Configuration Reference](#configuration-reference)
5. [Usage Patterns](#usage-patterns)
6. [Dark Mode Implementation](#dark-mode-implementation)
7. [Verification & Testing](#verification--testing)
8. [Migration Notes](#migration-notes)

---

## Overview

This project uses **Tailwind CSS v4** with its new `@theme` directive for defining design tokens. The theme system is optimized for:

- **Runtime theme switching** (light/dark mode)
- **Semantic color tokens** (background, surface, card, primary, etc.)
- **shadcn/ui component compatibility** (legacy variables)
- **Type-safe design tokens** across React components

### Key Files

- **`src-react/src/styles/globals.css`** - Theme variables, dark mode overrides, base styles
- **`src-react/tailwind.config.ts`** - Tailwind configuration (content paths, dark mode strategy)
- **`src-react/src/lib/theme.ts`** - Theme utility functions for runtime switching

---

## Core Concepts

### What is `@theme`?

In Tailwind v4, `@theme` is a special CSS directive that:

1. **Defines design tokens** as CSS variables
2. **Automatically generates utility classes** based on variable names
3. **Maps to specific utility namespaces** (colors, spacing, fonts, etc.)

**Key difference from `:root`**:
- `@theme` → Creates utilities (e.g., `bg-surface`, `text-primary`)
- `:root` → Creates variables only (no utilities)

### Theme Variable Namespaces

Tailwind v4 uses namespaced variables to generate different utility types:

| Namespace | Example Variable | Generated Utilities |
|-----------|-----------------|---------------------|
| `--color-*` | `--color-surface` | `bg-surface`, `text-surface`, `border-surface` |
| `--color-*` | `--color-brand-500` | `bg-brand-500`, `text-brand-500` |
| `--radius-*` | `--radius-md` | `rounded-md` |
| `--spacing-*` | `--spacing-4` | `p-4`, `m-4`, `gap-4` |
| `--text-*` | `--text-xl` | `text-xl` |
| `--font-*` | `--font-sans` | `font-sans` |
| `--shadow-*` | `--shadow-lg` | `shadow-lg` |

**Source**: [Tailwind CSS v4 Theme Variables](https://tailwindcss.com/docs/theme)

---

## Theme Architecture

### Primary Color Tokens (`@theme` block)

These variables **generate Tailwind utilities** and are defined in `globals.css`:

```css
@theme {
  /* Semantic colors - these create bg-*, text-*, border-* utilities */
  --color-background: oklch(0.85 0.02 200);      /* Main app background */
  --color-foreground: oklch(0.145 0 0);          /* Primary text color */
  --color-surface: oklch(1 0 0);                 /* Cards, sidebars, modals */
  --color-surface-muted: oklch(0.97 0 0);        /* Subtle surface variant */
  --color-card: oklch(1 0 0);                    /* Card backgrounds (same as surface) */
  
  /* Brand colors - full scale for flexibility */
  --color-brand-50: #eaf0ff;
  --color-brand-500: #3c63ff;
  --color-brand-950: #080f29;
  
  /* shadcn/ui semantic colors */
  --color-primary: oklch(0.205 0 0);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-destructive: oklch(0.577 0.245 27.325);
  /* ... (see globals.css for full list) */
}
```

### Semantic Token Purpose

| Token | Purpose | Used For |
|-------|---------|----------|
| `--color-background` | **Main page background** | Body, root containers, page layouts |
| `--color-surface` | **Elevated surfaces** | Sidebars, cards, modals, dialogs, popovers |
| `--color-card` | **Card components** | Same as surface (visual consistency) |
| `--color-foreground` | **Primary text** | Body text, headings on background |
| `--color-primary` | **Primary actions** | Buttons, links, focus states |

### Legacy Variables (`:root` block)

For **shadcn/ui compatibility**, we maintain legacy variables that reference the theme variables:

```css
:root {
  /* These DON'T generate utilities, only for legacy component compatibility */
  --background: var(--color-background);  /* Maps to theme variable */
  --card: var(--color-card);
  --primary: var(--color-primary);
  /* ... */
}
```

**Why keep both?**
- Some shadcn/ui components reference legacy variables directly (e.g., `var(--primary)`)
- Allows gradual migration while maintaining compatibility

---

## Configuration Reference

### `globals.css` Structure

```css
/* 1. Import Tailwind base */
@import "tailwindcss";
@import "tw-animate-css";

/* 2. Custom variant for dark mode */
@custom-variant dark (&:is(.dark *));

/* 3. Theme variables - LIGHT MODE defaults */
@theme {
  --color-background: oklch(0.85 0.02 200);
  --color-surface: oklch(1 0 0);
  /* ... all theme tokens */
}

/* 4. Legacy compatibility variables */
:root {
  color-scheme: light;
  --background: var(--color-background);
  --card: var(--color-card);
  /* ... */
}

/* 5. DARK MODE overrides */
.dark {
  color-scheme: dark;
  --color-background: oklch(0.18 0.01 250);    /* Very dark background */
  --color-surface: oklch(0.36 0.04 264.665);   /* Lighter surface (L=36%) */
  --color-card: oklch(0.36 0.04 264.665);      /* Match surface */
  
  /* Legacy sync */
  --background: var(--color-background);
  --card: var(--color-card);
  /* ... */
}

/* 6. Base layer styles */
@layer base {
  body {
    background-color: var(--color-background);
    color: var(--color-text-primary);
    /* ... */
  }
}
```

### `tailwind.config.ts`

```typescript
const config = {
  darkMode: "class",  // Use .dark class for dark mode
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  plugins: [],
};

export default config;
```

**Note**: In Tailwind v4, you **don't need** to extend `theme.colors` in the config if you're using `@theme` in CSS. The `@theme` directive automatically generates utilities.

**Optional**: You can add explicit color mappings for documentation purposes:

```typescript
theme: {
  extend: {
    colors: {
      background: 'var(--color-background)',
      surface: 'var(--color-surface)',
      card: 'var(--color-card)',
      // ... (but this is redundant with @theme)
    }
  }
}
```

---

## Usage Patterns

### Using Semantic Utilities

**Recommended pattern** - Use semantic color utilities throughout your components:

```tsx
// ✅ GOOD - Semantic, theme-aware
<div className="bg-surface text-foreground rounded-lg shadow-sm">
  <h2 className="text-primary">Card Title</h2>
  <p className="text-text-muted">Description text</p>
</div>

// ❌ AVOID - Hardcoded colors (won't adapt to theme changes)
<div className="bg-white text-black">
  <h2 className="text-blue-500">Card Title</h2>
</div>
```

### Component Examples

#### Layout Components

```tsx
// Main page background
<div className="min-h-screen bg-background">
  {/* Page content */}
</div>

// Sidebar
<aside className="bg-surface border-r border-border">
  {/* Sidebar items */}
</aside>

// Card/Modal
<div className="bg-card rounded-lg shadow-lg p-6">
  {/* Card content */}
</div>
```

#### Text Colors

```tsx
// Primary text (high contrast)
<h1 className="text-foreground">Heading</h1>

// Muted/secondary text
<p className="text-text-muted">Subtitle or description</p>

// Primary brand color
<button className="text-primary hover:text-primary-foreground">
  Click me
</button>
```

#### Borders & Accents

```tsx
// Standard border
<div className="border border-border rounded-md">

// Accent border
<div className="border-2 border-brand-500 rounded-md">

// Ring (focus states)
<button className="focus-visible:ring-2 ring-primary ring-offset-2">
```

### Using CSS Variables Directly

For custom CSS or when you need to reference theme values in inline styles:

```tsx
// In component
<div style={{ backgroundColor: 'var(--color-surface)' }}>

// In custom CSS (globals.css or component styles)
.custom-gradient {
  background: linear-gradient(
    to right,
    var(--color-brand-500),
    var(--color-brand-700)
  );
}
```

### Accessing Variables in JavaScript

```typescript
// Get computed theme variable value
const styles = getComputedStyle(document.documentElement);
const surfaceColor = styles.getPropertyValue('--color-surface');

// Example: Use in canvas or animation library
ctx.fillStyle = surfaceColor;
```

---

## Dark Mode Implementation

### How Dark Mode Works

1. **Class-based toggling**: The `.dark` class is added to `<html>` or `<body>`
2. **Variable overrides**: `.dark { --color-background: ...; }` overrides light values
3. **Utilities adapt automatically**: `bg-surface` uses the current `--color-surface` value

### Theme Toggle Pattern

```tsx
// src-react/src/lib/theme.ts
export function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  
  if (isDark) {
    html.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  } else {
    html.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }
}

// Initialize on mount
export function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
}
```

### Dark Mode Color Strategy

**Light Mode**:
- Background: `oklch(0.85 ...)` - Light gray-blue (L=85%)
- Surface: `oklch(1 ...)` - Pure white (L=100%)
- **Contrast**: White surfaces on light gray background

**Dark Mode**:
- Background: `oklch(0.18 ...)` - Very dark blue-gray (L=18%)
- Surface: `oklch(0.36 ...)` - Lighter dark gray (L=36%)
- **Contrast**: Lighter surfaces on very dark background

**Visual hierarchy**:
```
Light Mode: Surface (white) > Background (light gray)
Dark Mode: Surface (L=36%) > Background (L=18%)
```

### Accessibility Considerations

**Contrast ratios** (WCAG AA minimum: 4.5:1 for normal text):

- Light mode: Black text on white surface = 21:1 ✅
- Dark mode: White text on L=36% surface ≈ 7:1 ✅

**Testing contrast**:
```bash
# Use browser DevTools or online tools
# - Chrome DevTools: Inspect > Contrast ratio indicator
# - WebAIM Contrast Checker: webaim.org/resources/contrastchecker
```

---

## Verification & Testing

### 1. Verify Utilities Are Generated

**Test in browser DevTools**:

```html
<!-- Add test element to any component -->
<div className="bg-surface bg-background bg-card text-foreground">
  Test theme utilities
</div>
```

**Inspect compiled CSS**:
1. Open DevTools → Elements
2. Find the element
3. Check "Computed" tab → verify `background-color` resolves to the CSS variable value

**Expected**:
```css
.bg-surface {
  background-color: var(--color-surface);
}
```

### 2. Test Dark Mode Toggle

```tsx
// In any component
<button onClick={() => document.documentElement.classList.toggle('dark')}>
  Toggle Dark Mode
</button>
```

**Verify**:
- Background changes from light → dark
- Surface colors update (L=100% → L=36%)
- Text remains readable (contrast maintained)

### 3. Check Variable Resolution

**In browser console**:

```javascript
// Get current theme values
const root = getComputedStyle(document.documentElement);
console.log('Background:', root.getPropertyValue('--color-background'));
console.log('Surface:', root.getPropertyValue('--color-surface'));

// Toggle dark mode
document.documentElement.classList.add('dark');

// Check values changed
const rootDark = getComputedStyle(document.documentElement);
console.log('Background (dark):', rootDark.getPropertyValue('--color-background'));
console.log('Surface (dark):', rootDark.getPropertyValue('--color-surface'));
```

### 4. Component Audit

**Check common components use semantic utilities**:

```bash
# Search for hardcoded color classes (should be minimal)
grep -r "bg-white\|bg-black\|text-black" src-react/src/components/

# Search for semantic classes (should be abundant)
grep -r "bg-surface\|bg-background\|bg-card" src-react/src/components/
```

---

## Migration Notes

### From Panda CSS to Tailwind v4

This project previously used Panda CSS. Key differences:

| Panda CSS | Tailwind v4 |
|-----------|-------------|
| `css({ backgroundColor: 'surface' })` | `className="bg-surface"` |
| `panda.config.ts` tokens | `@theme` in `globals.css` |
| `cva()` for variants | Tailwind utilities + `cn()` helper |

**Coexistence strategy**:
- Tailwind handles utility classes
- Panda can still be used for complex component styles if needed
- Single source of truth: CSS variables in `globals.css`

### From Tailwind v3 to v4

**Key changes**:

1. **Theme definition**:
   - v3: `tailwind.config.ts` → `theme.extend.colors`
   - v4: `globals.css` → `@theme { --color-* }`

2. **Dark mode**:
   - Same: `darkMode: "class"`
   - Different: Overrides in CSS `.dark {}` instead of `dark:` variant prefixes

3. **Variable naming**:
   - v3: `colors.surface.DEFAULT` → `bg-surface`
   - v4: `--color-surface` → `bg-surface`

---

## Best Practices

### DO ✅

- Use semantic tokens (`bg-surface`, `text-foreground`) for all UI
- Define all theme variables in `@theme` block
- Keep legacy variables synced with theme variables
- Test dark mode thoroughly on all components
- Use OKLCH color space for better perceptual uniformity

### DON'T ❌

- Mix `@theme` and `tailwind.config.ts` color definitions (choose one source of truth)
- Use hardcoded colors (`bg-white`, `text-black`) unless necessary
- Define theme variables inside selectors (must be top-level in `@theme`)
- Forget to sync legacy `--background` with `--color-background`

### Performance Tips

- Tailwind v4 uses Lightning CSS (faster builds)
- Unused utilities are automatically purged
- CSS variables add minimal runtime overhead
- Dark mode switching is instant (no rebuild needed)

---

## Troubleshooting

### Utility class doesn't exist

**Problem**: `bg-surface` doesn't apply styles

**Solutions**:
1. Verify `--color-surface` is defined in `@theme` block
2. Check `@theme` is at top-level (not nested)
3. Ensure `globals.css` is imported in `main.tsx`
4. Rebuild: `npm run dev` (Lightning CSS regenerates)

### Dark mode not working

**Problem**: `.dark` class added but colors don't change

**Solutions**:
1. Verify `.dark { --color-background: ...; }` exists in `globals.css`
2. Check `.dark` is on `<html>` element (not nested)
3. Ensure `darkMode: "class"` in `tailwind.config.ts`
4. Inspect computed styles to see if variables resolve

### Legacy variables out of sync

**Problem**: shadcn/ui components look different

**Solutions**:
1. Update `:root` block to reference theme variables:
   ```css
   --background: var(--color-background);
   --card: var(--color-card);
   ```
2. Do the same in `.dark` block
3. Restart dev server

---

## Quick Reference

### Current Theme Structure

```
@theme (Tailwind v4)
├── --color-background      → bg-background, text-background
├── --color-surface         → bg-surface, text-surface
├── --color-card            → bg-card, border-card
├── --color-foreground      → text-foreground
├── --color-primary         → bg-primary, text-primary
├── --color-brand-{50-950}  → bg-brand-500, etc.
└── --radius-{sm,md,lg}     → rounded-md, etc.

:root (Legacy compatibility)
├── --background            → Used by some shadcn/ui components
├── --card                  → Used by card components
└── --primary               → Used by legacy components

.dark (Dark mode overrides)
├── --color-background (L=18%)  → Very dark page bg
├── --color-surface (L=36%)     → Lighter surface for contrast
└── (All other semantic tokens)
```

### Dev Commands

```bash
# Start dev server
npm run dev:frontend

# Typecheck (composite build)
npm run typecheck

# Build production
npm run build

# Regenerate Panda CSS (if using)
cd src-react && npx panda codegen
```

---

## Additional Resources

- [Tailwind CSS v4 Theme Variables](https://tailwindcss.com/docs/theme)
- [Tailwind CSS v4 Dark Mode](https://tailwindcss.com/docs/dark-mode)
- [OKLCH Color Space](https://oklch.com/)
- [shadcn/ui Theming](https://ui.shadcn.com/docs/theming)

---

**Maintained by**: OneMind team  
**Questions?**: Check `THEME_AUTO_SYNC_FIX.md`, `STYLING_GUIDE.md`, or ask in team chat
