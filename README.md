# RBR Palo Alto

This is a project for the RBR Palo Alto hackathon.

## Description

Cooperative two-player browser game combining Tetris and Snake, built with React + TypeScript (Vite).

- Player 1 plays Tetris using WASD (A/D move, S soft drop, W no-op) and Q/E to rotate.
- Player 2 plays Snake using the Arrow keys.
- The total score is the sum of both players' scores: +10 per Tetris line, +1 per Apple eaten by the Snake.
- Game Over when: the Tetris stack reaches the spawn (cannot place a new piece), or the Snake hits a wall or a Tetris block.

## Installation

Prerequisites: Node.js 18+ and npm.

Install dependencies:

```bash
npm install
```

## Usage

Start the dev server:

```bash
npm run dev
```

Open the printed local URL in your browser.

Controls:

- Tetris (Player 1): A/D move, S soft drop, Q/E rotate, W no-op
- Snake (Player 2): Arrow keys to move
- Press R to restart after Game Over

## Contributing

[Add contributing guidelines here]

## License

MIT
