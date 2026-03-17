# LSWOO Admin Design System

## 1. Core Palette
- **Primary Background**: `#0a0a0b` (Deep Charcoal / OLED Black)
- **Sidebar Surface**: `#0e0e0f` (Unified dark depth)
- **Glass Containers**: `rgba(255, 255, 255, 0.03)` with `backdrop-filter: blur(12px)`
- **Accent Blue**: `#3b82f6` (Electric Blue) - used for highlights, icons, and status.
- **Neon Success**: `bg-green-500` with `animate-pulse` for live telemetry.
- **Danger Zone**: `rgba(239, 68, 68, 0.1)` (Soft red glass) with pure red text.

## 2. Typography
- **Primary Font**: `Outfit` (Google Fonts) - Geometric sans-serif for a premium tech feel.
- **Headings**: Semi-bold, tight tracking (`tracking-tight`).
- **Body**: Medium weight, high contrast (`text-white` or `text-gray-400`).
- **Monospace**: System Mono for SKUs, IDs, and payload inspection.

## 3. UI Tokens
- **Roundness**: `rounded-[2rem]` for large surface areas, `rounded-xl` for components.
- **Borders**: `border-white/5` (Ultra-subtle transparency).
- **Glows**: `shadow-[0_0_15px_rgba(59,130,246,0.5)]` for primary action indicators.
- **Theme Mode**: `DARK`

## 4. Stitch Generation Notes
When generating screens, strictly adhere to the "Glassmorphism" principle. Use large radius corners and subtle translucent borders. All UI should feel "floating" over the deep charcoal background. Use pulsating indicators for all live data streams.
