# 🎱 8-Ball Pool — World-Class Web Billiards Simulator

An authentic, feature-packed 8-Ball Pool web application built with **Next.js 16**, **TypeScript**, **HTML5 Canvas 2D/3D Shader Engine**, and **Tailwind CSS**. Featuring realistic 3D rigid-body collision physics, Euler rolling mechanics, authentic sound effects, multiple game modes, three specialized AI bot difficulty engines, and full mobile & desktop responsiveness.

---

## ✨ Features

### 🌟 3D Animated Landing Page
- **Dynamic 3D Canvas Background**: 60fps 3D orbiting billiard ball canvas background with interactive lighting.
- **Mouse Parallax 3D Card Tilt**: Smooth glassmorphism 3D tilt effects on mode selector cards.

### 🎮 Game Modes
1. **2 Players (PvP Local)**: Classic pass-and-play local multiplayer mode with official 8-ball rules, turn timers, and shot evaluation.
2. **Solo Practice Mode**: 
   - **Midnight Obsidian Black Felt Table** (`#262626` → `#020202`).
   - Direct play without player turn cards or 30-second ticking shot clocks.
   - Cleared-rack victory completion modal with **Green HOME** and **Red PLAY AGAIN** buttons.
3. **Vs Computer AI Bot**: Play against intelligent AI opponents with selectable difficulty tiers.

---

## 🤖 Advanced AI Bot Specifications

| Difficulty | Geometry Analysis | Lookahead & Position Play | Precision Noise | Defense Strategy |
| :--- | :--- | :--- | :--- | :--- |
| 🟢 **Easy Bot** | Scans nearest 2 pockets per eligible ball | $S_{\text{position}} = 0$ (Immediate pot score only) | $\pm 3.0^\circ$ to $\pm 5.0^\circ$ noise | Soft defensive tap toward nearest legal ball |
| 🟡 **Medium Bot** | Scans all 6 pockets; filters cut angles $> 65^\circ$ | Prioritizes target balls closest to pockets | $\pm 1.0^\circ$ to $\pm 1.5^\circ$ noise | Controlled cushion contact shot |
| 🔴 **Master AI** | Scans all 6 pockets; accepts cut angles up to $85^\circ$ | 2D tangent vector lookahead physics simulation for cue ball rest position | **0.0° noise** (100% precision) | Calculated snooker safety play |

*Strict Rule across all AI Bot Modes: Ball #8 is 100% protected and cannot be targeted or pocketed until all assigned group balls (Solids/Stripes) are cleared.*

---

## ⚙️ Physics & Controls Engine

- **3D Euler Ball Rolling Mechanics**: Dynamic 3D rotation (`rotX`, `rotY`, `rotZ`) depicting actual physical ball roll and friction spin.
- **Ball-in-Hand Control**: Move cue ball freely across table bounds during foul placement, with pocket overlap rejection and ball-to-ball displacement protection.
- **Cue Spin & English Dial**: Interactive spin widget to apply top-spin (follow), back-spin (draw), and side-spin (english).
- **Target Ball Aim Locking**: Click/tap target balls to align cue stick trajectory line automatically.
- **Large & Prominent Cue Stick Slider**: Full-height vertical cue stick asset (`/assets/cue_stick.png`) with animated pullback mechanism and percentage pill badge.

---

## 🎵 Authentic Audio Engine

Integrates authentic 8-ball pool sound effects (`/public/8 Ball Pool sounds/`):
- 🔊 **Rack Sound (`rack.mp3`)**: Plays on match start and rack reset.
- 🔊 **Cue Stick Impact (`cue_hit.mp3`)**: Dynamic velocity-based cue impact volume.
- 🔊 **Ball Collision (`ball_hit.mp3`)**: Hard & soft ball contact sounds.
- 🔊 **Pocket Pot (`pocket.mp3`)**: Ball pocketing audio feedback.
- 🔊 **Foul Warning (`foul.mp3`)**: Shot fouls and 30s turn clock timeouts.
- 🔊 **Timer Tick (`timer_tick.mp3`)**: Warning ticks for last 5 seconds of turn clock.

---

## 📱 Mobile & Desktop Responsiveness

- **Google Open Sans Typography**: Applied globally across all UI elements and modals.
- **Adaptive Layout Grid**: `480px` vertical right sidebar on Desktop/Laptop (`≥ 1024px`), transforming into a compact `220px` touch-optimized control panel on Mobile screens (`< 1024px`).
- **Touch Lock**: Configured viewport meta (`userScalable: false`) to prevent page scrolling or rubber-banding during touch aiming and cue pulling.

---

## 🛠️ Technology Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & Vanilla CSS
- **Graphics**: HTML5 Canvas 2D & 3D Shader rendering
- **Typography**: [Google Open Sans](https://fonts.google.com/specimen/Open+Sans)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18.x or higher
- npm, yarn, or pnpm

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/wadekarharshvardhan/8_ball_pool.git
   cd 8_ball_pool
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your web browser.

4. **Build Production Bundle**:
   ```bash
   npm run build
   npm run start
   ```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
