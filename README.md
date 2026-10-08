# Clashborn — Auto Duel Arena

A fully automatic 1v1 arena battler that runs in the browser as an installable PWA.
Pick a class and three items for each corner, press **FIGHT**, and watch two adaptive AIs
fight it out in a stylised 3D arena.

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build (dist/)
npm run preview    # serve the production build
npm test           # simulation tests (determinism, termination)
npm run sim        # print a class/item win-rate report from ~1,000 headless battles
A=ronin B=brute IA=frost_core npm run duel   # trace a few seeded duels between two loadouts
```

URL options: `?demo` starts a random duel immediately, `?speed=2|4` sets the playback speed.
Keyboard: `Enter` fight, `Space` pause, `1`/`2`/`4` speed, `Esc` back to loadout, `R` random loadout.

## Deploying to Vercel

Import the repo in Vercel; `vercel.json` already sets the Vite framework, build command and
output directory. It also sets immutable caching for hashed assets and no-cache for the service
worker so updates roll out on the next visit.

## Architecture

```
src/
  sim/            Deterministic battle simulation (no DOM, no three.js)
    battle.ts     Fixed 60 Hz step: actions, hits, projectiles, statuses, items, physics
    ai/brain.ts   Adaptive utility AI (perception → strategy → tactics → learning)
    abilities.ts  Class kits (data)          classes.ts  Base stats + AI personality
    items.ts      Item definitions (data)    fighter.ts  Fighter state + stat calc
  render/         three.js presentation layer
    battleView.ts Turns sim state + events into visuals, sound and camera moves
    fighter/      Procedural rigs, pose library and the per-fighter animator
    fx/           GPU particles, weapon trails, shockwave/pillar pulses, lightning
    scene/        Arena, sky, instanced crowd, banners
    renderer.ts   WebGL2 renderer, merged post-processing, dynamic resolution
    camera.ts     Side-on fight camera with framing, shake and zoom punches
  ui/             DOM HUD, loadout menu, results, floating combat text
  audio/sfx.ts    Procedural Web Audio sound effects (no audio files)
```

### Simulation
- Fixed timestep (60 Hz) with render interpolation, so game logic is identical at any frame
  rate or playback speed.
- Seeded PRNG (`sfc32`); the sim never calls `Math.random`, so a seed + loadouts reproduces a
  fight exactly (the results screen's **Replay** uses this).
- The sim emits events (`hit`, `parry`, `status`, `ko`…) that the view consumes; the view never
  feeds back into the sim. A full 30 s battle simulates in a few milliseconds.

### AI
Each fighter runs a three-layer brain:
1. **Perception** – sees enemy windups only after a per-class reaction delay (with jitter),
   reads projectiles in flight, cooldowns and visible item state (Mirror Ward charge, unused
   Phoenix Feather…).
2. **Strategy** – every ~1.5 s picks a plan (Pressure, Kite, Bait, Defend, All-in, Regroup)
   from health, kit, items, the clock and what it has learned.
3. **Tactics** – scores every usable ability as expected damage × hit probability − punish
   risk, plus defensive answers timed to perceived threats (parry windows, i-frames), whiff
   punishes, interrupts, feints, wall pressure and item-aware choices.
4. **Learning** – moving averages of how often the opponent defends against its windups and
   how often each of its own abilities connects reshape the scores during the fight.

The AI narrates notable decisions in the battle feed ("Reads the heavy — parries!",
"Pops the Mirror Ward with a cheap shot", "Saving the ultimate for after the Phoenix").

### Performance
- WebGL2 with `powerPreference: high-performance`, no default MSAA buffer; one merged
  post-processing pass (bloom, chromatic aberration, vignette, tone mapping, SMAA/MSAA).
- Dynamic resolution: the render scale drops when frames run long and climbs back when there
  is headroom; three quality tiers (auto-detected, switchable in the menu).
- Particles are fully GPU-simulated (spawn-once ring buffer, partial buffer uploads, one draw
  call per system). The crowd is a single instanced draw animated in the vertex shader; static
  arena geometry is merged.
- No textures or audio to download besides one procedural canvas texture; all shaders are
  compiled up front (`compileAsync`) to avoid first-hit hitches.
- HUD writes are change-guarded and only touch `transform`/text; floating numbers are pooled.
- `three` is split into its own long-cached chunk; the service worker precaches everything for
  offline play.

Toggle **FPS** in the menu to see frame rate, JS time, render scale and draw calls.

### Adding content
- **Item**: add an entry to `src/sim/items.ts`; stat-only items work immediately, behaviour
  hooks live in `Battle.abilityHit` / `Battle.applyDamage`. Give the AI a hint in
  `brain.ts` if the item should change how opponents play against it.
- **Class**: add base stats/personality in `classes.ts`, a kit in `abilities.ts`, a rig in
  `render/fighter/rig.ts` and a ready stance in `render/fighter/poses.ts`.
- Run `npm run sim` after balance changes.
