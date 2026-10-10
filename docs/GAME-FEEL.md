# Game feel

"Game feel" is everything that makes pressing a button feel good: the game
answering instantly, a sword hit that lands with weight, a camera that shows
what you need, a dodge that works when you timed it right. Players rarely
notice any one of these techniques; they notice when they're missing, and
call the game "stiff", "floaty" or "unfair".

This game has a **game-feel lab** built in: a panel beside the fight where
every technique below can be switched off or tuned while you play, with one
sentence under each control saying what it does. This document explains each
technique: the problem it solves, how this game does it (with links to the
code), its tuning values and their trade-offs.

**Try it in ten seconds.** Open the game, press **Tab** (or open the lab from
the title screen, or add `?lab` to the address), walk up to the training
dummy and attack it a few times. Then press **Raw** at the top of the lab and
attack it again. Then **Polished**. Nothing about the rules changed: same
damage, same timing windows the code checks. Only the feel did.

Contents:

1. [How the lab works](#how-the-lab-works)
2. [Movement](#movement): acceleration, turning, coyote time, roll buffering
3. [Combat](#combat): input buffering, hit-stop, knockback, invulnerability, cancel windows, aim assist, telegraphs
4. [Camera](#camera): smoothing, auto-follow, look-ahead, collision, lock-on framing, shake
5. [Animation](#animation): cross-fades
6. [Feedback](#feedback): flash, nudge, particles, sound, footsteps, rumble
7. [Showing the invisible](#showing-the-invisible)
8. [The foundations that make it possible](#the-foundations-that-make-it-possible)
9. [The presets, and two common mistakes](#the-presets-and-two-common-mistakes)

---

## How the lab works

Every setting is one entry in [`src/game/data/feel.js`](../src/game/data/feel.js):
an id, a label, its range, its "Polished" default, and the "What this does"
sentence shown in the panel. The lab panel
([`src/game/lab/LabPanel.js`](../src/game/lab/LabPanel.js)) is built from that
list, so adding a technique to the lab is one entry plus the code that reads
it.

**Changing a setting mid-fight never breaks anything** because nothing is
"applied": the simulation and the feedback code read the current value every
time they use it. An attack already in progress keeps its frame data; the
next roll uses the new i-frames; the next hit uses the new hit-stop.

**Saving and sharing.** Settings are kept in `localStorage` and can be shared
as a link: **Copy share link** writes only what differs from Polished, such as
`?lab&feel=hitstopScale:0,cancelWindows:0`, or `?lab&preset=floaty`. Anything
read from a link or from storage is validated first
([`feelSettings.js`](../src/game/feel/feelSettings.js)): numbers are clamped to
their range and snapped to their step, unknown keys are dropped, so a broken
link can't break the game (`tests/labSettings.test.js`).

**Slow motion** (1×, ½×, ¼×) feeds less real time into the fixed-step loop.
The simulation runs exactly the same frames, more slowly, which makes frame
data visible to the naked eye.

---

## Movement

### Acceleration and deceleration

**The problem.** Reaching full speed in one frame and stopping dead in one
frame is maximally responsive, and it looks and feels robotic: there's no
sense that the hero has a body. Long ramps feel heavy and then slippery: you
overshoot ledges and enemies.

**Here.** The hero's velocity moves towards the stick's target velocity at a
constant acceleration: top speed divided by the lab's time, as a vector, so
turning while running carries some momentum through the turn
([`Player.accelerate`](../src/game/player/Player.js)). Speeding up and slowing
down have separate times.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Acceleration | 0.10 s | 0 to 0.6 s | Under ~0.15 s still reads as instant to the hand but softens the start visually; above ~0.3 s you feel late |
| Deceleration | 0.08 s | 0 to 0.6 s | A short skid sells weight; long stops make precise positioning (spacing against a grunt) frustrating |

Stopping is a little faster than starting on purpose: players forgive a
slow start, not a slow stop.

### Turn speed

**The problem.** Snapping instantly to a new direction looks like a glitch on
a 3D character and makes the hero's facing (and so their sword arc) jump.
Turning slowly makes the stick feel disconnected.

**Here.** Facing rotates towards the stick direction at most this many
degrees per second ([`Player.turn`](../src/game/player/Player.js)). At the
maximum it snaps. Attacks are exempt: a swing starts facing the stick
direction at once, then aim assist corrects it, because a sword that swings
the wrong way is worse than a frame of visual snap.

Polished is 900°/s: a full reversal in a fifth of a second.

### Coyote time

**The problem.** A cartoon coyote runs off a cliff and only falls when he
looks down. Players do the same: they press the button a few frames after
their feet left the ledge, because that's when they *meant* to. Without
help, the game says no.

**Here.** This game has no jump, so coyote time applies to the roll: you can
still start a roll for a few frames after leaving the ground (walking off the
steps or the deck). The character controller counts frames in the air
(`CharacterBody.airFrames`); `Player.tryRoll` allows the roll while that is
within the setting.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Coyote time | 6 frames (100 ms) | 0 to 15 | Long enough to cover human timing; much longer and you can visibly roll off thin air |

### Roll buffering

**The problem.** The roll is the escape button. Pressing it a moment before
it's allowed (the last frames of a swing, the end of a previous roll) and
getting nothing is the classic "I pressed it!" moment.

**Here.** Presses go into an input buffer
([`src/engine/input/InputBuffer.js`](../src/engine/input/InputBuffer.js)); a
roll press stays valid for this many frames and fires on the first frame a
roll is allowed. The buffer timeline in the lab shows each press, when it was
used, and when one was lost.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Roll buffering | 8 frames (133 ms) | 0 to 20 | Too long and the game rolls when you'd already changed your mind |

---

## Combat

All attacks are frame data in
[`src/game/data/attacks.js`](../src/game/data/attacks.js). Here is the first
slash, one character per frame (60 a second):

```
          0    5    10   15   20   25
phase     SSSSSSSAAAARRRRRRRRRRRRRRRRR      S startup, A active, R recovery (28 frames, 0.47 s)
hitbox           ####                     frames 7-10   the sword can hurt only here
buffer       bbbbbbbbbb                   frames 3-12   a second press here is remembered...
chain                  ccccccccccccccc    frames 13-27  ...and starts the next slash at frame 13
roll                  rrrrrrrrrrrrrrrr    frames 12-27  a roll may cancel the swing (cancel windows on)
```

The animation is stretched to the attack's length
([`Animator`](../src/engine/assets/Animator.js) `duration`), so animation and
frame data agree, and if they ever didn't, the frame data wins: hitboxes come
from the data, never from the animation.

### Input buffering for combos

**The problem.** A combo should flow when you press attack in rhythm. But the
next slash can only start once the previous one has hit (frame 13 above). A
press at frame 10, which felt perfectly timed, is lost without a buffer, and
mashing produces a stuttering one-two... pause... one.

**Here.** An attack press made during the current swing is kept for up to
this many frames, and the next attack starts at the first frame it's allowed
(`Player.updateAttack`). With Polished's 10 frames, any press from frame 3 of
the first slash chains cleanly; with 0, only presses inside the chain window
itself count. A press can't chain the attack it started (the buffer ignores
presses older than the attack, `InputBuffer.consume(..., notBefore)`).

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Combo input buffer | 10 frames (167 ms) | 0 to 24 | Long buffers make the combo feel automatic and can commit you to a swing you no longer want; 6 to 12 is the usual range |

### Hit-stop

**The problem.** In real life a sword meeting a body slows down. On screen, a
hit that changes nothing for a frame reads as the blade passing through
air: weightless.

**Here.** When a hit lands, the whole fight freezes for a few frames:
`Sandbox.step` counts `hitstop` down and runs nothing else but the camera;
animations hold their pose ([`WorldView`](../src/game/view/WorldView.js) pauses
the mixers). Presses during the freeze are still buffered, so a combo mashed
through hit-stop still comes out. Each attack has its own hit-stop (4 frames
for the slashes, 9 for the overhead chop); the lab scales them.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Hit-stop | 1× (4 to 9 frames) | 0 to 3× | Big freezes make heavy hits feel enormous but interrupt the flow of a combo, and freezing the whole world on every hit makes a group fight choppy |

The freeze is global rather than per-fighter: with one fight on screen it
reads the same, and it keeps the simulation simple and deterministic.

### Knockback

**The problem.** Damage numbers say "you hit it"; movement says "you hit it
hard". Without knockback a combo is a stationary target taking numbers, and
enemies stay in your face after you've hit them.

**Here.** Each attack pushes its target away from the attacker
(`Sandbox.applyHit`); the push decays quickly and goes through the character
controller, so it slides along walls instead of through them. The dummy
springs back to its post. Blocking takes part of the push.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Knockback | 1× (2.5 to 6.5 m/s) | 0 to 3× | Too much and your own combo pushes the enemy out of reach of the next hit; too little and nothing has weight |

### Invulnerability frames on the roll

**The problem.** A dodge that only moves you is a gamble on distance. Players
expect a well-timed roll *through* a swing to work.

**Here.** For part of the roll the hero can't be hurt
(`Player.isInvulnerable`): from frame 2, for this many frames. A hit that
lands then reports `dodge` instead of `hit`, and the game shows **Dodged**.
With the hitbox view on, the hero's capsule turns grey while invulnerable.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Roll invulnerability | 12 of 26 frames | 0 to 26 | All 26 makes rolling a free pass through everything; 0 makes dodging a distance check only. About half the roll, starting almost at once, rewards timing without demanding perfection |

**Which way it goes.** Locked on, the hero keeps facing the target, so a roll
can go sideways or back. The dodge animation matches the way it goes
(`Dodge_Left`, `Dodge_Right`, `Dodge_Backward`), so the hero never slides
sideways in a forward-roll pose. Rolling with no direction held while locked
on is a **backstep**: an 18-frame hop straight back that covers less ground
than a roll and recovers sooner (`PLAYER.backstep`). Its invulnerability is
the lab's setting, capped at 8 frames.

### More than one combo

**The problem.** One three-hit string, whatever you were doing, makes every
fight the same rhythm.

**Here.** What a press starts depends on what the hero was doing
(`Player.opener`). All are data in `attacks.js`:

| Situation | Attack | Why |
| --- | --- | --- |
| Standing or walking | Slash → return slash → chop | The basic string |
| Running flat out (above 80% of top speed) | **Running thrust**: long lunge, keeps your momentum | Closing the gap is an attack in itself |
| Out of the end of a roll | **Rolling sweep**: quick (5 frames), wide | Roll past a swing and punish it |
| A pause before the third press | **Thrust** instead of the chop: longer reach, narrower | A choice between a wide finisher and a long one |
| Holding attack through a swing | **Charge**: the sword draws back; after 0.5 s it glows and hums. Let go to swing the **charged chop** (26 damage, breaks most guards' poise) | A big hit you have to make room for |
| Attack with the shield up | **Shield bash**: little damage, but it goes through a guard and breaks it | The answer to a turtling grunt |

The pause window runs from 8 frames after the chain point to 15 frames
after the return slash ends (`PLAYER.combo`). The thrust, the running thrust
and the bash have measured `animImpact`s like the other swings; the bash's
is measured from the shield, not the sword.

### Parry and chip damage

**The problem.** A shield that blocks everything for free makes holding it
the best move, and the fight stalls.

**Here.**
- **Chip damage:** a blocked blow still costs 12% of its damage, never the
  last hit point. Arrows and embers don't chip.
- **Parry:** raise the shield in the 8 frames before a blow lands and it's
  parried. A melee attacker is thrown off balance (staggered) and you take
  nothing. A bolt goes back at whoever threw it, curving after them, and
  hits for 1.5× its damage.
- **No tapping:** raising the shield again within 0.5 s of lowering it gives
  no parry window.
- **Turning while blocking:** not locked on, the shield turns with the camera,
  so you can face a new threat without lowering it.

There's no stamina bar. Chip damage and the parry are what give blocking a
cost and a skill (`PLAYER.blockChip`, `PLAYER.parry`).

### Attack-cancel windows

**The problem.** If every swing must play out in full, committing to an attack
is a trap the moment a grunt starts winding up. If you can cancel any time,
attacks have no commitment and fights have no tension.

**Here.** Each attack names a frame (`rollCancelFrom`) after which a roll may
interrupt it, roughly once the blow has landed. With the setting off, the
roll waits until the attack ends. The overhead chop's window opens late:
the big hit is the big commitment.

### Lock-on aim assist

**The problem.** In 3D with a camera you control, judging whether a sword
arc will connect is genuinely hard, and a near miss feels like the game's
fault.

**Here.** When a swing starts, the hero turns towards the closest enemy within
3.2 m that is roughly ahead, by up to 75° × the setting (`Player.aimAssist`).
Through the swing's wind-up it keeps turning after that enemy, at up to
300°/s × the setting, so a sidestep doesn't dodge a swing that had already
found its target. Once the blade is moving it stops, so it doesn't feel like
the game is playing for you. While locked on, attacks always face the target.
The numbers are data (`PLAYER.aimAssist`).

**Lock-on and walls.** A target behind a wall, a pillar or a closed gate
can't be locked on to (a ray from the hero's eyes to its chest). A locked
target that stays hidden for 0.75 s lets go. When your target falls, the lock
moves to the next enemy in sight nearest that direction, so a fight keeps
its flow instead of dropping you back to free camera.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Aim assist | 0.6 (up to 45°) | 0 to 1 | Strong assist with several enemies can snap to the wrong one |

### Enemy telegraphs

**The problem.** An attack you can't see coming isn't a challenge, it's
damage. Fairness in action games is mostly about giving the player
information in time to act on it.

**Here.** Every grunt attack begins with a 34-frame wind-up (the attack's
startup):

```
          0    10   20   30   40   50   60   70      one character = 2 frames
phase     SSSSSSSSSSSSSSSSSAAARRRRRRRRRRRRRRRR       wind-up 34, active 6, recovery 32
tracks    ttttttttttttt-----                         turns towards you until frame 25, then commits
telegraph !!!!!!!!!!!!!!!!!                          ring, "!" sign, glowing blade, rising sound
```

During the wind-up a ring on the ground shrinks to the grunt's feet (when it
closes, the blow lands), a warning triangle with "!" grows above its head, its
blade glows, and a rising whine plays from its position, with a caption
([`CharacterView`](../src/game/view/CharacterView.js),
[`GruntBrain`](../src/game/enemies/GruntBrain.js)). The cues are shape,
motion and sound as well as colour, so they work for colour-blind players
and players who can't hear. The grunt keeps turning towards you during the
wind-up, slowly, and stops 9 frames before the hit, so a late roll or a step
to the side works. Only so many attack at once (the room's budget, below),
and after attacking it recovers for 32 frames: your opening. The flip side: a
heavy blow (the grunt's chop, the Warden's sweep: `counterHit` in
`attacks.js`) that lands while you're still winding up your own swing is a
**counter hit** and knocks you down, so attacking into a wind-up you've seen
is a choice with a cost. A light bite, a bolt, or a blow that arrives once
your blade is already moving only makes you flinch.

Switch telegraphs off and the wind-up is still there, but only in the
animation: the same fight suddenly feels unfair.

**The rest of the cast follows the same rules.** Cindermites wind up for 20
frames (short, but there's a ring, a hiss and a caption). Ash adepts wind up 44 frames before each bolt, stop aiming 10
frames before they let go, and the bolt flies at 8.5 m/s: roll through it,
block it, or cut it out of the air. The Cinder Warden's sweep winds up for
34 frames and its slam for 48. The sweep's ring shows its reach; the slam,
which only hits a narrow strip ahead, shows that strip as a lane on the floor
that fills as the axe rises, and each has its own wind-up sound. The slam leaves an opening of about two seconds (its axe stuck, its core
glowing, double damage).

**The Warden reads where you stand** (Phase 5 of [ROADMAP.md](ROADMAP.md);
`WardenBrain.choose`, numbers in `ENEMIES.warden.choice`).

- **Behind it, close:** a stomp. A 28-frame wind-up with its own thud and
  caption, and a closing ring all round it. Its back is no longer a safe
  place to stand.
- **A few metres off:** sometimes (35%) the delayed slam. The same lane, but
  the axe hangs for 66 frames and the blow lunges further. A roll timed to the
  axe going up comes too early; wait for the lane to fill.
- **Phase two:**
  - A sweep sometimes (50%) turns straight into a follow-up slam, with its
    own 40-frame wind-up and lane.
  - From afar it casts, half the time, a fissure instead of the ember volley:
    a line of six rings towards you, bursting one after another. A shield
    doesn't help; step out of the line or roll. Its rings overlap, but it
    hurts you once.
  - Its core burns brighter, and it turns faster while winding up.
- **The pillars break.** Every slam smashes an arena pillar it lands on, so
  hiding behind one works once.

### Enemies that fight back

**The problem.** Telegraphs only matter if ignoring them costs something. When
any hit cancels a wind-up, the safest answer to every warning is to swing
first: the hero's 7-frame opener always beats a 34-frame chop. And enemies
that only walk straight at you, one move each, never make you read anything.

**Here** (Phase 4 of [ROADMAP.md](ROADMAP.md), all numbers in
[`actors.js`](../src/game/data/actors.js) and
[`attacks.js`](../src/game/data/attacks.js)):

- **Armour late in a wind-up.** Past `armorFrom` of its wind-up (60% for the
  grunt's chop, 70% for a cindermite's bite) an enemy still takes the damage
  but doesn't flinch: "Armoured!", a dull clang, and the blow still comes.
  Hit it early, or roll. A blow that breaks its poise (the charged chop, the
  shield bash, a parry) still staggers it, and the lock-on reticle shows its
  poise under its health so you can see how close that is.
- **Second moves.**
  - A grunt sometimes follows its chop with a quicker diagonal cut (40%), on
    the same turn and with its own short telegraph.
  - When its shield stops your blow, it sometimes shoves back with it (50%),
    after a beat.
  - A cindermite a few metres out sometimes leaps at you instead of closing in.
  - An ash adept sometimes casts a **flare** under you instead of a bolt: a
    ring on the ground that fills, then bursts. A shield doesn't help; step
    out or roll. When you swing at an adept up close, it sometimes
    sidesteps.
- **Moving like a group.**
  - Enemies look ahead as they walk and turn towards the side with more room
    when a wall or pillar is in the way.
  - Allies that get too close push apart, and each circles you away from
    its nearest ally, so a pack spreads round you instead of stacking.
- **Senses.**
  - They see only what nothing solid hides (no more noticing you through the
    Key Vault's portcullis), but still hear you close by.
  - Seen from afar, they stop and look first (a "?"). Then they call allies
    near them who can see them (a "!").
  - They give up after 4 s without seeing you, or beyond their range, and
    walk back to where they started, poise restored.
- **A shared budget.** An attack turn costs the enemy's `threat` (grunt 2,
  cindermite and adept 1) from a room budget of 3. A grunt and a cindermite
  may attack together; two grunts may not. The others circle and wait.
  (Before, each type had its own token, so a grunt, two mites and an adept
  could all swing at once.) The Warden has a budget of its own.
- **Death.** Skeletons crumble to bones (their own clip), then fade away in a
  puff of ash. Their shells spill out as glowing beads that fly to you.

`tests/gruntAi.test.js` and `tests/enemies.test.js` cover each of these: the
armour point, the follow-up and the shove, the leap and the flare in the
real simulation, steering round a wall, calling allies, the portcullis, and
the budget never going over 3 in a 20-second brawl.

**Testing fairness.** `tests/helpers/bossBot.js` is a scripted player that
only sees what you see (states, distances, the closing ring, rings on the
floor) and only presses buttons. It fights the Warden with ordinary tactics:
- keep a few metres away;
- roll when the ring has nearly closed (sideways from any slam's lane, back
  from a sweep or a stomp);
- step out of fissure rings;
- punish the opening.

Its results against the rebuilt Warden (Phase 5), with one tonic, rolling
4, 8, 12 or 16 frames before the blow:

| Preset | 4 | 8 | 12 | 16 |
| --- | --- | --- | --- | --- |
| Polished | won, 100 HP left | won, 100 | won, 100 | won, 100 |
| Raw | **lost** (Warden at 152 HP) | won, 3 HP left | won, 100 | won, 43 |

Before Phase 5, Polished also won all four (one with 49 HP left), and Raw
lost one of four. On Raw there are no telegraphs and no roll
invulnerability. `tests/enemies.test.js` keeps both facts true.
`tests/helpers/bossBot.js` also reports which moves the Warden used in each
fight.

The bot never ends up behind the Warden, so it never sees the stomp. The
stomp, the follow-up slam, the fissure and a pillar breaking each have their
own test in `tests/enemies.test.js`. It's not a human playtest, and it's listed as one in the
PR, but it makes "fair on Polished, harder on Raw" something a test can
break.

---

## Camera

The camera is simulated at the fixed rate like everything else
([`src/engine/camera/FollowCamera.js`](../src/engine/camera/FollowCamera.js))
and drawn interpolated. Shake is added only when drawing.

### Follow smoothing

**The problem.** A camera bolted to the hero transmits every small
correction, collision bump and step as a jolt. A camera that lags too much
loses the hero.

**Here.** The pivot (the point the camera orbits) eases towards the hero with
an exponential approach that behaves identically at any frame rate
(`damp` in [`math.js`](../src/engine/core/math.js)), with the lag capped at
2.5 m so the hero can never leave the screen.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Follow smoothing | 0.12 s | 0 to 0.6 s | Smoother is calmer but less precise; 0 is perfectly precise and twitchy |

### Auto-follow

**The problem.** An orbit camera that stays wherever it was put makes you
steer two things at once. Run sideways for a while and you end up looking at
the hero's shoulder, correcting the camera by hand every few seconds.

**Here.** Once you haven't touched the camera for a moment, it drifts round
behind you as you run, faster the faster you run. It never follows when you
run towards it (that would whip it round), and any turn of the camera by hand
restarts the delay, so it never fights your hand. A side effect, as in other
third-person games: holding sideways makes the hero curve round the camera.
Recentring (lock-on with nothing to lock on to) eases in and out over 0.35 s
instead of swinging at a flat speed.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Auto-follow | 0.6× | 0 to 1 | Strong follow saves steering but takes control away in open areas; 0 leaves the camera where you put it |
| Auto-follow delay | 0.8 s | 0 to 3 s | Too short and the camera tugs against you right after you've aimed it |

### Look-ahead

**The problem.** A camera centred on the hero shows as much of where you've
been as where you're going.

**Here.** The pivot is pushed ahead in the direction of travel, scaled by
speed, so standing still looks straight at the hero and sprinting shows the
path ahead.

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Look-ahead | 1.2 m | 0 to 3 m | Large values swing the view around on every change of direction |

### Collision avoidance

**The problem.** Back the hero against a wall and an orbit camera ends up
inside the wall, showing nothing.

**Here.** Each update a sphere (0.28 m) is swept from the hero's head towards
where the camera wants to be, using Rapier's shape cast against the level
(characters are ignored). If it hits, the camera sits just short of the hit.
It pulls in at once (you never see the inside of a wall) and eases back out
over a quarter of a second (so it doesn't pump in and out along a bumpy
wall). Sweeping from the head, not from the look-ahead pivot, matters: the
pivot can be inside a prop, and a probe that starts inside something always
reports a hit. The lab's camera view draws the probe (orange when it hits).
Try it at the pillar by the arena gate.

### Lock-on framing

**The problem.** Locked on to an enemy, you need to see both yourself and the
target, whichever way you move.

**Here.** While locked on, the camera swings to the far side of the hero from
the target, aims at a point a third of the way towards the target, and backs
off as they get further apart. It only turns once the target drifts more than
0.3 rad from the middle of the view, so a fight that's already well framed
doesn't keep the camera swaying. Tall targets (the Cinder Warden, 2.6 m) are
aimed at higher and from further back, so they aren't cropped. Switch it off and the camera just follows; the
target leaves the screen as soon as you strafe.

**Lock-on itself** ([`lockOn.js`](../src/game/combat/lockOn.js)) picks the
target closest to the centre of the camera's view, not the closest in
distance (what you're looking at is what you meant), switches with a flick of
the stick, mouse or arrow keys, and lets go when the target dies or gets more
than 18 m away. With nothing to lock on to, the button recentres the camera
behind the hero.

### Shake

**The problem.** A big hit should rattle the screen, but shake is tiring,
nauseating for some players, and makes aiming harder.

**Here.** Hits add "trauma"; the shake amount is trauma², so small hits barely
move the camera and big ones do; it decays in about half a second and uses
smooth noise rather than random jumps
([`CameraShake.js`](../src/engine/camera/CameraShake.js)). The offset and roll
are hard-capped whatever the slider says, shake never moves the simulated
camera (so it can't affect aiming), and **Reduced motion** in Settings turns
it off entirely (the default follows the system's reduced-motion setting).

---

## Animation

### Cross-fade blending

**The problem.** Animations are authored separately. Switching from a run to
an attack in one frame makes the character pop between poses.

**Here.** Every animation change blends from the old pose to the new one over
this time ([`Animator`](../src/engine/assets/Animator.js), `crossFadeFrom`).

| Setting | Polished | Range | Trade-off |
| --- | --- | --- | --- |
| Cross-fade | 0.12 s | 0 to 0.4 s | Long blends look smooth but mush fast actions together (an attack's wind-up blurs into the previous pose); 0 snaps |

**Fades into attacks are shorter** (0.05 s at most): a 0.12 s blend would
swallow most of a 7-frame swing's startup.

### Timing the swing to the hit

**The problem.** If an attack's animation is simply stretched to its length,
the blade's contact pose lands wherever the animator put it, often after the
hitbox has already dealt the hit.

**Here.** Each of the hero's swings has an `animImpact`: how far through its
clip the blade moves fastest. These were measured from the knight's clips by
tracking the sword tip's speed at 120 points: 0.375 for the diagonal slice,
0.233 for the horizontal and 0.508 for the chop. The clip is then timed so
that moment falls in the middle of the active frames, when the hit is dealt.
Enemies already work this way (`IMPACT` in `CharacterView`).

### Feet that don't slide

**The problem.** One run clip played at every speed means feet skating at a
jog, and at full speed if the clip was authored slower than the character
moves.

**Here.** The hero walks (`Walking_A`) below 1.4 m/s and runs above it. Every
locomotion clip is played at the rate that matches the hero's ground speed,
from its measured speed (`PLAYER.clipSpeeds`: the toes' speed along the
ground while planted, at the game's scale). The knight's run covers about
3.1 m/s at normal speed, so at the hero's 6.2 m/s it plays twice as fast.
Before, it played at normal speed and the feet slid. Changing strafe
direction keeps the point in the stride (`syncPhase`), so the legs don't
restart on the same foot. A blow on the shield plays a short recoil
(`Block_Hit`).

**Not done:** blocking and drinking while walking still use a single pose
(the animation system has one layer, so legs and arms can't play different
clips).

### Falling

Walking off an edge (more than 6 frames in the air) starts a **fall**:
`Jump_Idle`, a third of the running steering, no attacks or rolls. A drop of
24 frames or more ends in a short **landing** (`Jump_Land`, 10 frames).
Below an area's floor (`killY`, default -12 m), the hero is put back on the
last solid ground they stood on, with 10 damage.

**Root motion** (moving the character by the animation's own movement) isn't
used: KayKit's clips are authored in place, and code-driven movement is what
makes frame data and lunges exact. So the lab has no root-motion switch.

---

## Feedback

Each of these is checked at the moment it fires
([`WorldView.listen`](../src/game/view/WorldView.js)).

| Technique | What it does here | Why |
| --- | --- | --- |
| **Hit flash** | The target's materials glow white for ~0.12 s (softer with reduced motion) | Instant, unmistakable confirmation that the hit connected, even in a crowd |
| **Camera nudge** | The view kicks up to 18 cm in the direction of the blow and springs back | You feel *which way* the hit went; off with reduced motion |
| **Particles** | Sparks from the contact point, along the blow; dust under rolls | Marks exactly where the hit landed |
| **Impact sounds** | Swing whooshes, crunchy hits, a wooden thock on the dummy, metal on blocks | Sound carries half of a hit's weight; all synthesised ([`sounds.js`](../src/game/data/sounds.js)) |
| **Positional sound** | Sounds come from their position (HRTF), the listener is the camera | You can hear a grunt winding up behind you |
| **Footsteps by surface** | Grass, dirt, stone and wood sound different, from the level's `area_*` zones | The world feels like it has materials; off, every step is the same tap |
| **Controller rumble** | Short dual-motor pulses on hits, stronger when you're hit | Touch feedback; only where the browser and pad support `vibrationActuator` |
| **Low-health warning** | Below 30% health the screen's edges darken red, more as it drops, with a soft heartbeat that quickens | You notice you're in danger without looking at the bar |
| **Hit direction** | When you're hit, a red arc on a ring round the middle of the screen points to where it came from | Hits from behind are no longer a mystery |
| **Merged numbers** | Damage numbers on the same target within 0.6 s add up into one number, which pops as it grows | A combo reads as one total instead of a pile of numbers |
| **Parry and charge** | A bright ring, sparks and "Parried!"; a glowing, humming blade at full charge | The two skill moves announce themselves |
| **Armour** | "Armoured!" and a dull clang when a hit doesn't stop an enemy's wind-up | It reads as a rule, not a missed hit |
| **Enemy alerts** | "?" over an enemy that has glimpsed you, "!" over one an ally has called | You see a fight coming before it starts |
| **Crumble and shells** | Beaten skeletons fall to bones and fade in ash; their shells fly to you as beads | The kill pays off, and the field clears |

---

## Showing the invisible

The lab's "Show the invisible" section draws what's normally hidden:

- **Colliders**: every physics shape (Rapier's debug lines), level and characters.
- **Hitboxes and hurtboxes**: red spheres are the sword's hitbox, only during
  active frames; cyan capsules are hurtboxes, grey while invulnerable. In
  slow motion you can watch a roll's i-frames let a grunt's blade through.
- **State machine**: the hero's current state and frame (and for attacks, the
  attack's frame and phase), which states it may change to (teal) and which
  are blocked (struck through), and the last few changes.
- **Input buffer**: the last two seconds of attack and roll presses: when
  each was pressed (yellow), when the game used it (green, joined by a line),
  presses that were lost (red), the current buffer windows (blue bands) and
  hit-stop (grey bars).
- **Camera target and probe**: the pivot, and the collision sweep.
- **Performance**: fps, frame time (and the worst frame), draw calls,
  triangles and the physics step time.

---

## The foundations that make it possible

None of the techniques above work reliably without these.

**A fixed timestep.** Frame data is only meaningful if a frame is always
1/60 s. The simulation runs at exactly 60 Hz whatever the display does, and
rendering interpolates between steps
([`FixedStepLoop`](../src/engine/loop/FixedStepLoop.js); the details are in
[ENGINE.md](ENGINE.md#the-game-loop)). `tests/fixedStepLoop.test.js` plays
the same scripted fight at 30, 60 and 144 fps and with uneven frame times,
and checks the results are identical to the last bit.

**Frame data as data.** Every attack's timing, damage and windows live in one
table, so balancing is a data change, and tests check that hitboxes exist
only in active frames, that invulnerability and front-only blocking are
honoured, and that combos chain inside their windows.

**A character controller, not a physics body.** The hero moves exactly as
the game decides, never bounced or launched by the solver; slopes, steps and
walls are handled by Rapier's kinematic character controller.

**An explicit state machine.** Every state the hero can be in, and every
allowed change, is one table
([`Player.js`](../src/game/player/Player.js) `TRANSITIONS`). "Can I roll out of
an attack?" has one answer in one place, the lab can draw it, and tests check
it.

**Deterministic, headless simulation.** The fight runs in Node with no
renderer, seeded randomness and events instead of direct calls to sound or
graphics. That's what makes all of the above testable.

---

## The presets, and two common mistakes

| Preset | What it is |
| --- | --- |
| **Polished** | Everything on and tuned. The default. |
| **Raw** | Every technique off: instant starts and stops, snap turns, no buffers, no coyote time, no hit-stop, no knockback, no i-frames, no cancel windows, no aim assist, no telegraphs, a rigid camera that goes through walls, no blending, no flash, no particles, no impact sounds (footsteps become one plain tap). The rules are the same; it feels stiff, weightless and unfair. |
| **Floaty** | A common mistake: long acceleration and deceleration, slow turns, a lazy camera with a big look-ahead, long blends, no hit-stop, soft knockback. Nothing is *wrong*, everything is late. |
| **Twitchy** | The opposite mistake: instant everything, a rigid camera, tiny buffers, short i-frames, huge shake and knockback. Very responsive, and harsh and hard to read: enemies fly out of reach of your own combo. |

The numbers in "Polished" come from common practice in action games and
were checked in scripted fights and screenshots in headless,
software-rendered Chromium during development. They have not been tuned by
hand on real hardware yet: they are a starting point, not a measurement. The
right values depend on the final animations, enemies and levels, and should
be tuned on a real device with real players (Robert's to do; see the PR).
