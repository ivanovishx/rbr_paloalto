import React, { useEffect, useRef, useState } from 'react'

// Board dimensions
const COLS = 12
const ROWS = 20
const CELL = 28 // pixel size per cell

// Timings
const TETRIS_GRAVITY_MS = 700
const SNAKE_STEP_MS = 150

// Types
type CellType = 'empty' | 'tetris-solid' | 'tetris-active' | 'snake' | 'apple'

type Point = { x: number; y: number }

type Tetromino = {
  rotations: Point[][] // list of rotations, each is list of local coords
  color: string
}

type ActivePiece = {
  shapeIndex: number
  rotation: number
  pos: Point // top-left anchor for shape
}

// Shapes (I, O, T, L, J, S, Z)
const TETROMINOES: Tetromino[] = [
  {
    color: '#00d0ff',
    rotations: [
      [ {x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0} ], // I horizontal
      [ {x: 1, y: -1}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 1, y: 2} ], // I vertical
    ],
  },
  {
    color: '#ffd500',
    rotations: [
      [ {x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1} ], // O only
    ],
  },
  {
    color: '#bf00ff',
    rotations: [
      [ {x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1} ], // T up
      [ {x: 0, y: -1}, {x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 0} ], // right
      [ {x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: -1} ], // down
      [ {x: 0, y: -1}, {x: 0, y: 0}, {x: 0, y: 1}, {x: -1, y: 0} ], // left
    ],
  },
  {
    color: '#ff7a00',
    rotations: [
      [ {x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, {x: -1, y: 1} ], // J
      [ {x: 0, y: -1}, {x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: -1} ],
      [ {x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: -1} ],
      [ {x: 0, y: -1}, {x: 0, y: 0}, {x: 0, y: 1}, {x: -1, y: 1} ],
    ],
  },
  {
    color: '#004cff',
    rotations: [
      [ {x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1} ], // L
      [ {x: 0, y: -1}, {x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 1} ],
      [ {x: -1, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, {x: -1, y: -1} ],
      [ {x: -1, y: -1}, {x: 0, y: -1}, {x: 0, y: 0}, {x: 0, y: 1} ],
    ],
  },
  {
    color: '#00d36f',
    rotations: [
      [ {x: 0, y: 0}, {x: 1, y: 0}, {x: -1, y: 1}, {x: 0, y: 1} ], // S
      [ {x: 0, y: -1}, {x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1} ],
    ],
  },
  {
    color: '#ff2147',
    rotations: [
      [ {x: -1, y: 0}, {x: 0, y: 0}, {x: 0, y: 1}, {x: 1, y: 1} ], // Z
      [ {x: 1, y: -1}, {x: 1, y: 0}, {x: 0, y: 0}, {x: 0, y: 1} ],
    ],
  },
]

function randomPiece(): ActivePiece {
  const shapeIndex = Math.floor(Math.random() * TETROMINOES.length)
  return {
    shapeIndex,
    rotation: 0,
    pos: { x: Math.floor(COLS / 2), y: 0 },
  }
}

function within(x: number, y: number) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [tetrisScore, setTetrisScore] = useState(0)
  const [snakeScore, setSnakeScore] = useState(0)
  const [gameOver, setGameOver] = useState<string | null>(null)
  const [disableGameOver, setDisableGameOver] = useState(false)
  const [volume, setVolume] = useState(0.5)
  // Keep score refs to avoid stale values inside the RAF loop closure
  const tetrisScoreRef = useRef(0)
  const snakeScoreRef = useRef(0)

  // Grid for static cells: tetris solid, apple. Active tetris and snake are drawn from state.
  function createGrid(): CellType[][] {
    const g: CellType[][] = []
    for (let y = 0; y < ROWS; y++) {
      const row: CellType[] = []
      for (let x = 0; x < COLS; x++) row.push('empty')
      g.push(row)
    }
    return g
  }
  const gridRef = useRef<CellType[][]>(createGrid())

  // Tetris state
  const activeRef = useRef<ActivePiece>(randomPiece())
  const nextRef = useRef<ActivePiece>(randomPiece())
  const lastGravityRef = useRef(0)

  // Snake state
  const snakeRef = useRef<Point[]>([{ x: Math.floor(COLS / 4), y: Math.floor(ROWS / 2) }])
  const snakeDirRef = useRef<Point>({ x: 1, y: 0 })
  const lastSnakeStepRef = useRef(0)
  const appleRef = useRef<Point | null>(null)

  // Helper: spawn apple on empty cell (not tetris solid nor snake body nor active tetris)
  function isTetrisSolid(x: number, y: number) {
    return gridRef.current[y][x] === 'tetris-solid'
  }
  function activeBlocks(piece: ActivePiece): Point[] {
    const t = TETROMINOES[piece.shapeIndex]
    const blocks = t.rotations[piece.rotation % t.rotations.length]
    return blocks.map((b) => ({ x: b.x + piece.pos.x, y: b.y + piece.pos.y }))
  }
  function cellOccupiedByActive(x: number, y: number): boolean {
    return activeBlocks(activeRef.current).some((p) => p.x === x && p.y === y)
  }
  function cellOccupiedBySnake(x: number, y: number): boolean {
    return snakeRef.current.some((s) => s.x === x && s.y === y)
  }
  function spawnApple() {
    const empties: Point[] = []
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (
          gridRef.current[y][x] === 'empty' &&
          !cellOccupiedBySnake(x, y) &&
          !cellOccupiedByActive(x, y)
        ) {
          empties.push({ x, y })
        }
      }
    }
    if (empties.length === 0) return
    appleRef.current = empties[Math.floor(Math.random() * empties.length)]
  }

  // Tetris helpers
  function canPlace(piece: ActivePiece): boolean {
    const blocks = activeBlocks(piece)
    for (const p of blocks) {
      // Enforce horizontal bounds, and not below bottom
      if (p.x < 0 || p.x >= COLS || p.y >= ROWS) return false
      // Allow negative y (above the visible board) during spawn/descent, but always collide with solids
      if (p.y >= 0 && gridRef.current[p.y][p.x] === 'tetris-solid') return false
      // We ignore snake for active tetris collisions; only solid tetris matters for placement
    }
    return true
  }

  function lockPiece() {
    const blocks = activeBlocks(activeRef.current)
    for (const p of blocks) {
      if (within(p.x, p.y) && p.y >= 0) {
        gridRef.current[p.y][p.x] = 'tetris-solid'
      }
    }
    clearLines()
    activeRef.current = nextRef.current
    nextRef.current = randomPiece()
    // If cannot place new piece, game over
    if (!canPlace(activeRef.current)) {
      if (!disableGameOver) setGameOver('Tetris board filled')
    }
  }

  function clearLines() {
    let cleared = 0
    for (let y = ROWS - 1; y >= 0; y--) {
      let full = true
      for (let x = 0; x < COLS; x++) {
        if (gridRef.current[y][x] !== 'tetris-solid') { full = false; break }
      }
      if (full) {
        cleared++
        // drop everything above
        for (let yy = y; yy > 0; yy--) {
          for (let x = 0; x < COLS; x++) {
            gridRef.current[yy][x] = gridRef.current[yy - 1][x]
          }
        }
        for (let x = 0; x < COLS; x++) gridRef.current[0][x] = 'empty'
        y++ // recheck same row
      }
    }
    if (cleared > 0) {
      setTetrisScore((s: number) => {
        const next = s + cleared * 10
        tetrisScoreRef.current = next
        return next
      })
    }
  }

  // Input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (gameOver) return
      const key = e.key
      let acted = false
      // Tetris controls: A/D/S move, Q/E rotate, W does nothing
      if (key === 'a' || key === 'A') {
        const p = { ...activeRef.current, pos: { x: activeRef.current.pos.x - 1, y: activeRef.current.pos.y } }
        if (canPlace(p)) { activeRef.current = p; acted = true }
      } else if (key === 'd' || key === 'D') {
        const p = { ...activeRef.current, pos: { x: activeRef.current.pos.x + 1, y: activeRef.current.pos.y } }
        if (canPlace(p)) { activeRef.current = p; acted = true }
      } else if (key === 's' || key === 'S') {
        const p = { ...activeRef.current, pos: { x: activeRef.current.pos.x, y: activeRef.current.pos.y + 1 } }
        if (canPlace(p)) { activeRef.current = p; acted = true } else { lockPiece(); acted = true }
      } else if (key === 'q' || key === 'Q') {
        const p = { ...activeRef.current, rotation: (activeRef.current.rotation + TETROMINOES[activeRef.current.shapeIndex].rotations.length - 1) % TETROMINOES[activeRef.current.shapeIndex].rotations.length }
        if (canPlace(p)) { activeRef.current = p; acted = true }
      } else if (key === 'e' || key === 'E') {
        const p = { ...activeRef.current, rotation: (activeRef.current.rotation + 1) % TETROMINOES[activeRef.current.shapeIndex].rotations.length }
        if (canPlace(p)) { activeRef.current = p; acted = true }
      }

      // Snake controls: arrows
      if (key === 'ArrowUp' && snakeDirRef.current.y !== 1) {
        snakeDirRef.current = { x: 0, y: -1 }
        acted = true
      } else if (key === 'ArrowDown' && snakeDirRef.current.y !== -1) {
        snakeDirRef.current = { x: 0, y: 1 }
        acted = true
      } else if (key === 'ArrowLeft' && snakeDirRef.current.x !== 1) {
        snakeDirRef.current = { x: -1, y: 0 }
        acted = true
      } else if (key === 'ArrowRight' && snakeDirRef.current.x !== -1) {
        snakeDirRef.current = { x: 1, y: 0 }
        acted = true
      }

      if (acted) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [gameOver])

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Game loop
  useEffect(() => {
    let raf = 0

    // Start music
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {}) // Ignore errors if autoplay blocked
    }

    function ensureApple() {
      if (!appleRef.current) spawnApple()
    }

    function step(now: number) {
      // Tetris gravity
      if (now - lastGravityRef.current > TETRIS_GRAVITY_MS) {
        const next = { ...activeRef.current, pos: { x: activeRef.current.pos.x, y: activeRef.current.pos.y + 1 } }
        if (canPlace(next)) {
          activeRef.current = next
        } else {
          // lock
          lockPiece()
        }
        lastGravityRef.current = now
      }

      // Snake step
      if (now - lastSnakeStepRef.current > SNAKE_STEP_MS) {
        const head = snakeRef.current[0]
        const dir = snakeDirRef.current
        let newHead = { x: head.x + dir.x, y: head.y + dir.y }
        // collisions with wall
        if (!within(newHead.x, newHead.y)) {
          if (disableGameOver) {
            newHead.x = (newHead.x + COLS) % COLS
            newHead.y = (newHead.y + ROWS) % ROWS
          } else {
            setGameOver('Snake hit a wall')
            draw()
            return
          }
        }
        // collisions with tetris solid
        if (gridRef.current[newHead.y][newHead.x] === 'tetris-solid') {
          if (!disableGameOver) {
            setGameOver('Snake hit a Tetris piece')
            draw()
            return
          }
        }
        // collisions with itself
        if (snakeRef.current.some((s) => s.x === newHead.x && s.y === newHead.y)) {
          if (!disableGameOver) {
            setGameOver('Snake hit itself')
            draw()
            return
          }
        }

        const ateApple = appleRef.current && newHead.x === appleRef.current.x && newHead.y === appleRef.current.y
        const newSnake = [newHead, ...snakeRef.current]
        if (!ateApple) newSnake.pop()
        snakeRef.current = newSnake
        if (ateApple) {
          appleRef.current = null
          setSnakeScore((s: number) => {
            const next = s + 1
            snakeScoreRef.current = next
            return next
          })
        }
        ensureApple()
        lastSnakeStepRef.current = now
      }

      draw()
      raf = requestAnimationFrame(step)
    }

    ensureApple()
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [gameOver, disableGameOver])

  // Draw
  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // Resize canvas to exact pixel grid
    canvas.width = COLS * CELL
    canvas.height = ROWS * CELL

    // Background
    ctx.fillStyle = '#0a0f1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Grid background lines
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath()
      ctx.moveTo(x * CELL + 0.5, 0)
      ctx.lineTo(x * CELL + 0.5, canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * CELL + 0.5)
      ctx.lineTo(canvas.width, y * CELL + 0.5)
      ctx.stroke()
    }

    // Draw tetris solid
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (gridRef.current[y][x] === 'tetris-solid') {
          drawCell(ctx, x, y, '#2e7dd1')
        }
      }
    }

    // Draw active tetris
    {
      const t = TETROMINOES[activeRef.current.shapeIndex]
      const color = t.color
      for (const p of activeBlocks(activeRef.current)) {
        if (within(p.x, p.y) && p.y >= 0) drawCell(ctx, p.x, p.y, color)
      }
    }

    // Draw snake
    for (let i = 0; i < snakeRef.current.length; i++) {
      const s = snakeRef.current[i]
      drawCell(ctx, s.x, s.y, i === 0 ? '#6cf06c' : '#2fbf2f')
    }

    // Draw apple
    if (appleRef.current) {
      drawCell(ctx, appleRef.current.x, appleRef.current.y, '#ff4655')
    }

    // HUD
    const total = tetrisScoreRef.current + snakeScoreRef.current
    ctx.fillStyle = '#ffffff'
    ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ctx.fillText(`Tetris: ${tetrisScoreRef.current}`, 8, 18)
    ctx.fillText(`Snake: ${snakeScoreRef.current}`, 8, 36)
    ctx.fillText(`Total: ${total}`, 8, 54)

    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.textAlign = 'center'
      ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20)
      ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.fillText(gameOver, canvas.width / 2, canvas.height / 2 + 6)
      ctx.fillText('Press R to restart', canvas.width / 2, canvas.height / 2 + 28)
    }
  }

  // Restart handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'r' || e.key === 'R')) {
        // reset
        const g: CellType[][] = []
        for (let y = 0; y < ROWS; y++) {
          const row: CellType[] = []
          for (let x = 0; x < COLS; x++) row.push('empty')
          g.push(row)
        }
        gridRef.current = g
        activeRef.current = randomPiece()
        nextRef.current = randomPiece()
        snakeRef.current = [{ x: Math.floor(COLS / 4), y: Math.floor(ROWS / 2) }]
        snakeDirRef.current = { x: 1, y: 0 }
        appleRef.current = null
        lastGravityRef.current = 0
        lastSnakeStepRef.current = 0
        setTetrisScore(0)
        setSnakeScore(0)
        tetrisScoreRef.current = 0
        snakeScoreRef.current = 0
        setGameOver(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="container">
      <h1>Tetris + Snake Co-op</h1>
      <div className="wrapper">
        <canvas ref={canvasRef} className="board" />
        <div className="side">
          <div className="card">
            <h2>Instructions</h2>
            <ul>
              <li><b>Player 1 (Tetris):</b> A/D move, S soft drop, Q/E rotate, W no-op</li>
              <li><b>Player 2 (Snake):</b> Arrow keys to move</li>
              <li><b>Scoring:</b> Tetris line = +10, Snake apple = +1. Total = sum.</li>
              <li><b>Game Over:</b> Tetris board filled, or Snake hits wall/solid Tetris.</li>
              <li>Press <b>R</b> to restart</li>
            </ul>
          </div>
          <button onClick={() => { setDisableGameOver(!disableGameOver); setGameOver(null); }}>
            {disableGameOver ? 'Enable Game Over' : 'Disable Game Over'}
          </button>
          <div>
            <label>Volume: <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} /></label>
          </div>
        </div>
      </div>
      <footer>
        Built with React + TypeScript. Grid: {COLS}×{ROWS}
      </footer>
      <audio ref={audioRef} src="tetris.mp3" loop />
    </div>
  )
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const px = x * CELL
  const py = y * CELL
  const r = 6
  ctx.fillStyle = color
  roundRect(ctx, px + 2, py + 2, CELL - 4, CELL - 4, r)
  ctx.fill()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export default App
