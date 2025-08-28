// Game canvas and context
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// High-DPI canvas setup
const devicePixelRatio = window.devicePixelRatio || 1;
canvas.width = 800 * devicePixelRatio;
canvas.height = 600 * devicePixelRatio;
canvas.style.width = "800px";
canvas.style.height = "600px";
ctx.scale(devicePixelRatio, devicePixelRatio);

// Game dimensions (in CSS pixels)
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Enemy spawn rules (balanced)
const TRAIN_SIZE = 3; // cars in a train
const TRAIN_SPACING = 100; // px between cars
const MIN_GAP = 220; // min gap from spawn edge to trailing enemy
const BASE_SPAWN_INTERVAL_MS = [1700, 2600]; // slower spawning
const GROUP_CHANCE = 0.25; // 25% trains, 75% singles
const MAX_ACTIVE_PER_LANE = 2; // hard cap per lane
const GLOBAL_MAX_ENEMIES = 10; // overall cap
// lane traffic multipliers ( >1 = quieter lane, spawns less often )
const LANE_TRAFFIC_MULTIPLIER = [1.6, 1.0, 1.4, 1.0, 1.6, 1.2];

// Tunable game variables - 6 strict lanes like Frogger
const LANES = [
  120, // Lane 1 (top)
  180, // Lane 2
  240, // Lane 3
  300, // Lane 4
  360, // Lane 5
  420, // Lane 6 (bottom, above rabbit)
];
const SPEED_RANGES = {
  wolf: [2.0, 3.5],
  fox: [2.5, 4.0],
};
const SPRITE_SIZES = {
  wolf: 75, // Increased size
  fox: 70, // Increased size
  rabbit: 64,
};
const ENEMY_COUNT = 12; // 2 enemies per lane
const OFFSCREEN_MARGIN = 100;
const LANE_SPACING = 80; // Increased spacing for larger sprites

// Game stats
const GAME_STATS = {
  LIVES: 3,
  CARROT_BONUS: 100,
};

// Animation timers
let animationTimer = 0;

// Rabbit properties
const rabbit = {
  x: GAME_WIDTH / 2,
  y: GAME_HEIGHT - 80,
  width: SPRITE_SIZES.rabbit,
  height: SPRITE_SIZES.rabbit * 0.8, // Approximate aspect ratio
  collisionRadius: SPRITE_SIZES.rabbit * 0.4, // 40% of sprite width for circular collision
  speed: 5,
  color: "#8B4513",
  sprite: null,
  hopOffset: 0, // For hop animation
  isMoving: false,
};

// Carrot properties
const carrot = {
  x: GAME_WIDTH / 2,
  y: 60, // Moved higher for goal feeling
  width: 30,
  height: 40,
  color: "#FF8C00",
  leafColor: "#228B22",
  sprite: null,
  pulseScale: 1.0, // For pulse animation
  pulseDirection: 1,
};

// New enemy movement constants
const MIN_ENEMY_GAP = 150; // Minimum distance between enemies in same lane
const MAX_ENEMY_GAP = 300; // Maximum distance between enemies in same lane
const RESPAWN_BUFFER = 100; // Extra distance beyond screen edge for respawn
const SPEED_VARIATION = 0.0; // No speed variation within lanes - all enemies in same lane have same speed

// Lane management system
class LaneManager {
  constructor() {
    this.lanes = new Map();
    this.initializeLanes();
  }

  initializeLanes() {
    LANES.forEach((laneY, i) => {
      const type = i % 2 === 0 ? "wolf" : "fox";
      const direction = i % 2 === 0 ? 1 : -1;
      const [minS, maxS] = SPEED_RANGES[type];
      const speed = randBetween(minS, maxS); // constant per lane
      this.lanes.set(laneY, {
        y: laneY,
        type,
        direction,
        speed,
        enemies: [],
        lastSpawnAt: 0,
        nextSpawnDelay:
          randBetween(BASE_SPAWN_INTERVAL_MS[0], BASE_SPAWN_INTERVAL_MS[1]) *
          (LANE_TRAFFIC_MULTIPLIER[i] || 1),
        maxActive: MAX_ACTIVE_PER_LANE,
        trafficMult: LANE_TRAFFIC_MULTIPLIER[i] || 1,
      });
    });
  }

