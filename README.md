# Intensity Level Game 🎭

A real-time multiplayer party game inspired by *On a Scale of One to T-Rex*. Players are secretly assigned an intensity level and must perform actions at that intensity — then guess who else is performing at the same level.

**Live Game:** [natchaponsor.github.io/Intensity_level_game](https://natchaponsor.github.io/Intensity_level_game/)

---

## How to Play

### Setup
1. One player creates a room and shares the 6-letter room code
2. Everyone else joins using that code
3. The host sets the number of rounds and starts the game

### Each Round

**Step 1 — Get your cards**
Each player receives a secret Intensity Level card (1–10) with a color (Red, Yellow, or Blue). Three Action Cards are revealed — one per color, shared by all players.

**Step 2 — Vote to Redraw (optional)**
Before performing, any player can call a vote to redraw one color's action card. All other players vote. If 50%+ agree, that card is redrawn. Each color can only be voted on once per round.

**Step 3 — Perform**
Perform the action card matching your color, at the intensity level on your card. This happens in real life — over video call or in person.

**Step 4 — Guess**
Use the app to select which other players you think have the same intensity level as you. You can pick more than one.

**Step 5 — Reveal and Score**
All intensity cards are revealed simultaneously. Points are awarded as follows:

| Result | Points |
|---|---|
| Exact match (same level) | Both players +1 |
| Close match (1 level apart) | No change (0) |
| No match (2+ levels apart) | Guesser -1 |

Everyone starts with 10 points. The player with the highest score after all rounds wins.

---

## Customizing the Action Cards

Action cards are stored in `cards.json`. You can edit this file directly to add, remove, or change any action. The format is:

```json
{
  "red": [
    "Sneeze dramatically",
    "React to stepping on a Lego"
  ],
  "yellow": [
    "Ask your boss for a raise",
    "Apologize for bumping into someone"
  ],
  "blue": [
    "Walk like you own the room",
    "React to finishing a hard workout"
  ]
}
```

Each color needs at least 5 cards to work well. The game draws one random card per color each round.

---

## Tech Stack

- **Frontend** — HTML, CSS, vanilla JavaScript
- **Backend / Realtime** — Firebase Realtime Database
- **Hosting** — GitHub Pages

No build tools, no frameworks, no npm. Everything runs directly in the browser.

---

## File Structure

```
intensity-game/
├── index.html        ← All game screens
├── app.js            ← Game logic and Firebase integration
├── style.css         ← Styles
├── cards.json        ← Action card deck (edit this to customize)
└── README.md
```

---

## Running Locally

Just open `index.html` in a browser. Because it uses Firebase for real-time sync, it works the same locally as it does on GitHub Pages — no local server needed.

---

## Planned Features

- [ ] Bug to be fixed (Players are not moved to the next round with Host)
- [ ] Host can build a custom card deck in-game
- [ ] Rejoin support if a player disconnects
- [ ] Round timer
- [ ] Mobile layout improvements
- [ ] Extra theme packs and fun designs

---

Built by [Natchapon (Top) Sortrakul](https://natchaponsor.github.io) as part of a board game design side project.
