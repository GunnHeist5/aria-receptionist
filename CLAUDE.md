# Domain Platform — ARIA Capital LLC

## What This Is
Premium anti-Shopify luxury store builder.
Target customer: High-end brands wanting 
beautiful storefronts.

## Tech Stack
- Next.js 14
- Framer Motion (animations)
- Tailwind CSS (styling)
- Stripe (payments)
- Supabase (database)

## Design Philosophy
- Dark luxury aesthetic
- Gold accents (#c9a84c)
- Smooth Framer Motion transitions
- Mobile first always

## Critical Rules For Claude Code
1. Never rewrite entire files
2. Make surgical edits only
3. Always check if component exists before creating
4. Keep all components under 150 lines
5. Use TypeScript strictly
6. Comment complex logic only

## Current Status
✅ **Project Infrastructure Complete**
- Next.js 14 with App Router
- TypeScript strict mode (ES2020)
- Tailwind CSS with custom animations
- shadcn/ui component structure (/components/ui)
- Path aliases (@/* working)

✅ **Core Components Ready**
- SplineScene (client-side, lazy-loaded)
- Spotlight effect (SVG animation)
- Card components (6 exports)
- Demo showcase component

✅ **All Dependencies Installed**
- next, react, react-dom, typescript
- @splinetool/react-spline, @splinetool/runtime
- framer-motion, clsx, tailwind-merge
- tailwindcss, postcss, autoprefixer

✅ **Configuration Complete**
- tsconfig.json (with @/* alias)
- tailwind.config.ts (spotlight animation)
- app/globals.css (CSS variables, dark mode)
- postcss.config.js
- next.config.js

🚀 **Ready to Run**
```bash
npm run dev    # Start at http://localhost:3000
npm run build  # Production build
```

## Feature Progress
- Hero section: ✅ Done (Spline + Scroll animation demos available)
- Product grid: ❌ Not started
- Checkout flow: ❌ Not started
- Authentication: ❌ Not started
- Admin dashboard: ❌ Not started

## Recently Integrated Components
- ✅ `RainbowMatrixShader` - 3D shader animation with UnicornStudio
  - Location: `/components/ui/rainbow-matrix-shader.tsx`
  - Uses: unicornstudio-react, custom useWindowSize hook
  - Features: Responsive 3D renderer, dynamic window sizing
  - Demo: `/rainbow-demo` route
  - Props: projectId (string), className (string), production (boolean)

- ✅ `ContainerScroll` - Scroll-driven animation component
  - Location: `/components/ui/container-scroll-animation.tsx`
  - Uses: framer-motion (useScroll, useTransform, motion)
  - Features: Responsive scaling, 3D rotation, parallax translation
  - Demo: `/scroll-demo` route
  
## Available Demo Routes
- `/` → Spline 3D interactive scene
- `/scroll-demo` → Container scroll animation showcase
- `/rainbow-demo` → Rainbow matrix shader animation