  addEnemy(e) {
    const lane = this.lanes.get(e.laneY);
    if (!lane) return;
    lane.enemies.push(e);
    // Keep order along travel direction (front first)
    lane.enemies.sort((a, b) => (lane.direction > 0 ? b.x - a.x : a.x - b.x));
  }

  removeEnemy(e) {
    const lane = this.lanes.get(e.laneY);
    if (!lane) return;
    const idx = lane.enemies.indexOf(e);
    if (idx >= 0) lane.enemies.splice(idx, 1);
  }

  updateSpawns(nowMs) {
    this.lanes.forEach((lane, idx) => {
      // Respect per-lane and global caps
      if (lane.enemies.length >= lane.maxActive) return;
      if (enemies.length >= GLOBAL_MAX_ENEMIES) return;

      if (nowMs - lane.lastSpawnAt < lane.nextSpawnDelay) return;

      // Check gap from spawn edge to the trailing enemy
      const spawnEdgeX =
        lane.direction > 0 ? -OFFSCREEN_MARGIN : GAME_WIDTH + OFFSCREEN_MARGIN;
      let trailing = null;
      if (lane.enemies.length) {
        trailing = lane.enemies.reduce((best, cur) => {
          if (!best) return cur;
          return lane.direction > 0
            ? cur.x < best.x
              ? cur
              : best
            : cur.x > best.x
            ? cur
            : best;
        }, null);
      }
      if (trailing) {
        const dist =
          lane.direction > 0
            ? Math.abs(trailing.x - -OFFSCREEN_MARGIN)
            : Math.abs(GAME_WIDTH + OFFSCREEN_MARGIN - trailing.x);
        if (dist < MIN_GAP) return;
      }

      const isTrain = Math.random() < GROUP_CHANCE;
      const count = Math.min(
        isTrain ? TRAIN_SIZE : 1,
        lane.maxActive - lane.enemies.length,
        GLOBAL_MAX_ENEMIES - enemies.length
      );

      for (let i = 0; i < count; i++) {
        const x =
          lane.direction > 0
            ? spawnEdgeX - i * TRAIN_SPACING
            : spawnEdgeX + i * TRAIN_SPACING;

        const enemy = new Enemy(
          lane.type,
          lane.y,
          x,
          lane.speed,
          lane.direction,
          lane.speed
        );
        if (lane.type === "wolf" && window.wolfSprite)
          enemy.sprite = window.wolfSprite;
        if (lane.type === "fox" && window.foxSprite)
          enemy.sprite = window.foxSprite;

        enemies.push(enemy);
        this.addEnemy(enemy);
      }

      lane.lastSpawnAt = nowMs;
      // New randomized delay, multiplied for quieter lanes; add small extra cooldown after a train
      const baseDelay = randBetween(
        BASE_SPAWN_INTERVAL_MS[0],
        BASE_SPAWN_INTERVAL_MS[1]
      );
      lane.nextSpawnDelay =
        baseDelay * lane.trafficMult + (count > 1 ? 500 : 0);
    });
  }
}

// Global lane manager
let laneManager = new LaneManager();

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Enemy class with improved movement
class Enemy {
  constructor(type, laneY, x, speed, direction, baseSpeed) {
    this.type = type;
    this.laneY = laneY;
    this.x = x;
    this.y = laneY;
    this.speed = speed;
    this.baseSpeed = baseSpeed;
    this.direction = direction;
    this.sprite = null;
    this.width = SPRITE_SIZES[type];
    this.height = SPRITE_SIZES[type] * 0.8;
    this.hitboxWidth = this.width * 0.8;
    this.hitboxHeight = this.height * 0.8;
    this.isActive = true;
  }

  // In Enemy class
  update() {
    if (!this.isActive) return;
    this.x += this.speed * this.direction;
    if (this.direction > 0 && this.x > GAME_WIDTH + OFFSCREEN_MARGIN)
      this.deactivate();
    if (this.direction < 0 && this.x < -OFFSCREEN_MARGIN) this.deactivate();
  }
  deactivate() {
    this.isActive = false;
    laneManager.removeEnemy(this);
  }

  deactivate() {
    this.isActive = false;
    laneManager.removeEnemy(this);
  }

