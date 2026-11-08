# Misprint Menagerie — Game Design

**Date:** 2026-11-06\
**Status:** Design proposal for user review\
**Working title:** Misprint Menagerie (name search and clearance remain future work)\
**Project:** `projects/misprint-menagerie/`

## Vision

Misprint Menagerie is a cooperative creature-card summoner in which players collect beings from worlds erased before their stories could finish. Players call these creatures into compact 3D arenas, dodge boss attacks, and use each creature's summoning form to reshape the fight. The central promise is: **build a team of impossible creatures, then use their distinct ways of entering the world to outplay a boss together.**

The visual world is a living print archive: layered dioramas, cut-paper edges, ink marks, and creatures made from visibly different materials. A shared misprint outline and summon sigil make mechs, ghosts, plush creatures, and other forms feel like one collection. The tone is playful and uncanny rather than grim.

This is a product hypothesis. The design does not establish player demand, retention, revenue, or a million-dollar valuation. Those require player and business evidence.

## Approach choice

Three combat structures were considered:

- **Arena-first summoner:** players move and dodge while directing a few authored summons; co-op boss hunts use the same rules. Selected because it supports expressive summon placement and works for solo onboarding as well as cooperative play.
- **Raid-first collector:** co-op bosses are nearly the whole experience. It makes team composition central but depends more heavily on matchmaking and a larger boss catalog.
- **Tactical card board:** players place cards and time abilities on a board. It is easier to read but loses the active movement and physical summon spectacle selected for this game.

The selected scope is arena-first, with co-op boss hunts as a first-class mode rather than a separate combat system.

## Audience and platforms

- **Primary audience hypothesis:** Roblox players who enjoy collecting expressive creatures, building teams, and cooperating through readable action challenges.
- **First platforms:** Mobile and PC, with shared combat rules and a touch-first interface.
- **Encounter size:** One to three players. Solo play is supported; co-op boss hunts are a headline mode.
- **Session target:** A first target of roughly four to six minutes per hunt, to be checked with players rather than treated as a proven ideal.

## Setting and creative identity

The Index is an archive of unfinished or erased worlds. Its residents, called **misprints**, appear as living cards. The player is a caller who assembles a small team and protects the archive from an eraser-like boss that removes or rearranges pieces of the arena.

The working first encounter is **The Redactor**: an original boss concept whose attacks visibly mark and erase arena zones. Its name and final narrative details remain subject to later creative and name review. Its role is mechanical: make players read space and use summons to counter the changing danger.

Every creature card has a fixed identity, role, and authored summoning mechanic. Creature styles are not interchangeable skins, and the game does not create arbitrary creatures from cosmetic combinations.

## Core loop

1. In The Index, inspect the collection and choose a hunt loadout.
2. Enter the arena alone or with up to two teammates.
3. Read the boss's shape, motion, and sound telegraphs; dodge and place summons to answer them.
4. Use simple commands—**Follow**, **Hold**, and **Focus**—to direct active summons.
5. Break the boss's encounter pattern, complete the hunt, and receive a deterministic card unlock or replay choice.
6. Return to The Index and adapt the team for another run.

The first fight should teach movement, one summon call, one boss warning, and one team interaction before it asks players to combine the whole system.

## Combat rules

- Combat runs in real time in a bounded arena with clear summonable regions.
- A summon call is an explicit player action aimed at a valid point. The server confirms the request and the arena shows a short arrival telegraph before the creature appears. The telegraph makes timing and placement legible to teammates and opponents.
- Each card has an authored role, cooldown, summon effect, and combat behavior. Initial tuning should cap a player at two active summons, with a three-card hunt loadout. These are starting bounds for the slice, not balance claims.
- Summons use server-controlled behavior. The player controls their own movement and can issue Follow, Hold, or Focus commands; the client cannot decide summon damage, boss state, card ownership, or rewards.
- The first boss has two distinct attack phases. At least one attack deletes or changes marked arena zones. The team should have more than one valid counter so a single card is not mandatory.
- Target duration is four to six minutes as a playtest hypothesis. Combat pacing and cooldowns are tuning values, not promises.
- A player knocked out by a boss attack respawns at the arena entry after a short delay and loses their active summons. The remaining team can continue. If every participant is knocked out at once, the encounter ends without a reward and offers a retry.

