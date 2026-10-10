# Roadmap: making Emberwake less stiff

After session 2 the game works from start to finish, and its systems are
data-driven. What sits on top of them is thin:

- the hero has one forward roll and one combo;
- the camera never follows behind you;
- enemies walk in straight lines with one attack each;
- the boss is a coin flip between two attacks;
- the world is scenery with nothing to find.

This plan comes from a code audit and a headless playtest. Each phase is one
pull request with its own tests. Phases run in order; each builds on the last.

## Phase 1: quick fixes (done in this PR)

- The Warden paid its 40 shells twice; it now pays once.
- A new game no longer greets you with the developer lab. The greeting points
  to Elder Ina and the quest log, and the first quest is announced. The
  "Feel" badge only shows when the feel isn't the default.
- Dorran has words for you after the ending. The lamp-stones you delivered
  are warm once the Hearth is lit.
- **Counter hits:**
  - Only heavy blows count (the grunt's chop and the Warden's sweep, marked
    `counterHit` in `src/game/data/attacks.js`).
  - They only count while you're still winding up your own swing.
  - A mite's bite, a bolt, or a hit once your blade is already moving just
    makes you flinch.
- **The Warden's slam** shows its real shape: a lane on the ground, not a
  full circle. Its two attacks now sound different (`windupSound`). Its slam
  recovery comes from data rather than a hard-coded number.
- **Extra animation clips imported** for the phases below:
  - Knight: directional dodges, walking, block reactions, shield bash,
    falling and landing, a stab.
  - Skeletons: walking, crumbling to bones, rising from the ground, plus
    each type's second move.
  - Villagers: sitting.
  - Cost: +0.96 MB, or 0.17 MB gzipped (docs/PERFORMANCE.md).

## Phase 2: the hero's feel (done; see docs/GAME-FEEL.md)

- **Camera:** drifts back behind you after a moment of running without you
  touching it. Recentring is smooth. Locked on, it frames the target's
  height and stops chasing it when the target is already well framed.
- **Dodge:** each direction plays its own animation (no more sideways
  forward-rolls). With no direction held while locked on, a quick backstep.
- **Attacks:** the sword's contact pose lines up with the frame the hit
  lands. Fades into attacks are shorter. Strafing keeps the leg rhythm when
  you change direction.
- **Movement:** a walk for slow movement, animations timed to your speed, a
  block reaction when the shield takes a hit.
- **Falling:** a falling state with less air control, then a landing. Below
  each area's floor you're caught and put back where you last stood.

## Phase 3: combat depth (done; see docs/GAME-FEEL.md)

- **Context attacks:** a dash slash out of a run, a roll slash, a charged
  chop when attack is held, and a different third hit if you pause.
- **Shield:** you can turn while it's up. A parry window as it rises staggers
  attackers and sends bolts back. A shield bash breaks a grunt's guard.
- **Lock-on:** respects walls, and moves to the next enemy when your target
  falls. Aim assist keeps tracking through the swing's wind-up.
- **Feedback:** a low-health warning, an arrow showing where a hit came
  from, and fewer, merged damage numbers.

## Phase 4: enemies that fight back (done; see docs/GAME-FEEL.md)

- **Wind-ups:** late in a wind-up a hit no longer interrupts it (unless it
  breaks the enemy's poise), so a warning has to be respected. The lock-on
  reticle shows poise.
- **Second moves:**
  - grunts: a follow-up cut, and a shield shove after blocking;
  - mites: a leap;
  - adepts: a flare on the ground, and sidesteps.
- **Movement:** enemies steer round walls and spread out around you instead
  of stacking.
- **Senses:** they only notice you if they can see you (hearing still
  works), hesitate when they glimpse you from afar, call their allies, and
  walk home when they lose you.
- **Group attacks:** a shared budget of 3 threat per room.
- **Death:** skeletons crumble to bones and fade; their shells fly to you.
  (The shells are still counted the moment an enemy falls, so nothing can be
  lost by leaving them.)

## Phase 5: the Warden, rebuilt (done; see docs/GAME-FEEL.md)

- **Attacks by where you stand:**
  - a stomp if you're behind it;
  - a delayed slam from a few metres off;
  - in phase two, a sweep that turns into a slam, and a fissure from afar.
- **Pillars:** slams smash the arena's pillars (a new `breakable` object type).
- **Phase two:** a brighter core and faster turns.
- **Fairness:** the scripted player in `tests/helpers/bossBot.js` still wins
  on Polished at every reaction timing, and Raw stays harder. The table is in
  GAME-FEEL.md.

## Phase 6: a world worth exploring (done, except the items listed as not done)

**Done:**
- **Guidance:**
  - the current objective under the health bar (Settings can hide it);
  - banners queue instead of overwriting each other;
  - a signpost at the dock;
  - a hearthstone by the training ring, so falling in the trial brings you
    back there.
- **Gates:** when a portcullis opens, its bars rise out of sight.
- **Optional content:**
  - two extra chests in the Hearth Halls (the Switch Hall and the
    antechamber);
  - four lore tablets;
  - crates and barrels your sword smashes for a few shells, once each
    (remembered in saves, v4).
- **Bram's shop:** the Ember Plate, a third upgrade (70 shells; you take a
  fifth less damage).
- **Villagers:** they say a line as you pass, which changes with the story,
  and make small gestures now and then.
- **After the ending:** lanterns round the square, and many bright wisps.
- **Atmosphere:** drifting wisps in the village (faint before the ending),
  embers from the Halls' torches, gulls over the shore.

**Not done:**
- **Gates:** a camera shot that shows the gate opening.
- **The Halls:** side rooms (the extra chests sit in existing rooms instead).
- **Wren's satchel:** a clearer route to it.
- **Villagers:**
  - they don't sit;
  - no "!" over a villager with something new to say.
- **The ending:** Ina doesn't stand at the Hearth; no forge-fire change.
- **Bram:** a commission after the ending.
- **The sea:** it doesn't move.
- **Dialogue box:** none of the changes.

## Decisions (defaults until Robert says otherwise)

- **Jump:** no jump button; falling and landing only.
- **Stamina:** no stamina bar. Rolls and blocks cost through timing and chip
  damage, and parry rewards good blocking.
- **Respawns:** beaten enemies stay beaten. Repeat fights happen at
  Dorran's ring.