  draw() {
    if (!this.isActive) return;

    if (this.sprite && this.sprite.complete) {
      // Draw drop shadow
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#000";
      ctx.fillRect(
        this.x - this.width / 2 + 2,
        this.y + this.height / 2,
        this.width,
        8
      );
      ctx.restore();

      // Draw sprite
      ctx.drawImage(
        this.sprite,
        this.x - this.width / 2,
        this.y - this.height / 2,
        this.width,
        this.height
      );
    } else {
      // Fallback drawing if sprite failed to load
      this.drawFallback();
    }
  }

  drawFallback() {
    // Draw drop shadow
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.fillRect(
      this.x - this.width / 2 + 2,
      this.y + this.height / 2,
      this.width,
      8
    );
    ctx.restore();

    // Draw cute cartoon fallback
    if (this.type === "wolf") {
      // Wolf fallback: rounded body with pointy ears
      ctx.fillStyle = "#8B0000";
      ctx.beginPath();
      // Use regular rect instead of roundRect for better browser compatibility
      ctx.rect(
        this.x - this.width / 2,
        this.y - this.height / 2,
        this.width,
        this.height
      );
      ctx.fill();

      // Ears
      ctx.fillStyle = "#660000";
      ctx.beginPath();
      ctx.moveTo(this.x - this.width / 3, this.y - this.height / 2);
      ctx.lineTo(this.x - this.width / 4, this.y - this.height / 2 - 15);
      ctx.lineTo(this.x - this.width / 6, this.y - this.height / 2);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(this.x + this.width / 3, this.y - this.height / 2);
      ctx.lineTo(this.x + this.width / 4, this.y - this.height / 2 - 15);
      ctx.lineTo(this.x + this.width / 6, this.y - this.height / 2);
      ctx.closePath();
      ctx.fill();

      // Eyes
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(this.x - 8, this.y - 5, 3, 0, 2 * Math.PI);
      ctx.arc(this.x + 8, this.y - 5, 3, 0, 2 * Math.PI);
      ctx.fill();

      // Nose
      ctx.fillStyle = "#FF69B4";
      ctx.beginPath();
      ctx.arc(this.x, this.y + 2, 2, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      // Fox fallback: rounded body with bushy tail
      ctx.fillStyle = "#A0522D";
      ctx.beginPath();
      // Use regular rect instead of roundRect for better browser compatibility
      ctx.rect(
        this.x - this.width / 2,
        this.y - this.height / 2,
        this.width,
        this.height
      );
      ctx.fill();

      // Tail
      ctx.fillStyle = "#8B4513";
      ctx.beginPath();
      ctx.arc(this.x + this.width / 2 + 8, this.y, 12, 0, 2 * Math.PI);
      ctx.fill();

      // Ears
      ctx.fillStyle = "#8B4513";
      ctx.beginPath();
      ctx.arc(
        this.x - this.width / 3,
        this.y - this.height / 2 - 5,
        8,
        0,
        2 * Math.PI
      );
      ctx.arc(
        this.x + this.width / 3,
        this.y - this.height / 2 - 5,
        8,
        0,
        2 * Math.PI
      );
      ctx.fill();

      // Eyes
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(this.x - 6, this.y - 3, 2, 0, 2 * Math.PI);
      ctx.arc(this.x + 6, this.y - 3, 2, 0, 2 * Math.PI);
      ctx.fill();

      // Nose
      ctx.fillStyle = "#FF69B4";
      ctx.beginPath();
      ctx.arc(this.x, this.y + 1, 1.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  getHitbox() {
    return {
      x: this.x,
      y: this.y,
      width: this.hitboxWidth,
      height: this.hitboxHeight,
    };
  }
}

// Enemy array
let enemies = [];

// Game state
let gameState = {
  phase: "intro", // 'intro' | 'playing' | 'paused' | 'gameover'
  hasWon: false,
  hasLost: false,
  gameOver: false,
  winMessageTimer: 0,
  loseMessageTimer: 0,
  grassPattern: null,
  assetsLoaded: false,
  assetsToLoad: 0,
  assetsLoadedCount: 0,
  lives: GAME_STATS.LIVES,
  score: 0,
  gameTime: 0, // New game time
};

// Input handling
const keys = {};

// Event listeners for keyboard input
document.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  // Prevent page scrolling with arrow keys
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
  ) {
    e.preventDefault();
  }

  // Handle intro modal - Enter or Space to start game
  if (gameState.phase === "intro" && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    startGame();
  }

  // Handle restart on game over
  if (gameState.gameOver && e.key === "Enter") {
    restartGame();
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

// Focus canvas on load for immediate keyboard input
window.addEventListener("load", () => {
  // Focus the start button for accessibility
  const startButton = document.getElementById("startButton");
  if (startButton) {
    startButton.focus();
  }

  // Add click event listener for start button
  startButton.addEventListener("click", startGame);
});

// Asset loading
function loadAssets() {
  const assetPaths = {
    wolf: "assets/wolf.png",
    fox: "assets/fox.png",
    rabbit: "assets/rabbit.png",
    carrot: "assets/carrot.png",
    heart: "assets/heart.png",
  };

  gameState.assetsToLoad = Object.keys(assetPaths).length;
  gameState.assetsLoadedCount = 0;

  const done = () => {
    gameState.assetsLoadedCount++;
    if (gameState.assetsLoadedCount === gameState.assetsToLoad) {
      gameState.assetsLoaded = true;
      initializeEnemies(); // wolves/foxes use their sprites now
    }
  };

  Object.entries(assetPaths).forEach(([type, path]) => {
    const img = new Image();
    img.onload = async () => {
      // Ensure dimensions are ready
      try {
        if (img.decode) await img.decode();
      } catch (_) {}
      switch (type) {
        case "wolf":
          window.wolfSprite = img;
          break;
        case "fox":
          window.foxSprite = img;
          break;
        case "rabbit":
          window.rabbitSprite = img;
          rabbit.sprite = img; // <-- critical
          // keep width from SPRITE_SIZES, compute height by aspect
          if (img.naturalWidth && img.naturalHeight) {
            rabbit.height =
              rabbit.width * (img.naturalHeight / img.naturalWidth);
            rabbit.collisionRadius = rabbit.width * 0.4;
          }
          break;
        case "carrot":
          window.carrotSprite = img;
          carrot.sprite = img; // <-- critical
          // keep your chosen visual size; or fit sprite aspect:
          if (img.naturalWidth && img.naturalHeight) {
            const desiredW = 40; // tweak if you want
            carrot.width = desiredW;
            carrot.height = desiredW * (img.naturalHeight / img.naturalWidth);
          }
          break;
        case "heart":
          window.heartSprite = img;
          break;
      }
      done();
    };
    img.onerror = () => {
      console.warn(`Failed to load ${path}; using fallback for ${type}`);
      done();
    };
    img.src = path;
  });
}

// Game functions
function createGrassPattern() {
  // Create an off-screen canvas for the grass pattern
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = GAME_WIDTH;
  patternCanvas.height = GAME_HEIGHT;
  const patternCtx = patternCanvas.getContext("2d");

  // Create a grass-like pattern
  patternCtx.fillStyle = "#90EE90";
  patternCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Add some grass texture
  patternCtx.fillStyle = "#228B22";
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * GAME_WIDTH;
    const y = Math.random() * GAME_HEIGHT;
    const height = Math.random() * 3 + 1;
    patternCtx.fillRect(x, y, 1, height);
  }

  return patternCanvas;
}

function drawGrassBackground() {
  // Use the pre-generated grass pattern
  if (!gameState.grassPattern) {
    gameState.grassPattern = createGrassPattern();
  }
  ctx.drawImage(gameState.grassPattern, 0, 0);
}

function drawLanes() {
  // Draw alternating lane colors
  const laneColors = ["#A8E6CF", "#8FBC8F"]; // Light green, darker green

  LANES.forEach((laneY, index) => {
    const color = laneColors[index % 2];
    ctx.fillStyle = color;
    ctx.fillRect(0, laneY - 30, GAME_WIDTH, 60); // 60px tall lanes
  });
}

function drawUI() {
  // Draw hearts
  if (window.heartSprite && window.heartSprite.complete) {
    for (let i = 0; i < gameState.lives; i++) {
      ctx.drawImage(window.heartSprite, 20 + i * 35, 20, 30, 30);
    }
  } else {
    // Fallback hearts
    ctx.fillStyle = "#FF6B6B";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    for (let i = 0; i < gameState.lives; i++) {
      ctx.fillText("♥", 20 + i * 30, 20);
    }
  }

  // Draw score with playful font and outline
  ctx.fillStyle = "#FFD700";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.font = "bold 32px 'Fredoka One', Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  const scoreText = `Score: ${gameState.score}`;
  const scoreX = GAME_WIDTH - 20;
  const scoreY = 20;

  // Draw outline
  ctx.strokeText(scoreText, scoreX, scoreY);
  // Draw fill
  ctx.fillText(scoreText, scoreX, scoreY);
}

function drawCarrot() {
  if (carrot.sprite && carrot.sprite.complete) {
    // Draw drop shadow
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.fillRect(
      carrot.x - carrot.width / 2 + 2,
      carrot.y + carrot.height / 2,
      carrot.width,
      8
    );
    ctx.restore();

    // Draw carrot with pulse animation
    ctx.save();
    ctx.translate(carrot.x, carrot.y);
    ctx.scale(carrot.pulseScale, carrot.pulseScale);
    ctx.drawImage(
      carrot.sprite,
      -carrot.width / 2,
      -carrot.height / 2,
      carrot.width,
      carrot.height
    );
    ctx.restore();
  } else {
    // Fallback carrot drawing
    // Carrot body (triangle)
    ctx.fillStyle = carrot.color;
    ctx.beginPath();
    ctx.moveTo(carrot.x, carrot.y + carrot.height);
    ctx.lineTo(carrot.x - carrot.width / 2, carrot.y);
    ctx.lineTo(carrot.x + carrot.width / 2, carrot.y);
    ctx.closePath();
    ctx.fill();

    // Carrot leaves
    ctx.fillStyle = carrot.leafColor;
    ctx.fillRect(carrot.x - 3, carrot.y - 8, 6, 8);
    ctx.fillRect(carrot.x - 6, carrot.y - 12, 4, 6);
    ctx.fillRect(carrot.x + 2, carrot.y - 10, 4, 6);
  }
}

function drawEnemies() {
  enemies.forEach((enemy) => {
    enemy.draw();
  });
}

function drawRabbit() {
  // Calculate hop animation
  const hopY = rabbit.y + rabbit.hopOffset;

  if (rabbit.sprite && rabbit.sprite.complete) {
    // Draw drop shadow (ellipse)
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(
      rabbit.x,
      hopY + rabbit.height / 2 + 4,
      rabbit.width / 2,
      6,
      0,
      0,
      2 * Math.PI
    );
    ctx.fill();
    ctx.restore();

    // Draw rabbit sprite
    ctx.drawImage(
      rabbit.sprite,
      rabbit.x - rabbit.width / 2,
      hopY - rabbit.height / 2,
      rabbit.width,
      rabbit.height
    );
  } else {
    // Fallback: draw original oval rabbit
    // Draw drop shadow
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(
      rabbit.x,
      hopY + rabbit.height / 2 + 4,
      rabbit.width / 2,
      6,
      0,
      0,
      2 * Math.PI
    );
    ctx.fill();
    ctx.restore();

    // Rabbit body (oval)
    ctx.fillStyle = rabbit.color;
    ctx.beginPath();
    ctx.ellipse(
      rabbit.x,
      hopY,
      rabbit.width / 2,
      rabbit.height / 2,
      0,
      0,
      2 * Math.PI
    );
    ctx.fill();

    // Rabbit ears
    ctx.fillStyle = "#A0522D";
    ctx.fillRect(rabbit.x - 8, hopY - 25, 6, 20);
    ctx.fillRect(rabbit.x + 2, hopY - 25, 6, 20);

    // Rabbit eyes
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(rabbit.x - 8, hopY - 5, 2, 0, 2 * Math.PI);
    ctx.arc(rabbit.x + 8, hopY - 5, 2, 0, 2 * Math.PI);
    ctx.fill();

    // Rabbit nose
    ctx.fillStyle = "#FF69B4";
    ctx.beginPath();
    ctx.arc(rabbit.x, hopY + 2, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// Collision detection functions
function checkCircleRectCollision(
  circleX,
  circleY,
  circleRadius,
  rectX,
  rectY,
  rectWidth,
  rectHeight
) {
  const closestX = Math.max(
    rectX - rectWidth / 2,
    Math.min(circleX, rectX + rectWidth / 2)
  );
  const closestY = Math.max(
    rectY - rectHeight / 2,
    Math.min(circleY, rectY + rectHeight / 2)
  );

  const distanceX = circleX - closestX;
  const distanceY = circleY - closestY;

  return (
    distanceX * distanceX + distanceY * distanceY < circleRadius * circleRadius
  );
}

function checkCircleCircleCollision(x1, y1, r1, x2, y2, r2) {
  const distanceX = x1 - x2;
  const distanceY = y1 - y2;
  const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
  return distance < r1 + r2;
}

function resetRabbit() {
  rabbit.x = GAME_WIDTH / 2;
  rabbit.y = GAME_HEIGHT - 80;
  rabbit.hopOffset = 0;
  rabbit.isMoving = false;
}

function startGame() {
  // Hide the modal
  const modal = document.getElementById("introModal");
  if (modal) {
    modal.classList.remove("open");
  }

  // Set game phase to playing
  gameState.phase = "playing";

  // Focus the canvas for immediate keyboard control
  canvas.focus();
}

function restartGame() {
  gameState.phase = "intro"; // Reset to intro phase
  gameState.lives = GAME_STATS.LIVES;
  gameState.score = 0;
  gameState.hasWon = false;
  gameState.hasLost = false;
  gameState.gameOver = false;
  gameState.winMessageTimer = 0;
  gameState.loseMessageTimer = 0;
  gameState.gameTime = 0;
  resetRabbit();
  laneManager = new LaneManager(); // Reset lane manager
  enemies = []; // Clear existing enemies
  initializeEnemies(); // Re-initialize enemies with new manager

  // Show the modal again
  const modal = document.getElementById("introModal");
  if (modal) {
    modal.classList.add("open");
    // Focus the start button
    const startButton = document.getElementById("startButton");
    if (startButton) {
      startButton.focus();
    }
  }
}

function initializeEnemies() {
  enemies = [];
  laneManager = new LaneManager();
  // no instant flood; first spawns come after initial delays
}

function showWinMessage() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("You got the carrot!", GAME_WIDTH / 2, GAME_HEIGHT / 2);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "24px Arial";
  ctx.fillText("Great job!", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);
}

function showLoseMessage(enemyType) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = "#FF6B6B";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Caught by the ${enemyType}!`, GAME_WIDTH / 2, GAME_HEIGHT / 2);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "24px Arial";
  ctx.fillText("Try again!", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);
}

function showGameOverMessage() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = "#FF6B6B";
  ctx.font = "bold 64px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GAME OVER", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "28px Arial";
  ctx.fillText(
    `Final Score: ${gameState.score}`,
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2 + 20
  );

  ctx.fillStyle = "#FFD700";
  ctx.font = "24px Arial";
  ctx.fillText("Press Enter to Restart", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80);
}

function updateAnimations() {
  animationTimer++;

  // Update rabbit hop animation (only when in playing phase and moving)
  if (gameState.phase === "playing" && rabbit.isMoving) {
    rabbit.hopOffset = Math.sin(animationTimer * 0.3) * 3; // Small hop while moving
  } else {
    rabbit.hopOffset = 0; // No hop when stationary or not playing
  }

  // Update carrot pulse animation (always run for visual appeal)
  carrot.pulseScale += 0.005 * carrot.pulseDirection;
  if (carrot.pulseScale >= 1.1) {
    carrot.pulseDirection = -1;
  } else if (carrot.pulseScale <= 0.9) {
    carrot.pulseDirection = 1;
  }
}

function updateEnemies() {
  // Only advance game time and update enemies when playing
  if (gameState.phase === "playing") {
    gameState.gameTime += 16; // ~60fps
    enemies.forEach((e) => e.update());
    laneManager.updateSpawns(gameState.gameTime);
    enemies = enemies.filter((e) => e.isActive);
  }
}

function separateLaneMates() {
  const GAP = MIN_SPAWN_GAP * 0.9;
  // For each lane, ensure trailing enemy doesn’t sit on top of leader
  LANES.forEach((laneY) => {
    const mates = enemies.filter((e) => e.laneY === laneY);
    mates.sort((a, b) => a.x - b.x); // left→right
    for (let i = 1; i < mates.length; i++) {
      const prev = mates[i - 1],
        cur = mates[i];
      if (cur.direction !== prev.direction) continue;
      const dist = Math.abs(cur.x - prev.x);
      if (dist < GAP) {
        // Nudge trailing one back slightly
        cur.x += cur.direction > 0 ? -2 : 2;
        // Or: cur.speed = Math.min(cur.speed, prev.speed);
      }
    }
  });
}

function updateRabbit() {
  // Don't update rabbit position if game is won, lost, over, or not in playing phase
  if (
    gameState.hasWon ||
    gameState.hasLost ||
    gameState.gameOver ||
    gameState.phase !== "playing"
  )
    return;

  // Check if rabbit is moving
  const wasMoving = rabbit.isMoving;
  rabbit.isMoving = false;

  // Handle movement
  if (keys["ArrowUp"] || keys["w"]) {
    rabbit.y = Math.max(rabbit.collisionRadius, rabbit.y - rabbit.speed);
    rabbit.isMoving = true;
  }
  if (keys["ArrowDown"] || keys["s"]) {
    rabbit.y = Math.min(
      GAME_HEIGHT - rabbit.collisionRadius,
      rabbit.y + rabbit.speed
    );
    rabbit.isMoving = true;
  }
  if (keys["ArrowLeft"] || keys["a"]) {
    rabbit.x = Math.max(rabbit.collisionRadius, rabbit.x - rabbit.speed);
    rabbit.isMoving = true;
  }
  if (keys["ArrowRight"] || keys["d"]) {
    rabbit.x = Math.min(
      GAME_WIDTH - rabbit.collisionRadius,
      rabbit.x + rabbit.speed
    );
    rabbit.isMoving = true;
  }

  // Check for collision with carrot (circle vs AABB)
  const carrotLeft = carrot.x - carrot.width / 2;
  const carrotRight = carrot.x + carrot.width / 2;
  const carrotTop = carrot.y;
  const carrotBottom = carrot.y + carrot.height;

  if (
    checkCircleRectCollision(
      rabbit.x,
      rabbit.y,
      rabbit.collisionRadius,
      carrot.x,
      carrot.y + carrot.height / 2,
      carrot.width,
      carrot.height
    )
  ) {
    gameState.hasWon = true;
    gameState.winMessageTimer = 120; // 2 seconds at 60fps
    gameState.score += GAME_STATS.CARROT_BONUS; // Add bonus score
  }

  // Check for collision with enemies (circle vs rect)
  enemies.forEach((enemy) => {
    if (!enemy.isActive) return;

    const enemyHitbox = enemy.getHitbox();
    if (
      checkCircleRectCollision(
        rabbit.x,
        rabbit.y,
        rabbit.collisionRadius,
        enemyHitbox.x,
        enemyHitbox.y,
        enemyHitbox.width,
        enemyHitbox.height
      )
    ) {
      gameState.lives--;
      if (gameState.lives <= 0) {
        gameState.gameOver = true;
      } else {
        gameState.hasLost = true;
        gameState.loseMessageTimer = 90; // 1.5 seconds at 60fps
      }
      gameState.collidingEnemyType =
        enemy.type.charAt(0).toUpperCase() + enemy.type.slice(1);
    }
  });
}

function updateGameState() {
  // Only update game state when playing
  if (gameState.phase !== "playing") return;

  if (gameState.hasWon && gameState.winMessageTimer > 0) {
    gameState.winMessageTimer--;
    if (gameState.winMessageTimer === 0) {
      // Reset game state
      gameState.hasWon = false;
      resetRabbit();
    }
  }

  if (gameState.hasLost && gameState.loseMessageTimer > 0) {
    gameState.loseMessageTimer--;
    if (gameState.loseMessageTimer === 0) {
      // Reset game state
      gameState.hasLost = false;
      resetRabbit();
    }
  }

  // Set game over phase when lives are depleted
  if (gameState.gameOver) {
    gameState.phase = "gameover";
  }
}

function gameLoop() {
  // Don't start game loop until assets are loaded
  if (!gameState.assetsLoaded) {
    requestAnimationFrame(gameLoop);
    return;
  }

  // Clear canvas
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Draw background
  drawGrassBackground();

  // Draw lane separators
  drawLanes();

  // Draw game objects
  drawCarrot();
  drawEnemies();
  drawRabbit();

  // Draw UI
  drawUI();

  // Update animations (always run for visual appeal)
  updateAnimations();

  // Only update game logic when in playing phase
  if (gameState.phase === "playing") {
    updateEnemies();
    updateRabbit();
    updateGameState();
  }

  // Show messages based on game state
  if (gameState.gameOver) {
    showGameOverMessage();
  } else if (gameState.hasWon) {
    showWinMessage();
  } else if (gameState.hasLost) {
    showLoseMessage(gameState.collidingEnemyType);
  }

  // Continue the game loop
  requestAnimationFrame(gameLoop);
}

// Start asset loading and game
loadAssets();
gameLoop();