### Starter roster

The first six cards cover different summon mechanics. Names are working names and may change during art production.

| Card | Style | Authored combat identity |
|---|---|---|
| Girdle-9, the Door-Knight | Mech | Crashes in and leaves temporary cover against a marked attack. |
| Nib & Nuzzle | Chibi duo | Chains a quick combo when its call is timed with another summon. |
| Morrowbell | Ghost | Phases through a danger window and marks a boss weak point. |
| Foldwyn, Pagewing | Origami | Unfolds a short-lived barrier or safe path across a threatened zone. |
| Buttongrin | Plush guardian | Intercepts a targeted hit and returns stored force as stagger. |
| Sableline | Ink puppet | Draws a decoy or binding trail that redirects or briefly constrains the boss. |

Later roster candidates include a multi-target swarm, a slow kaiju that interrupts a large attack, and a clockwork creature that changes timing. These are expansion directions, not part of the first slice.

## Collection and progression

- The first slice contains six authored cards. Players begin with three and unlock the remaining three through explicit boss challenges.
- Card rewards are deterministic and earned through play. There are no paid random pulls, duplicate-card grind, or rarity-based combat advantage in the first slice.
- Cards are sidegrades with distinct tactical roles. Collection expands team options rather than raising a paid power ladder.
- Unlocks are server-owned and session-only in the first slice. They reset when a player leaves. This limitation must be visible in the experience and in release notes; the slice must not imply persistent collection.
- Persistent profiles, trading, player-to-player transfers, monetization, and live operations require separate designs and release gates.

## First playable scope

Build one complete vertical slice, not a content shell:

- A compact The Index hub with collection inspection, loadout selection, and a portal into the hunt.
- One visually distinct arena built as a layered print diorama.
- One original boss with two attack phases and changing/erased safe zones.
- Six playable card definitions with the distinct mechanics in the starter roster.
- One to three players, including a complete solo run.
- One hunt per Roblox server at a time; players already in that server opt in through the portal. No cross-server matchmaking or mid-fight joining.
- A full path from hub entry through combat, deterministic reward, and return/replay.
- Session-only collection state, with no data-store writes or production account operations.
- No PvP, trading, matchmaking service, multiple world campaign, paid offers, or random reward packs.

The slice is intended to answer whether summoning placement, creature identity, and co-op boss responses feel good. It is not a complete commercial game or evidence of revenue.

## Roblox source architecture and authority

Create `projects/misprint-menagerie/` as a separate Rojo project from `roblox/templates/base/`. Keep Signal Garden untouched. Use the repository's pinned Rojo 7.7.1 and canonical Luau source; generated `.rbxlx` and `.rbxl` files remain build artifacts.

### Components

- **Shared definitions:** card identities and display data, encounter phase definitions, and typed request/state shapes. Shared values can support the UI, but the server loads the authoritative catalog for all gameplay decisions.
- **Server encounter service:** owns phase transitions, party membership, completion, and cleanup.
- **Server summon/combat service:** validates call and command requests, owns active summon limits, cooldowns, placement, targeting, boss damage, and phase changes.
- **Server collection service:** owns the session's unlocked-card set, validates loadouts, and grants deterministic unlocks once per eligible completed encounter.
- **Client presentation:** card and encounter HUD, touch/keyboard/controller input, telegraphs, animation, and sound. It submits player intent; it does not report authoritative outcomes.

### Authority and request flow

The client submits a small intent (for example, call an owned card at a target position). The server validates payload types and bounds, player and encounter membership, card ownership, the player's sanity-checked position, legal target position and range, call capacity, cooldown, phase, and request rate. Only after validation does the server update encounter state and replicate the result. Server-side combat calculations use server-observed and sanity-checked state; they never accept client-reported damage, unlocks, or outcomes. Invalid or stale requests return a structured rejection and the latest relevant state; they do not silently succeed.

The encounter flow is:

`Index → HuntEntry → BossPhaseOne → BossPhaseTwo → Reward → Index`

Combat transitions are server-owned. If an unexpected runtime error prevents a safe continuation, the encounter should fail visibly and clean up rather than award an unearned win.

## Failure and recovery rules

