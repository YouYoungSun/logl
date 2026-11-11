# FAULTLINE ver2 / 2.0.0

## Player-facing changes

- Title screen ability guide: buffs, debuffs, core rules, ranks and concrete examples.
- Reward cards explicitly label both the benefit and the drawback; both are selected together.
- One free reroll of all three pairs per reward or assisted preparation page.
- Every row inserted by one boss attack shares one randomly selected hole column. Each attack is independently random, including repeats. Early erosion rows are separate events.
- After death, restart at sector one or rebuild a new loadout for the previous sector. Sector five death permits sector four, with exactly three prior-reward choices. No defeated bosses or stats are fabricated.
- Standard and assisted records are separated.
- Conversion now awards a fixed 1/2/3 charges when a combo of at least three ends.
- Opening adds (6 + 1% of the sector's unmodified boss HP) per rank to each of the first two clears, before armor and damage reduction.
- Final boss transitions remain reserved at 70% and 35% HP and activate after the announced attack. Phase two adds restrained tremor. Phase three conceals NEXT for three active seconds on entry and every twelve active seconds; current blocks, hold and attack warning remain visible. Pause stops concealment timers; reduced effects removes tremor.
- New generated title art is bundled for offline play.

## Validation

Run `npm test` and `npm run build`. The build regenerates `dist/` and the self-contained `play.html`; title art is embedded in portable HTML. UI verification must cover the guide, rerolls, assisted preparation, death/restart and final phases at desktop and mobile widths.

The older NEXT_VERSION_PLAN.md is an historical proposal. Its 15-ability expansion is not part of ver2; this release keeps twelve buffs and six debuffs.
