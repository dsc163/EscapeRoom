# Locked In — a 3D escape room

**To play:** double-click `EscapeRoom.html`. It opens in your browser and runs fully offline: no install, no server.

Every room is generated procedurally, and it is always solvable. Puzzles include:
- riddle word-locks and digit riddles
- letter ciphers
- colored number cards with an order clue
- torn notes and books to read
- hidden UV writing
- keypads, symbol dials, lever panels and color-button sequences
- gem sockets, wall safes behind paintings, and nailed crates

Rooms also have plenty of red herrings and movable props. Escape a room and a harder one waits behind the door, with no end.

## Controls
| Input | Action |
|---|---|
| Mouse | Look |
| WASD / Shift / C | Move / run / crouch |
| Left-click | Grab, press buttons, use the held item on a lock |
| E | Open / close drawers, cabinets, chests, paintings |
| Right-click | Drop / put down |
| 1–6 / wheel | Select inventory slot |
| R | Read held note / book / card |
| H | Hint (press twice for detail) |
| M | Mute |

## Source
`src/` holds the source (`engine.js`, `gen.js`, `game.js`, `index.html`). Run `build.ps1` to inline everything, including Three.js, into `EscapeRoom.html`.