- Malformed, stale, over-rate, out-of-range, unowned-card, over-capacity, or phase-inappropriate requests are rejected by the server.
- A disconnect removes that player's summons. Remaining players may finish. The disconnected player receives no reward.
- A knocked-out player respawns at the arena entry after a short delay and loses their active summons. The remaining team can continue; a simultaneous team knockout ends the run without a reward and allows a retry.
- If all players leave, the server cleans up the encounter and its temporary instances.
- A completed encounter grants each eligible player its deterministic reward at most once.
- Mid-fight joins, saved mid-run state, and reconnect restoration are outside the first slice.
- Collection and reward state reset when the player leaves, matching the explicitly session-only scope.

## Art, audio, and accessibility

- Use layered 3D diorama environments with cut-paper geometry, ink edges, and material contrast between creature styles.
- Use a shared glyph, border, and silhouette language to tie the collection together while preserving distinct body shapes and materials.
- Make attacks readable through shape, motion, timing, and sound cues, not color alone. Keep warning audio distinct from summon sounds.
- Use large touch targets and one-tap summon/command actions. Do not rely on hover, fine drag gestures, or text-only warnings.
- Include captions or visual equivalents for important audio warnings and a reduced-motion option for strong flashes or screen movement.
- Record all imported or generated art and audio with provenance and license notes in `assets/asset-ledger.json`.
- Target mobile and PC in the slice. Verify low-end device performance and console layouts before making support claims.

## Verification and acceptance

The vertical slice is ready for a player test only after all of the following evidence exists:

1. The new Rojo project builds from canonical source with the repository build command.
2. The repository's relevant offline checks pass, with their scope and limitations reported accurately.
3. An actual Roblox Studio session runs the complete solo loop from The Index to reward and back.
4. Two- and three-client Studio runs demonstrate co-op calls, boss state agreement, and a complete reward path.
5. Studio tests cover player disconnect, all-player exit, respawn, invalid/stale/high-rate requests, summon caps, and one-time reward handling.
6. Client and server console output is reviewed for errors across successful and rejected actions.
7. Mobile UI is reviewed in device simulation and a real viewport; summons, safe zones, boss warnings, and commands remain readable.
8. The full encounter is visually inspected and captured with truthful place/build provenance. Performance is measured on a representative low-end device before budgets are claimed.
9. Small first-run player sessions test: reach a first summon, recognize a boss warning, choose a useful counter, complete or explain failure, and choose whether to replay. Record observations as hypotheses and findings, not evidence of broad market demand.

Publishing, uploads, purchases, production data access, and account permission changes are not part of this design or first slice.

## Product and commercial evidence

The vertical slice has no monetization.

The first tests should answer whether players understand the first summon, notice that creature form changes play, coordinate at least one boss response, and want to repeat the hunt. A small qualitative test can expose usability problems; it cannot validate retention at scale or commercial value.

Do not add a paid economy before the core loop has evidence of comprehension and repeat interest. If later tests support monetization, evaluate direct cosmetic offers separately from competitive power and review current Roblox policy at that time. No revenue or valuation is promised by this design.

## Open risks

- The print-archive art language must unify very different silhouettes without making every creature look like a recolor.
- Summon pathfinding and repeated short-lived arena geometry could strain mobile frame time or network behavior; measure before expanding the roster.
- A real-time summoner risks becoming passive if creature AI performs too much of the encounter; playtests must confirm that dodging, calling, and issuing commands keep the player meaningfully engaged.
- Three players can create visual clutter. The two-active-summon bound and clear telegraph hierarchy need multiplayer viewport review.
- Session-only unlocks are useful for testing the combat loop but cannot demonstrate persistent collection, retention, or a commercial release.
- The title and creature names have not been checked for existing Roblox experiences, trademarks, or other rights conflicts.

## Decisions approved in brainstorming

- Real-time arena combat is the foundation; co-op boss hunts are first-class.
- Creature cards have fixed, authored identities and mechanics; summon styles alter play.
- The first roster spans mech, chibi duo, ghost, origami, plush guardian, and ink puppet.
- Collection starts with three cards and unlocks the remainder through deterministic boss challenges.
- The first deliverable is one complete boss-hunt vertical slice, with session-only unlocks.
- The visual direction is a readable living print archive; mobile and PC are first targets.
- Server authority owns combat, collection, and rewards.
- The slice has no monetization; commercial hypotheses follow player evidence.
