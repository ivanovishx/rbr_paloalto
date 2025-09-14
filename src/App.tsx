import React, { useEffect, useRef, useState } from 'react'

// Board dimensions
const COLS = 12
const ROWS = 20
const CELL = 32 // pixel size per cell

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
  const [flashActive, setFlashActive] = useState(false)
  const [highScores, setHighScores] = useState<{ name: string; score: number; date: number }[]>([])
  // Keep score refs to avoid stale values inside the RAF loop closure
  const tetrisScoreRef = useRef(0)
  const snakeScoreRef = useRef(0)
  const processedGameOverRef = useRef(false)

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
  function wouldCollideWithSnakeOrAppleOnNextFall(piece: ActivePiece): boolean {
    // check each block one row below
    const blocks = activeBlocks(piece)
    for (const p of blocks) {
      const nx = p.x
      const ny = p.y + 1
      // Only consider collisions within visible grid
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
        if (appleRef.current && appleRef.current.x === nx && appleRef.current.y === ny) return true
        if (snakeRef.current.some((s) => s.x === nx && s.y === ny)) return true
      }
    }
    return false
  }
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
      triggerFlash()
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
        const next = { ...activeRef.current, pos: { x: activeRef.current.pos.x, y: activeRef.current.pos.y + 1 } }
        if (wouldCollideWithSnakeOrAppleOnNextFall(activeRef.current)) {
          // suspend: do nothing (no lock)
          acted = true
        } else if (canPlace(next)) {
          activeRef.current = next; acted = true
        } else {
          // blocked by floor/solid -> lock
          lockPiece(); acted = true
        }
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
        if (wouldCollideWithSnakeOrAppleOnNextFall(activeRef.current)) {
          // suspend falling until path is clear
          lastGravityRef.current = now
        } else if (canPlace(next)) {
          activeRef.current = next
          lastGravityRef.current = now
        } else {
          // lock on floor or solid tetris
          lockPiece()
          lastGravityRef.current = now
        }
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
          triggerFlash()
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

  // Music volume control
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  // Start music on first loop
  useEffect(() => {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {})
    }
  }, [])

  // High scores persistence via cookies
  useEffect(() => {
    const loaded = loadHighScoresFromCookie()
    if (loaded) setHighScores(loaded)
  }, [])

  useEffect(() => {
    // when game over, check high score once
    if (gameOver && !processedGameOverRef.current) {
      processedGameOverRef.current = true
      const total = tetrisScoreRef.current + snakeScoreRef.current
      const updated = maybeInsertHighScore(highScores, total)
      if (updated) setHighScores(updated)
    }
    if (!gameOver) processedGameOverRef.current = false
  }, [gameOver])

  function triggerFlash() {
    setFlashActive(true)
    setTimeout(() => setFlashActive(false), 120)
  }

  // Draw
  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // DPR-aware sizing for crisp pixels
    const dpr = (window.devicePixelRatio || 1)
    const logicalW = COLS * CELL
    const logicalH = ROWS * CELL
    if (canvas.width !== Math.floor(logicalW * dpr) || canvas.height !== Math.floor(logicalH * dpr)) {
      canvas.style.width = `${logicalW}px`
      canvas.style.height = `${logicalH}px`
      canvas.width = Math.floor(logicalW * dpr)
      canvas.height = Math.floor(logicalH * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Background
    ctx.fillStyle = '#0a0f1a'
    ctx.fillRect(0, 0, logicalW, logicalH)
    if (flashActive) {
      ctx.fillStyle = 'rgba(255,255,200,0.08)'
      ctx.fillRect(0, 0, logicalW, logicalH)
    }

    // Subtle checkerboard background to hint the grid (avoids 1px stroke artifacts)
    const shade = 'rgba(255,255,255,0.03)'
    ctx.fillStyle = shade
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (((x + y) & 1) === 0) {
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
        }
      }
    }

    // HUD panel background for readability
    const hudW = 200
    const hudH = 70
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.strokeStyle = 'rgba(0,229,255,0.35)'
    ctx.lineWidth = 1
    roundRect(ctx, 6, 6, hudW, hudH, 8)
    ctx.fill()
    ctx.stroke()

    // Draw tetris solid
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (gridRef.current[y][x] === 'tetris-solid') {
          drawCell(ctx, x, y, 'rgba(0,229,255,0.9)')
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
      drawCell(ctx, s.x, s.y, i === 0 ? '#00ff9c' : 'rgba(0,255,156,0.7)')
    }

    // Draw apple
    if (appleRef.current) {
      drawCell(ctx, appleRef.current.x, appleRef.current.y, '#ff2bd6')
    }

    // HUD
    const total = tetrisScoreRef.current + snakeScoreRef.current
    ctx.fillStyle = '#cfe7ff'
    ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    // Add subtle glow
    ctx.shadowColor = 'rgba(0,229,255,0.6)'
    ctx.shadowBlur = 6
    ctx.fillText(`Tetris: ${tetrisScoreRef.current}`, 14, 14)
    ctx.fillText(`Snake: ${snakeScoreRef.current}`, 14, 34)
    ctx.fillText(`Total: ${total}`, 14, 54)
    ctx.shadowBlur = 0

    if (gameOver) {
      // Use logicalW/logicalH since we set a DPR transform earlier
      const dprLogicalW = COLS * CELL
      const dprLogicalH = ROWS * CELL
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, dprLogicalW, dprLogicalH)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText('Game Over', dprLogicalW / 2, dprLogicalH / 2 - 20)
      ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial'
      ctx.fillText(gameOver, dprLogicalW / 2, dprLogicalH / 2 + 6)
      ctx.fillText('Press R to restart', dprLogicalW / 2, dprLogicalH / 2 + 28)
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
    <div className={"container" + (flashActive ? " flash" : "") }>
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
          <div className="card highscores">
            <h2>High Scores</h2>
            <ol>
              {highScores.slice(0,10).map((h, i) => (
                <li key={i}><span className="rank">{i+1}.</span> <span className="name">{h.name}</span> <span className="dots" /> <span className="score">{h.score}</span></li>
              ))}
              {highScores.length === 0 && <li>No scores yet</li>}
            </ol>
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
  ctx.save()
  // Outer neon glow
  ctx.shadowColor = color
  ctx.shadowBlur = 18
  ctx.fillStyle = color
  roundRect(ctx, px + 2, py + 2, CELL - 4, CELL - 4, r)
  ctx.fill()
  // Inner highlight stroke
  ctx.shadowBlur = 0
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  roundRect(ctx, px + 2, py + 2, CELL - 4, CELL - 4, r)
  ctx.stroke()
  ctx.restore()
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

// High score helpers
function loadHighScoresFromCookie(): { name: string; score: number; date: number }[] | null {
  const match = document.cookie.split('; ').find((row) => row.startsWith('coop_highscores='))
  if (!match) return null
  try {
    const value = decodeURIComponent(match.split('=')[1])
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return null
}

function saveHighScoresToCookie(scores: { name: string; score: number; date: number }[]) {
  const value = encodeURIComponent(JSON.stringify(scores.slice(0,10)))
  const expires = new Date(Date.now() + 1000*60*60*24*365*5).toUTCString()
  document.cookie = `coop_highscores=${value}; expires=${expires}; path=/; SameSite=Lax`
}

function maybeInsertHighScore(current: { name: string; score: number; date: number }[], score: number) {
  const sorted = [...current].sort((a,b) => b.score - a.score)
  const qualifies = sorted.length < 10 || score > (sorted[sorted.length - 1]?.score ?? -Infinity)
  if (!qualifies) return null
  const name = prompt('New High Score! Enter your name:')?.trim() || 'PLAYER'
  const updated = [...sorted, { name, score, date: Date.now() }].sort((a,b) => b.score - a.score).slice(0,10)
  saveHighScoresToCookie(updated)
  return updated
}
