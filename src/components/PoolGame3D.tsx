"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  GameState,
  createInitialGameState,
  stepPhysics,
  calculateAimTrajectory,
  finalizeShotRules,
  getBallColor,
  getGroup,
  countGroupBalls,
  isCueBallOverlapping,
  findValidCueBallPosition,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  BALL_RADIUS,
  POCKETS,
  CUE_START,
  BALL_SPRITE_GRID,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  PLAY_BOTTOM,
  BallState,
  PoolRuleEngine,
  calculateBestAIShot,
  AIDifficulty,
} from "../lib/poolPhysics";
import { soundEngine } from "../lib/audio";
import { BALL_THEMES, BallThemeId, renderCustomBallSprite } from "../lib/customBallRenderer";
import {
  Volume2,
  VolumeX,
  RotateCcw,
  HelpCircle,
  Palette,
  Trophy,
  Shield,
  Disc,
  Target,
  Sliders,
  Zap,
  Lock,
  Flag,
  Hand,
  User,
  Play,
  Users,
  Bot,
  Home as HomeIcon,
  Sparkles,
} from "lucide-react";
import confetti from "canvas-confetti";

const CUE_DESIGNS = [
  { id: "standard", name: "Classic Mahogany", shaftColor: "#f1f5f9", gripColor: "#331800", ringColor: "#d97706" },
  { id: "inferno", name: "Dragon Flame", shaftColor: "#fee2e2", gripColor: "#7f1d1d", ringColor: "#fbbf24" },
  { id: "cyber", name: "Cyber Neon", shaftColor: "#cff4fc", gripColor: "#083344", ringColor: "#38bdf8" },
  { id: "gold", name: "Royal Gold", shaftColor: "#fef9c3", gripColor: "#422006", ringColor: "#ffffff" },
];

const TURN_TIME_LIMIT = 30;

function lerpAngle(current: number, target: number, speed: number): number {
  let diff = target - current;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return current + diff * speed;
}

// Crop transparent padding around image to get tight bounds
function cropImageSprite(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imgData.data;

  let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
  let found = false;

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const alpha = data[(y * img.width + x) * 4 + 3];
      if (alpha > 15) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return canvas;

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  const croppedCtx = croppedCanvas.getContext("2d");
  if (croppedCtx) {
    croppedCtx.drawImage(
      canvas,
      minX, minY, cropWidth, cropHeight,
      0, 0, cropWidth, cropHeight
    );
  }

  return croppedCanvas;
}

export default function PoolGame3D() {
  // Main Menu / Landing Page State
  const [isPlayingMatch, setIsPlayingMatch] = useState(false);
  const [selectedGameMode, setSelectedGameMode] = useState<"pvp" | "ai" | "practice">("pvp");

  // 3D Parallax Tilt State for Landing Card
  const [cardTilt, setCardTilt] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const homeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState("pvp"));
  const gameRef = useRef<GameState>(gameState);
  gameRef.current = gameState;

  // Aim Angle Interpolation & Ball Lock State
  const targetAimAngleRef = useRef<number>(0);
  const [lockedBallNumber, setLockedBallNumber] = useState<number | null>(null);

  // Ball-in-Hand Dragging State
  const [isDraggingCueBall, setIsDraggingCueBall] = useState(false);

  // Turn Timer State
  const [turnTimer, setTurnTimer] = useState(TURN_TIME_LIMIT);

  // Cue Power & Aim State
  const [power, setPower] = useState(0);
  const powerRef = useRef<number>(0);
  powerRef.current = power;

  const prevIllegalContactRef = useRef<boolean>(false);

  const [isDraggingCue, setIsDraggingCue] = useState(false);
  const [muted, setMuted] = useState(false);
  const [selectedCue, setSelectedCue] = useState(CUE_DESIGNS[0]);
  const [selectedTheme, setSelectedTheme] = useState<BallThemeId>("tournament");

  // Spin / English State (-1.0 to +1.0)
  const [cueSpin, setCueSpin] = useState({ top: 0, side: 0 });

  // Cue Forward Strike Animation State
  const [strikeAnimOffset, setStrikeAnimOffset] = useState<number | null>(null);

  // AI Difficulty State & Modal
  const [selectedAIDifficulty, setSelectedAIDifficulty] = useState<AIDifficulty>("master");
  const [showAIModal, setShowAIModal] = useState(false);
  const isAIExecutingRef = useRef<boolean>(false);

  // Bot Ball-in-Hand Placement Animation Ref
  const botPlacementAnimRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    startTime: number;
    duration: number;
  } | null>(null);

  // Modals
  const [showCueModal, setShowCueModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSpinModal, setShowSpinModal] = useState(false);

  // Vertical Aiming Wheel Dial State
  const [wheelOffset, setWheelOffset] = useState(0);
  const [isDraggingWheelBar, setIsDraggingWheelBar] = useState(false);
  const lastWheelYRef = useRef(0);

  // Pre-processed Offscreen Ball Sprites
  const ballSpritesRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [spritesLoaded, setSpritesLoaded] = useState(false);

  // Cropped Cue Stick Canvas Sprite Ref
  const croppedCueCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cueSpriteReady, setCueSpriteReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = "/assets/cue_stick.png";
    img.onload = () => {
      const cropped = cropImageSprite(img);
      croppedCueCanvasRef.current = cropped;
      setCueSpriteReady(true);
    };
  }, []);

  // Load custom ball designs
  const loadBallSprites = useCallback((themeId: BallThemeId) => {
    const sprites = new Map<number, HTMLCanvasElement>();

    for (let num = 0; num <= 15; num++) {
      const kind = num === 0 ? "cue" : num === 8 ? "eight" : num <= 7 ? "solid" : "stripe";
      const spriteCanvas = renderCustomBallSprite(num, kind, themeId, 128);
      sprites.set(num, spriteCanvas);
    }

    ballSpritesRef.current = sprites;
    setSpritesLoaded(true);
  }, []);

  useEffect(() => {
    loadBallSprites(selectedTheme);
  }, [selectedTheme, loadBallSprites]);

  // Dynamic 3D Rolling Background Animation Loop for Home Landing Screen
  useEffect(() => {
    if (isPlayingMatch) return;

    const canvas = homeCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const balls3D = [
      { num: 0, r: 24, angle: 0, dist: 160, speed: 0.015, z: 0 },
      { num: 8, r: 28, angle: (Math.PI * 2) / 5, dist: 220, speed: -0.012, z: 0 },
      { num: 3, r: 22, angle: (Math.PI * 4) / 5, dist: 180, speed: 0.018, z: 0 },
      { num: 10, r: 22, angle: (Math.PI * 6) / 5, dist: 250, speed: -0.014, z: 0 },
      { num: 1, r: 20, angle: (Math.PI * 8) / 5, dist: 200, speed: 0.016, z: 0 },
    ];

    const render3DHome = () => {
      time += 0.016;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      // Perspective Grid Lines
      ctx.save();
      ctx.strokeStyle = "rgba(34, 197, 94, 0.08)";
      ctx.lineWidth = 1.5;

      for (let x = -w; x < w * 2; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(cx + (x - cx) * 0.2, cy * 0.5);
        ctx.stroke();
      }
      ctx.restore();

      // Render orbiting 3D billiard balls
      balls3D.forEach((b) => {
        b.angle += b.speed;
        const x3d = Math.cos(b.angle) * b.dist;
        const y3d = Math.sin(b.angle) * (b.dist * 0.45); // Perspective compression
        const scale = 1 + (y3d / b.dist) * 0.25;

        const screenX = cx + x3d;
        const screenY = cy + y3d + 20;

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.scale(scale, scale);

        // 3D Drop Shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.beginPath();
        ctx.ellipse(3, b.r + 4, b.r * 0.9, b.r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ball texture sprite
        const sprite = ballSpritesRef.current.get(b.num);
        if (sprite) {
          ctx.rotate(time * b.speed * 10);
          ctx.drawImage(sprite, -b.r, -b.r, b.r * 2, b.r * 2);
        }

        ctx.restore();
      });

      animId = requestAnimationFrame(render3DHome);
    };

    animId = requestAnimationFrame(render3DHome);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlayingMatch, spritesLoaded]);

  // White Ball (Ball #0) 1-Second Rack Removal Effect
  useEffect(() => {
    if (gameState.pocketedHistory.includes(0)) {
      const timer = setTimeout(() => {
        setGameState((prev) => ({
          ...prev,
          pocketedHistory: prev.pocketedHistory.filter((num) => num !== 0),
        }));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.pocketedHistory]);

  // Turn Shot Clock Countdown Timer Effect
  useEffect(() => {
    if (!isPlayingMatch || gameState.gameMode === "practice" || gameState.winner !== null || gameState.moving) {
      setTurnTimer(TURN_TIME_LIMIT);
      return;
    }

    const interval = setInterval(() => {
      setTurnTimer((prev) => {
        const game = gameRef.current;
        if (game.gameMode === "practice") return TURN_TIME_LIMIT;

        if (prev <= 6 && prev > 1) {
          soundEngine.playTimerTick();
        }

        if (prev <= 1) {
          const timedOutPlayer = game.turn;
          const incomingPlayer = timedOutPlayer === 1 ? 2 : 1;

          game.turn = incomingPlayer;
          game.ballInHand = true;
          game.kitchenOnlyBallInHand = false;
          game.message = `⏱️ Time out! Player ${timedOutPlayer} ran out of time. Turn passes to Player ${incomingPlayer} with Ball-in-Hand!`;
          
          soundEngine.playFoul();
          setCueSpin({ top: 0, side: 0 });
          setGameState({ ...game });
          return TURN_TIME_LIMIT;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlayingMatch, gameState.gameMode, gameState.turn, gameState.moving, gameState.winner]);

  // AUTOMATED AI BOT TURN ENGINE EFFECT (UNINTERRUPTIBLE BY USER CLICKS)
  useEffect(() => {
    if (!isPlayingMatch || gameState.winner !== null || gameState.moving || strikeAnimOffset !== null) {
      isAIExecutingRef.current = false;
      return;
    }
    if (gameState.gameMode !== "ai" || gameState.turn !== 2) {
      isAIExecutingRef.current = false;
      return;
    }

    if (isAIExecutingRef.current) return;
    isAIExecutingRef.current = true;

    const timer = setTimeout(() => {
      const game = gameRef.current;
      if (!game.moving && game.turn === 2 && game.winner === null) {
        const aiShot = calculateBestAIShot(game, selectedAIDifficulty);

        if (game.ballInHand) {
          const validPos = findValidCueBallPosition(game, aiShot.cueX, aiShot.cueY);
          const startX = game.balls[0].x;
          const startY = game.balls[0].y;
          const dist = Math.hypot(validPos.x - startX, validPos.y - startY);

          if (dist > 6) {
            const animDuration = Math.min(1200, Math.max(650, dist * 2.2));
            botPlacementAnimRef.current = {
              active: true,
              startX,
              startY,
              targetX: validPos.x,
              targetY: validPos.y,
              startTime: performance.now(),
              duration: animDuration,
            };

            game.message = "Player 2's turn.";
            setGameState({ ...game });

            setTimeout(() => {
              const currentG = gameRef.current;
              if (currentG.turn === 2 && !currentG.moving) {
                targetAimAngleRef.current = aiShot.aimAngle;
                currentG.aimAngle = aiShot.aimAngle;
                currentG.message = "Player 2's turn.";
                setGameState({ ...currentG });

                setTimeout(() => {
                  executeShotWithPower(aiShot.power);
                  isAIExecutingRef.current = false;
                }, 400);
              } else {
                isAIExecutingRef.current = false;
              }
            }, animDuration + 120);
            return;
          } else {
            game.balls[0].x = validPos.x;
            game.balls[0].y = validPos.y;
          }
        }

        targetAimAngleRef.current = aiShot.aimAngle;
        game.aimAngle = aiShot.aimAngle;
        executeShotWithPower(aiShot.power);
      }
      isAIExecutingRef.current = false;
    }, 600);

    return () => {
      // Do NOT cancel timer on state re-renders so user clicks cannot abort the Computer Bot turn!
    };
  }, [isPlayingMatch, gameState.turn, gameState.moving, gameState.gameMode, gameState.winner, selectedAIDifficulty, strikeAnimOffset]);

  // CANVAS POINTER DOWN HANDLER
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cueBall = gameRef.current.balls[0];
    if (cueBall.pocketed || gameRef.current.moving || strikeAnimOffset !== null) return;
    
    // Block human input during Computer Bot's turn (Player 2 in Vs AI mode)
    if (gameRef.current.gameMode === "ai" && gameRef.current.turn === 2) return;

    const canvasX = ((e.clientX - rect.left) / rect.width) * TABLE_WIDTH;
    const canvasY = ((e.clientY - rect.top) / rect.height) * TABLE_HEIGHT;

    // A. BALL-IN-HAND DRAG CHECK
    const distToCue = Math.hypot(canvasX - cueBall.x, canvasY - cueBall.y);
    if (gameRef.current.ballInHand && distToCue <= BALL_RADIUS * 3.5) {
      setIsDraggingCueBall(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      soundEngine.playButtonClick();
      return;
    }

    // B. Check if user clicked directly on any Pocket to Call Pocket
    for (const pocket of POCKETS) {
      const dist = Math.hypot(canvasX - pocket.x, canvasY - pocket.y);
      if (dist <= pocket.radius * 1.8) {
        const game = gameRef.current;
        game.calledPocket[game.turn] = pocket.id;
        game.message = `Player ${game.turn} called Pocket #${pocket.id + 1} for the 8-Ball.`;
        setGameState({ ...game });
        soundEngine.playButtonClick();
        return;
      }
    }

    // C. Check if user clicked directly on any target ball to lock aim!
    for (const ball of gameRef.current.balls) {
      if (ball.number === 0 || ball.pocketed) continue;

      const dist = Math.hypot(canvasX - ball.x, canvasY - ball.y);
      if (dist <= BALL_RADIUS * 2.0) {
        const playerGroup = gameRef.current.groups[gameRef.current.turn];
        const isTableAssigned = gameRef.current.tableState === "assigned";

        if (isTableAssigned && playerGroup !== null) {
          const ballGroup = getGroup(ball.number);
          const isPlayerOn8Ball = countGroupBalls(gameRef.current, playerGroup) === 0;

          if (isPlayerOn8Ball) {
            if (ball.number !== 8) {
              soundEngine.playFoul();
              const game = gameRef.current;
              game.message = `🚫 You are on the 8-Ball! You cannot aim at Ball #${ball.number}.`;
              setGameState({ ...game });
              return;
            }
          } else {
            if (ballGroup !== playerGroup) {
              soundEngine.playFoul();
              const game = gameRef.current;
              game.message = `🚫 Illegal Target! You are ${playerGroup}. You cannot aim at Ball #${ball.number} (${ballGroup}).`;
              setGameState({ ...game });
              return;
            }
          }
        }

        const angle = Math.atan2(ball.y - cueBall.y, ball.x - cueBall.x);
        targetAimAngleRef.current = angle;
        setLockedBallNumber(ball.number);
        soundEngine.playButtonClick();
        return;
      }
    }

    // D. Click empty felt
    const dx = canvasX - cueBall.x;
    const dy = canvasY - cueBall.y;
    targetAimAngleRef.current = Math.atan2(dy, dx);
    setLockedBallNumber(null);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isDraggingCueBall || !gameRef.current.ballInHand) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = ((e.clientX - rect.left) / rect.width) * TABLE_WIDTH;
    const canvasY = ((e.clientY - rect.top) / rect.height) * TABLE_HEIGHT;

    const game = gameRef.current;

    const maxAllowedX = game.kitchenOnlyBallInHand ? CUE_START.x : PLAY_RIGHT - BALL_RADIUS;
    const clampedX = Math.max(PLAY_LEFT + BALL_RADIUS, Math.min(maxAllowedX, canvasX));
    const clampedY = Math.max(PLAY_TOP + BALL_RADIUS, Math.min(PLAY_BOTTOM - BALL_RADIUS, canvasY));

    const cueBall = game.balls[0];
    cueBall.x = clampedX;
    cueBall.y = clampedY;

    setGameState({ ...game });
  };

  const handleCanvasPointerUp = () => {
    if (isDraggingCueBall) {
      setIsDraggingCueBall(false);
      const game = gameRef.current;
      if (game.ballInHand && isCueBallOverlapping(game, game.balls[0].x, game.balls[0].y)) {
        const validPos = findValidCueBallPosition(game, game.balls[0].x, game.balls[0].y);
        game.balls[0].x = validPos.x;
        game.balls[0].y = validPos.y;
        setGameState({ ...game });
      }
    }
  };

  // Vertical Aiming Wheel Dial Pointer Events
  const handleWheelBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingWheelBar(true);
    lastWheelYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleWheelBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingWheelBar) return;

    const dy = e.clientY - lastWheelYRef.current;
    lastWheelYRef.current = e.clientY;

    const deltaRad = (dy * 0.15 * Math.PI) / 180;
    targetAimAngleRef.current += deltaRad;
    setWheelOffset((prev) => (prev + dy) % 24);
  };

  const handleWheelBarPointerUp = () => {
    setIsDraggingWheelBar(false);
  };

  const handleWheelScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    const delta = e.deltaY > 0 ? 1 : -1;
    const deltaRad = (delta * 0.2 * Math.PI) / 180;
    targetAimAngleRef.current += deltaRad;
    setWheelOffset((prev) => (prev + delta * 4) % 24);
  };

  // Interactive Spin Selector Widget Dragging
  const handleSpinPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = rect.width;
    const radius = size / 2;

    const relX = e.clientX - rect.left - radius;
    const relY = e.clientY - rect.top - radius;

    const dist = Math.hypot(relX, relY);
    const maxDist = radius - 8;

    const clampedDist = Math.min(dist, maxDist);
    const angle = Math.atan2(relY, relX);

    const normSide = (Math.cos(angle) * clampedDist) / maxDist;
    const normTop = -(Math.sin(angle) * clampedDist) / maxDist;

    setCueSpin({ top: normTop, side: normSide });
  };

  // Main Canvas Rendering Loop
  useEffect(() => {
    if (!isPlayingMatch) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const game = gameRef.current;

      // Update Bot Placement Animation position if active
      if (botPlacementAnimRef.current && botPlacementAnimRef.current.active) {
        const anim = botPlacementAnimRef.current;
        const elapsed = performance.now() - anim.startTime;
        const progress = Math.min(1.0, elapsed / anim.duration);

        // Cubic ease-in-out curve
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        game.balls[0].x = anim.startX + (anim.targetX - anim.startX) * ease;
        game.balls[0].y = anim.startY + (anim.targetY - anim.startY) * ease;

        if (progress >= 1.0) {
          anim.active = false;
          game.balls[0].x = anim.targetX;
          game.balls[0].y = anim.targetY;
          soundEngine.playButtonClick();
        }
      }

      // Smooth Angular Dampening
      game.aimAngle = lerpAngle(game.aimAngle, targetAimAngleRef.current, 0.12);

      // Physics step
      const isMoving = stepPhysics(game, 12);

      if (game.moving && !isMoving) {
        game.moving = false;
        const previousTurn = game.turn;
        const updatedGame = finalizeShotRules(game);
        setCueSpin({ top: 0, side: 0 });
        setGameState({ ...updatedGame });
        setTurnTimer(TURN_TIME_LIMIT);

        if (updatedGame.winner !== null) {
          soundEngine.playWin();
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        } else if (updatedGame.turn !== previousTurn) {
          soundEngine.playYourTurn();
        }
      }

      ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

      // A. Classic Mahogany Wood Table Frame
      const frameRadius = 20;
      const woodGrad = ctx.createLinearGradient(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      woodGrad.addColorStop(0, "#4a1212");
      woodGrad.addColorStop(0.5, "#3b0c0c");
      woodGrad.addColorStop(1, "#280707");

      ctx.fillStyle = woodGrad;
      ctx.beginPath();
      ctx.roundRect(10, 10, TABLE_WIDTH - 20, TABLE_HEIGHT - 20, frameRadius);
      ctx.fill();

      // Brass Inlaid Trim
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 2;
      ctx.stroke();

      // B. Classic Billiards Green Felt Cloth
      const playRadius = 14;
      const feltLeft = 44;
      const feltTop = 44;
      const feltWidth = TABLE_WIDTH - 88;
      const feltHeight = TABLE_HEIGHT - 88;

      const feltGrad = ctx.createRadialGradient(
        TABLE_WIDTH / 2,
        TABLE_HEIGHT / 2,
        50,
        TABLE_WIDTH / 2,
        TABLE_HEIGHT / 2,
        420
      );
      const isPractice = game.gameMode === "practice";
      if (isPractice) {
        // Midnight Obsidian Black Felt for Solo Practice
        feltGrad.addColorStop(0, "#262626");
        feltGrad.addColorStop(0.55, "#171717");
        feltGrad.addColorStop(0.85, "#0a0a0a");
        feltGrad.addColorStop(1, "#020202");
      } else {
        // Classic Billiards Green Felt
        feltGrad.addColorStop(0, "#16a34a");
        feltGrad.addColorStop(0.55, "#15803d");
        feltGrad.addColorStop(0.85, "#116b34");
        feltGrad.addColorStop(1, "#094721");
      }

      ctx.fillStyle = feltGrad;
      ctx.beginPath();
      ctx.roundRect(feltLeft, feltTop, feltWidth, feltHeight, playRadius);
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 4;
      ctx.stroke();

      // C. Diamond Sight Markers
      const diamondPositions = [
        { x: TABLE_WIDTH * 0.25, y: 24 },
        { x: TABLE_WIDTH * 0.5, y: 24 },
        { x: TABLE_WIDTH * 0.75, y: 24 },
        { x: TABLE_WIDTH * 0.25, y: TABLE_HEIGHT - 24 },
        { x: TABLE_WIDTH * 0.5, y: TABLE_HEIGHT - 24 },
        { x: TABLE_WIDTH * 0.75, y: TABLE_HEIGHT - 24 },
        { x: 24, y: TABLE_HEIGHT * 0.33 },
        { x: 24, y: TABLE_HEIGHT * 0.67 },
        { x: TABLE_WIDTH - 24, y: TABLE_HEIGHT * 0.33 },
        { x: TABLE_WIDTH - 24, y: TABLE_HEIGHT * 0.67 },
      ];

      ctx.fillStyle = "#fef08a";
      diamondPositions.forEach((pos) => {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // D. Baulk Line (Kitchen Line)
      ctx.save();
      ctx.strokeStyle = game.kitchenOnlyBallInHand ? "rgba(250, 204, 21, 0.85)" : "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = game.kitchenOnlyBallInHand ? 2 : 1.5;
      ctx.setLineDash(game.kitchenOnlyBallInHand ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(CUE_START.x, feltTop + 4);
      ctx.lineTo(CUE_START.x, feltTop + feltHeight - 4);
      ctx.stroke();
      ctx.restore();

      // E. Pockets with Brass Rim Finish
      const activeCalledPocket = game.calledPocket[game.turn];
      const playerGroup = game.groups[game.turn];
      const is8BallPhase = playerGroup !== null && countGroupBalls(game, playerGroup) === 0;

      POCKETS.forEach((pocket) => {
        const isCalled = activeCalledPocket === pocket.id;

        const rimGrad = ctx.createRadialGradient(
          pocket.x - 2,
          pocket.y - 2,
          pocket.radius - 4,
          pocket.x,
          pocket.y,
          pocket.radius + 3
        );
        rimGrad.addColorStop(0, isCalled ? "#f59e0b" : "#cbd5e1");
        rimGrad.addColorStop(0.5, isCalled ? "#b45309" : "#475569");
        rimGrad.addColorStop(1, "#0f172a");

        ctx.fillStyle = rimGrad;
        ctx.beginPath();
        ctx.arc(pocket.x, pocket.y, pocket.radius + 3, 0, Math.PI * 2);
        ctx.fill();

        const holeGrad = ctx.createRadialGradient(
          pocket.x,
          pocket.y,
          2,
          pocket.x,
          pocket.y,
          pocket.radius
        );
        holeGrad.addColorStop(0, "#020617");
        holeGrad.addColorStop(0.8, "#090d16");
        holeGrad.addColorStop(1, "#1e293b");

        ctx.fillStyle = holeGrad;
        ctx.beginPath();
        ctx.arc(pocket.x, pocket.y, pocket.radius - 1, 0, Math.PI * 2);
        ctx.fill();

        if (isCalled || is8BallPhase) {
          ctx.save();
          ctx.strokeStyle = isCalled ? "#f59e0b" : "rgba(255, 255, 255, 0.4)";
          ctx.lineWidth = isCalled ? 2.5 : 1.5;
          ctx.setLineDash(isCalled ? [] : [4, 4]);
          ctx.beginPath();
          ctx.arc(pocket.x, pocket.y, pocket.radius + 6, 0, Math.PI * 2);
          ctx.stroke();

          if (isCalled) {
            ctx.fillStyle = "#f59e0b";
            ctx.font = "800 11px var(--font-plus-jakarta), sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`TARGET`, pocket.x, pocket.y > TABLE_HEIGHT / 2 ? pocket.y - pocket.radius - 10 : pocket.y + pocket.radius + 18);
          }
          ctx.restore();
        }
      });

      // F. Aiming Trajectory Guide
      const cueBall = game.balls[0];
      if (!game.moving && game.winner === null && !cueBall.pocketed) {
        const traj = calculateAimTrajectory(game);

        let isIllegalContact = false;
        if (traj.hasCollision && traj.targetBallNumber !== null && game.tableState === "assigned" && playerGroup !== null) {
          const targetGroup = getGroup(traj.targetBallNumber);
          const isPlayerOn8Ball = countGroupBalls(game, playerGroup) === 0;

          if (isPlayerOn8Ball) {
            if (traj.targetBallNumber !== 8) isIllegalContact = true;
          } else {
            if (targetGroup !== playerGroup) isIllegalContact = true;
          }
        }

        ctx.save();
        ctx.strokeStyle = isIllegalContact ? "#ef4444" : "rgba(255, 255, 255, 0.9)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(traj.cueX, traj.cueY);
        ctx.lineTo(traj.ghostX, traj.ghostY);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.strokeStyle = isIllegalContact ? "#ef4444" : "#ffffff";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(traj.ghostX, traj.ghostY, BALL_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        if (traj.hasCollision) {
          if (isIllegalContact) {
            ctx.fillStyle = "#ef4444";
            ctx.font = "800 13px var(--font-plus-jakarta), sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("🚫 FOUL TARGET", traj.ghostX, traj.ghostY - BALL_RADIUS - 8);
          } else {
            ctx.strokeStyle = "#facc15";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(traj.ghostX, traj.ghostY);
            ctx.lineTo(traj.ghostX + traj.targetDirX * 100, traj.ghostY + traj.targetDirY * 100);
            ctx.stroke();

            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 1.8;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(traj.ghostX, traj.ghostY);
            ctx.lineTo(traj.ghostX + traj.cueDeflectX * 70, traj.ghostY + traj.cueDeflectY * 70);
            ctx.stroke();
          }
        }
        ctx.restore();

        // G. High Precision Cue Stick Render
        ctx.save();
        ctx.translate(cueBall.x, cueBall.y);
        ctx.rotate(game.aimAngle);

        const currentPull = strikeAnimOffset !== null ? strikeAnimOffset : power * 140 + 24;
        const cueLength = 360;

        const croppedSprite = croppedCueCanvasRef.current;

        if (croppedSprite) {
          const cueHeight = Math.max(12, (croppedSprite.height / croppedSprite.width) * cueLength);
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(croppedSprite, currentPull, -cueHeight / 2, cueLength, cueHeight);
          ctx.restore();
        } else {
          // Procedural Cue Stick Fallback
          const startX = -currentPull;
          const endX = -currentPull - cueLength;

          const shaftGrad = ctx.createLinearGradient(startX, 0, endX, 0);
          shaftGrad.addColorStop(0, "#38bdf8");
          shaftGrad.addColorStop(0.015, "#ffffff");
          shaftGrad.addColorStop(0.04, selectedCue.shaftColor);
          shaftGrad.addColorStop(0.62, selectedCue.shaftColor);
          shaftGrad.addColorStop(0.66, selectedCue.ringColor);
          shaftGrad.addColorStop(0.70, selectedCue.gripColor);
          shaftGrad.addColorStop(0.98, selectedCue.gripColor);
          shaftGrad.addColorStop(1, "#090d16");

          ctx.fillStyle = shaftGrad;
          ctx.beginPath();
          ctx.moveTo(startX, -2.5);
          ctx.lineTo(endX, -7);
          ctx.lineTo(endX, 7);
          ctx.lineTo(startX, 2.5);
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      }

      // H. Render Balls
      game.balls.forEach((ball) => {
        if (ball.pocketed) return;

        ctx.save();
        ctx.translate(ball.x, ball.y);

        if (ball.number === 0 && game.ballInHand) {
          const isOverlapping = isCueBallOverlapping(game, ball.x, ball.y);

          ctx.strokeStyle = isOverlapping ? "#ef4444" : "#facc15";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, BALL_RADIUS + 5, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = isOverlapping ? "#ef4444" : "#facc15";
          ctx.font = "800 13px var(--font-plus-jakarta), sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(isOverlapping ? "🚫 OVERLAP" : "✋", 0, -BALL_RADIUS - 10);
        }

        if (lockedBallNumber === ball.number) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, BALL_RADIUS + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        const shadowGrad = ctx.createRadialGradient(2, 4, 2, 3, 5, BALL_RADIUS + 4);
        shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.6)");
        shadowGrad.addColorStop(0.6, "rgba(0, 0, 0, 0.25)");
        shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(3, 5, BALL_RADIUS + 3, 0, Math.PI * 2);
        ctx.fill();

        const ballSprite = ballSpritesRef.current.get(ball.number);
        if (ballSprite) {
          ctx.save();
          ctx.rotate(ball.rotZ || 0);
          ctx.drawImage(
            ballSprite,
            -BALL_RADIUS,
            -BALL_RADIUS,
            BALL_RADIUS * 2,
            BALL_RADIUS * 2
          );
          ctx.restore();
        } else {
          const ballColor = getBallColor(ball.number, ball.kind);
          ctx.fillStyle = ballColor;
          ctx.beginPath();
          ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }

        // Sleek & Clean 3D Polish Gloss Sheen
        const glossGrad = ctx.createRadialGradient(
          -BALL_RADIUS * 0.35,
          -BALL_RADIUS * 0.35,
          1,
          -BALL_RADIUS * 0.35,
          -BALL_RADIUS * 0.35,
          BALL_RADIUS * 0.75
        );
        glossGrad.addColorStop(0, "rgba(255, 255, 255, 0.4)");
        glossGrad.addColorStop(0.45, "rgba(255, 255, 255, 0.08)");
        glossGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.fillStyle = glossGrad;
        ctx.beginPath();
        ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      // I. Simple Graphic Overlay during AI Ball-in-Hand placement
      if (botPlacementAnimRef.current && botPlacementAnimRef.current.active) {
        const anim = botPlacementAnimRef.current;

        ctx.save();

        // Simple Destination Target Circle Outline
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(anim.targetX, anim.targetY, BALL_RADIUS + 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlayingMatch, power, selectedCue, spritesLoaded, strikeAnimOffset, lockedBallNumber, cueSpriteReady]);

  // AUTOMATIC SHOT FIRE UPON RELEASE OF CUE STICK
  const executeShotWithPower = (shotPowerRatio: number) => {
    const game = gameRef.current;
    if (game.moving || game.winner !== null || shotPowerRatio <= 0.02) {
      setPower(0);
      return;
    }

    const cueBall = game.balls[0];
    if (game.ballInHand && isCueBallOverlapping(game, cueBall.x, cueBall.y)) {
      if (game.gameMode === "ai" && game.turn === 2) {
        const validPos = findValidCueBallPosition(game, cueBall.x, cueBall.y);
        cueBall.x = validPos.x;
        cueBall.y = validPos.y;
      } else {
        game.message = "🚫 Cannot shoot while the white ball is overlapping another ball!";
        soundEngine.playFoul();
        setPower(0);
        setIsDraggingCue(false);
        setGameState({ ...game });
        return;
      }
    }

    PoolRuleEngine.onShotStart(game, shotPowerRatio);

    const initialPull = shotPowerRatio * 140 + 24;
    const startTime = performance.now();
    const duration = 110;

    const animateStrike = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);

      const animPull = initialPull * (1.0 - progress);
      setStrikeAnimOffset(animPull);

      if (progress < 1.0) {
        requestAnimationFrame(animateStrike);
      } else {
        setStrikeAnimOffset(null);

        const maxSpeed = 16.5;
        const shotPower = shotPowerRatio * maxSpeed;

        cueBall.vx = Math.cos(game.aimAngle) * shotPower;
        cueBall.vy = Math.sin(game.aimAngle) * shotPower;
        cueBall.topSpin = cueSpin.top;
        cueBall.sideSpin = cueSpin.side;

        game.ballInHand = false;
        game.kitchenOnlyBallInHand = false;
        game.moving = true;
        game.message = `Player ${game.turn} took the shot.`;

        soundEngine.playCueStrike(shotPowerRatio);
        setPower(0);
        setIsDraggingCue(false);
        setCueSpin({ top: 0, side: 0 });
        setGameState({ ...game });
      }
    };

    requestAnimationFrame(animateStrike);
  };

  const handleStartMatch = (mode: "pvp" | "ai" | "practice" = selectedGameMode) => {
    soundEngine.playRack();
    const newGame = createInitialGameState(mode);
    setGameState(newGame);
    setPower(0);
    setCueSpin({ top: 0, side: 0 });
    setTurnTimer(TURN_TIME_LIMIT);
    targetAimAngleRef.current = 0;
    setLockedBallNumber(null);
    setIsPlayingMatch(true);
  };

  const handleReturnToMenu = () => {
    soundEngine.playButtonClick();
    setIsPlayingMatch(false);
  };

  const handleMouseMoveHome = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setCardTilt({ x: py * -15, y: px * 15 });
  };

  const handleMouseLeaveHome = () => {
    setCardTilt({ x: 0, y: 0 });
  };

  const timerRatio = turnTimer / TURN_TIME_LIMIT;

  // ----------------------------------------------------
  // LANDING PAGE / FRONT SCREEN 3D ANIMATED VIEW
  // ----------------------------------------------------
  if (!isPlayingMatch) {
    return (
      <div
        onMouseMove={handleMouseMoveHome}
        onMouseLeave={handleMouseLeaveHome}
        className="relative flex flex-col items-center justify-center min-h-[92vh] w-full max-w-6xl mx-auto px-4 py-8 select-none font-sans text-slate-100 overflow-hidden"
      >
        {/* Dynamic 3D Rolling Background Canvas */}
        <canvas
          ref={homeCanvasRef}
          width={1200}
          height={700}
          className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none z-0"
        />

        {/* Floating Ambient Glow Effect */}
        <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />

        {/* 3D Tilt Card Container */}
        <div
          className="relative z-10 w-full max-w-3xl rounded-3xl bg-[#0c141d]/90 border-2 border-slate-700/80 p-8 sm:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex flex-col items-center gap-8 text-center backdrop-blur-2xl transition-transform duration-200 ease-out"
          style={{
            transform: `perspective(1000px) rotateX(${cardTilt.x}deg) rotateY(${cardTilt.y}deg)`,
          }}
        >
          {/* Top Audio Toggle */}
          <div className="absolute top-5 right-5">
            <button
              onClick={() => setMuted(soundEngine.toggleMute())}
              className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 shadow-lg transition flex items-center gap-2 text-xs font-semibold"
            >
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              {muted ? "Muted" : "Sound On"}
            </button>
          </div>

          {/* 3D Orbiting 8-Ball Badge Header */}
          <div className="flex flex-col items-center gap-4 mt-2">
            <div className="relative flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-slate-900 via-black to-slate-950 border-4 border-amber-400/90 shadow-[0_0_60px_rgba(245,158,11,0.4)] transform hover:rotate-12 hover:scale-110 transition duration-300">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-white text-slate-950 font-black text-3xl shadow-inner">
                8
              </div>
              <div className="absolute top-2 left-4 w-6 h-3 rounded-full bg-white/30 transform -rotate-45 blur-[1px]" />
            </div>

            <div className="space-y-2">
              <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white drop-shadow-lg flex items-center justify-center gap-3">
                8 BALL <span className="text-amber-400">POOL</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-400 font-medium flex items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" /> The Classic World Class Billiards Experience
              </p>
            </div>
          </div>

          {/* Mode Selector Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full my-2">
            <button
              onClick={() => {
                soundEngine.playButtonClick();
                setSelectedGameMode("pvp");
              }}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition transform hover:-translate-y-1 ${selectedGameMode === "pvp" ? "bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/50 shadow-lg" : "bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
            >
              <Users className="w-6 h-6 text-amber-400" />
              <div className="font-bold text-sm">2 Players (PvP)</div>
              <div className="text-[11px] text-slate-400">Pass & Play Local</div>
            </button>

            <button
              onClick={() => {
                soundEngine.playButtonClick();
                setSelectedGameMode("practice");
              }}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition transform hover:-translate-y-1 ${selectedGameMode === "practice" ? "bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/50 shadow-lg" : "bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
            >
              <Target className="w-6 h-6 text-emerald-400" />
              <div className="font-bold text-sm">Solo Practice</div>
              <div className="text-[11px] text-slate-400">Free Training</div>
            </button>

            <button
              onClick={() => {
                soundEngine.playButtonClick();
                setSelectedGameMode("ai");
                setShowAIModal(true);
              }}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition transform hover:-translate-y-1 ${selectedGameMode === "ai" ? "bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/50 shadow-lg" : "bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
            >
              <Bot className="w-6 h-6 text-indigo-400" />
              <div className="font-bold text-sm">Vs AI Bot</div>
              <div className="text-[11px] text-slate-400">
                Mode: <span className="capitalize font-semibold text-amber-400">{selectedAIDifficulty}</span>
              </div>
            </button>
          </div>

          {/* START GAME BUTTON */}
          <button
            onClick={() => handleStartMatch(selectedGameMode)}
            className="group relative inline-flex items-center justify-center gap-3 px-12 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-black text-xl tracking-widest uppercase shadow-[0_0_40px_rgba(245,158,11,0.5)] hover:shadow-[0_0_60px_rgba(245,158,11,0.8)] hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <Play className="w-6 h-6 fill-slate-950" />
            START GAME
          </button>

          {/* AI Difficulty Selection Modal */}
          {showAIModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
              <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 text-white space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-bold text-base text-amber-400 flex items-center gap-2">
                    <Bot className="w-5 h-5 text-indigo-400" /> Select AI Bot Difficulty
                  </h3>
                  <button onClick={() => setShowAIModal(false)} className="text-slate-400 hover:text-white">✕</button>
                </div>

                <div className="grid gap-3">
                  <button
                    onClick={() => {
                      soundEngine.playButtonClick();
                      setSelectedAIDifficulty("easy");
                      setShowAIModal(false);
                    }}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition text-left ${selectedAIDifficulty === "easy" ? "bg-emerald-500/20 border-emerald-400 text-emerald-300" : "bg-slate-800/60 border-slate-700 hover:bg-slate-800"}`}
                  >
                    <div>
                      <div className="font-bold text-sm text-emerald-400">🟢 Easy Bot</div>
                      <div className="text-xs text-slate-400">Relaxed gameplay, casual accuracy</div>
                    </div>
                    {selectedAIDifficulty === "easy" && <span className="text-xs bg-emerald-500 text-slate-950 font-bold px-2.5 py-1 rounded-lg">Active</span>}
                  </button>

                  <button
                    onClick={() => {
                      soundEngine.playButtonClick();
                      setSelectedAIDifficulty("medium");
                      setShowAIModal(false);
                    }}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition text-left ${selectedAIDifficulty === "medium" ? "bg-amber-500/20 border-amber-400 text-amber-300" : "bg-slate-800/60 border-slate-700 hover:bg-slate-800"}`}
                  >
                    <div>
                      <div className="font-bold text-sm text-amber-400">🟡 Medium Bot</div>
                      <div className="text-xs text-slate-400">Balanced competitor, moderate accuracy</div>
                    </div>
                    {selectedAIDifficulty === "medium" && <span className="text-xs bg-amber-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg">Active</span>}
                  </button>

                  <button
                    onClick={() => {
                      soundEngine.playButtonClick();
                      setSelectedAIDifficulty("master");
                      setShowAIModal(false);
                    }}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition text-left ${selectedAIDifficulty === "master" ? "bg-red-500/20 border-red-400 text-red-300" : "bg-slate-800/60 border-slate-700 hover:bg-slate-800"}`}
                  >
                    <div>
                      <div className="font-bold text-sm text-red-400">🔴 Master AI (Maximum Performance)</div>
                      <div className="text-xs text-slate-400">Optimal geometry cut shots into all 6 pockets, 100% precision</div>
                    </div>
                    {selectedAIDifficulty === "master" && <span className="text-xs bg-red-500 text-white font-bold px-2.5 py-1 rounded-lg">Active</span>}
                  </button>
                </div>

                <button
                  onClick={() => {
                    setShowAIModal(false);
                    handleStartMatch("ai");
                  }}
                  className="w-full py-3 bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl uppercase tracking-wider shadow-lg hover:bg-amber-300 transition"
                >
                  Start Match vs AI
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // GAME MATCH POOL TABLE VIEW
  // ----------------------------------------------------
  return (
    <div className="flex flex-col gap-3 w-full max-w-7xl mx-auto px-2 sm:px-4 py-3 select-none bg-[#090d14] text-slate-100 rounded-3xl p-4 border border-slate-800 shadow-2xl font-sans">
      <style>{`
        @keyframes rollIntoRack {
          0% {
            transform: translateX(45px) rotate(360deg) scale(1.3);
            opacity: 0;
          }
          60% {
            transform: translateX(-3px) rotate(-20deg) scale(1.05);
            opacity: 1;
          }
          100% {
            transform: translateX(0) rotate(0deg) scale(1);
            opacity: 1;
          }
        }
        .animate-roll-in {
          animation: rollIntoRack 0.65s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
      `}</style>

      {/* ---------------------------------------------------- */}
      {/* 1. ELEGANT CLASSIC HEADER SCOREBOARD & TOOLBAR       */}
      {/* ---------------------------------------------------- */}
      <header className="flex flex-col lg:flex-row items-center justify-between gap-3 rounded-2xl bg-[#121824] border border-slate-800 p-3 shadow-md">
        
        {/* Player 1 Info Card / Solo Practice Badge */}
        {gameState.gameMode === "practice" ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-white text-sm">Solo Practice Mode</div>
              <div className="text-xs text-slate-400 font-medium">
                Free Direct Play • {gameState.balls.filter((b) => !b.pocketed && b.number !== 0).length} balls left
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex items-center justify-center">
              {gameState.turn === 1 && !gameState.moving && (
                <svg className="absolute -inset-1 w-13 h-13 transform -rotate-90 pointer-events-none">
                  <circle cx="26" cy="26" r="17" stroke="#1e293b" strokeWidth="3" fill="transparent" />
                  <circle
                    cx="26"
                    cy="26"
                    r="17"
                    stroke="#22c55e"
                    strokeWidth="3"
                    strokeDasharray="106"
                    strokeDashoffset={106 * (1 - timerRatio)}
                    className="transition-all duration-1000"
                    fill="transparent"
                  />
                </svg>
              )}
              <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold ${gameState.turn === 1 ? "ring-2 ring-emerald-500" : "opacity-60"}`}>
                <User className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-sm">Player 1</span>
                {gameState.turn === 1 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">
                    {turnTimer}s
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 font-medium">
                Group: <strong className="text-amber-400 capitalize">{gameState.groups[1] ?? "Unassigned"}</strong> ({countGroupBalls(gameState, gameState.groups[1] ?? "solids")} left)
              </div>
            </div>
          </div>
        )}

        {/* Center Chrome Ball Return Rack */}
        <div className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl bg-[#0b0e14] border border-slate-800">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Pocketed Ball Return</div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 min-w-[220px] max-w-[300px] overflow-x-auto">
            {gameState.pocketedHistory.length === 0 ? (
              <span className="text-xs text-slate-500 italic mx-auto">Rack Empty</span>
            ) : (
              gameState.pocketedHistory.map((num, idx) => {
                const sprite = ballSpritesRef.current.get(num);
                const isLatest = idx === gameState.pocketedHistory.length - 1;
                return (
                  <div
                    key={`${num}-${idx}`}
                    className={`w-5 h-5 rounded-full ring-1 ring-white/30 shrink-0 overflow-hidden ${isLatest ? "animate-roll-in" : ""}`}
                  >
                    {sprite ? (
                      <img src={sprite.toDataURL()} alt={`Ball ${num}`} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[9px] text-white font-bold">{num}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Player 2 Card & Integrated Action Toolbar */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
          {gameState.gameMode !== "practice" && (
            <>
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {gameState.turn === 2 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">
                      {turnTimer}s
                    </span>
                  )}
                  <span className="font-extrabold text-white text-sm">
                    {gameState.gameMode === "ai" ? `🤖 Bot (${selectedAIDifficulty.toUpperCase()})` : "Player 2"}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-medium">
                  Group: <strong className="text-amber-400 capitalize">{gameState.groups[2] ?? "Unassigned"}</strong> ({countGroupBalls(gameState, gameState.groups[2] ?? "stripes")} left)
                </div>
              </div>
              <div className="relative flex items-center justify-center">
                {gameState.turn === 2 && !gameState.moving && (
                  <svg className="absolute -inset-1 w-13 h-13 transform -rotate-90 pointer-events-none">
                    <circle cx="26" cy="26" r="17" stroke="#1e293b" strokeWidth="3" fill="transparent" />
                    <circle
                      cx="26"
                      cy="26"
                      r="17"
                      stroke="#22c55e"
                      strokeWidth="3"
                      strokeDasharray="106"
                      strokeDashoffset={106 * (1 - timerRatio)}
                      className="transition-all duration-1000"
                      fill="transparent"
                    />
                  </svg>
                )}
                <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold ${gameState.turn === 2 ? "ring-2 ring-emerald-500" : "opacity-60"}`}>
                  <User className="w-5 h-5 text-indigo-400" />
                </div>
              </div>
            </>
          )}

          {/* 3D Solid Colorful Action Toolbar */}
          <div className="flex items-center gap-2 sm:gap-2.5 pl-2 sm:pl-3 border-l-2 border-slate-800/80">
            <button
              onClick={handleReturnToMenu}
              className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-b from-amber-400 via-amber-400 to-amber-500 border-b-4 border-amber-700 text-slate-950 shadow-lg shadow-amber-950/40 hover:from-amber-300 hover:to-amber-400 active:border-b-0 active:translate-y-1 transition-all duration-150 transform hover:-translate-y-0.5 flex items-center justify-center"
              title="Main Menu"
            >
              <HomeIcon className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </button>

            <button
              onClick={() => setMuted(soundEngine.toggleMute())}
              className={`p-3 sm:p-3.5 rounded-2xl border-b-4 shadow-lg active:border-b-0 active:translate-y-1 transition-all duration-150 transform hover:-translate-y-0.5 flex items-center justify-center ${
                muted
                  ? "bg-gradient-to-b from-rose-500 via-rose-500 to-rose-600 border-rose-800 text-white shadow-rose-950/40 hover:from-rose-400 hover:to-rose-500"
                  : "bg-gradient-to-b from-emerald-400 via-emerald-400 to-emerald-500 border-emerald-700 text-slate-950 shadow-emerald-950/40 hover:from-emerald-300 hover:to-emerald-400"
              }`}
              title="Toggle Sound"
            >
              {muted ? <VolumeX className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" /> : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />}
            </button>

            <button
              onClick={() => handleStartMatch()}
              className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-b from-sky-400 via-sky-400 to-sky-500 border-b-4 border-sky-700 text-slate-950 shadow-lg shadow-sky-950/40 hover:from-sky-300 hover:to-sky-400 active:border-b-0 active:translate-y-1 transition-all duration-150 transform hover:-translate-y-0.5 flex items-center justify-center"
              title="Reset Rack"
            >
              <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </button>

            <button
              onClick={() => {
                soundEngine.playButtonClick();
                setShowSpinModal(!showSpinModal);
              }}
              className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-b from-rose-500 via-rose-500 to-rose-600 border-b-4 border-rose-800 text-white shadow-lg shadow-rose-950/40 hover:from-rose-400 hover:to-rose-500 active:border-b-0 active:translate-y-1 transition-all duration-150 transform hover:-translate-y-0.5 flex items-center justify-center relative"
              title="Cue Spin"
            >
              <Target className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
              {(cueSpin.top !== 0 || cueSpin.side !== 0) && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-slate-950 animate-ping" />
              )}
            </button>

            <button
              onClick={() => {
                soundEngine.playButtonClick();
                setShowThemeModal(true);
              }}
              className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-b from-fuchsia-500 via-fuchsia-500 to-fuchsia-600 border-b-4 border-fuchsia-800 text-white shadow-lg shadow-fuchsia-950/40 hover:from-fuchsia-400 hover:to-fuchsia-500 active:border-b-0 active:translate-y-1 transition-all duration-150 transform hover:-translate-y-0.5 flex items-center justify-center"
              title="Ball Designs"
            >
              <Disc className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </button>

            <button
              onClick={() => {
                soundEngine.playButtonClick();
                setShowCueModal(true);
              }}
              className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-b from-indigo-500 via-indigo-500 to-indigo-600 border-b-4 border-indigo-800 text-white shadow-lg shadow-indigo-950/40 hover:from-indigo-400 hover:to-indigo-500 active:border-b-0 active:translate-y-1 transition-all duration-150 transform hover:-translate-y-0.5 flex items-center justify-center"
              title="Cue Shop"
            >
              <Palette className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </button>

            <button
              onClick={() => setShowHelpModal(true)}
              className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-b from-teal-400 via-teal-400 to-teal-500 border-b-4 border-teal-700 text-slate-950 shadow-lg shadow-teal-950/40 hover:from-teal-300 hover:to-teal-400 active:border-b-0 active:translate-y-1 transition-all duration-150 transform hover:-translate-y-0.5 flex items-center justify-center"
              title="Rules"
            >
              <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------- */}
      {/* 2. MAIN POOL TABLE & CONTROLS GRID                   */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_150px] gap-3 items-center">

        {/* Table Canvas */}
        <div
          className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-[#070a0f] shadow-2xl cursor-crosshair touch-none"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        >
          <canvas
            ref={canvasRef}
            width={TABLE_WIDTH}
            height={TABLE_HEIGHT}
            className="block w-full h-auto select-none"
          />

          {/* Floating Ball-in-Hand / Lock Status Badge */}
          {(gameState.ballInHand || lockedBallNumber !== null) && (
            <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
              {gameState.ballInHand && (
                <div className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-xs font-bold flex items-center gap-1.5 backdrop-blur-md">
                  <Hand className="w-4 h-4" /> Ball-in-Hand {gameState.kitchenOnlyBallInHand ? "(Behind Headstring)" : "(Table)"}
                </div>
              )}

              {lockedBallNumber !== null && !gameState.ballInHand && (
                <div className="px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-bold flex items-center gap-1.5 backdrop-blur-md">
                  <Lock className="w-3.5 h-3.5" /> Aim Locked: Ball #{lockedBallNumber}
                </div>
              )}
            </div>
          )}

          {/* Cue Spin Selector Modal Overlay */}
          {showSpinModal && (
            <div className="absolute top-3 right-3 z-20 flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-950/95 border border-slate-800 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-bold text-slate-200">Cue Spin</span>
                <button onClick={() => setShowSpinModal(false)} className="text-xs text-slate-400 hover:text-white">✕</button>
              </div>

              <div
                onPointerDown={handleSpinPointerMove}
                onPointerMove={(e) => e.buttons === 1 && handleSpinPointerMove(e)}
                className="relative w-24 h-24 rounded-full bg-slate-200 border-2 border-slate-700 cursor-crosshair flex items-center justify-center"
              >
                <div className="absolute w-full h-0.5 bg-slate-400/40" />
                <div className="absolute h-full w-0.5 bg-slate-400/40" />

                <div
                  className="absolute w-4 h-4 rounded-full bg-red-600 border border-white shadow transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${50 + cueSpin.side * 40}%`,
                    top: `${50 - cueSpin.top * 40}%`,
                  }}
                />
              </div>

              <button
                onClick={() => setCueSpin({ top: 0, side: 0 })}
                className="px-2.5 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-semibold rounded border border-slate-700"
              >
                Reset
              </button>
            </div>
          )}
        </div>

        {/* Sleek & Classic Controls Sidebar (Mobile Responsive: h-[220px] on mobile, h-[480px] on desktop) */}
        <div className="grid grid-cols-2 gap-2 h-[220px] sm:h-[260px] lg:h-[480px] bg-[#121824] border border-slate-800 rounded-2xl p-2 shadow-xl select-none touch-none">

          {/* Metallic Aim Wheel Strip */}
          <div
            onPointerDown={handleWheelBarPointerDown}
            onPointerMove={handleWheelBarPointerMove}
            onPointerUp={handleWheelBarPointerUp}
            onWheel={handleWheelScroll}
            className="relative flex-1 w-full rounded-xl bg-[#0b0e14] border border-slate-800 shadow-inner overflow-hidden cursor-ns-resize flex flex-col items-center justify-center group"
          >
            <div
              className="w-full flex flex-col items-center justify-center gap-2.5 transition-transform duration-75"
              style={{ transform: `translateY(${wheelOffset}px)` }}
            >
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3/4 h-1 rounded ${i % 3 === 0 ? "bg-amber-400" : "bg-slate-700 opacity-60"}`}
                />
              ))}
            </div>
          </div>

          {/* Cue Power Pull Stick Container using /assets/cue_stick.png */}
          <div
            className="relative flex-1 w-full flex flex-col items-center justify-start bg-[#0b0e14] border border-slate-800 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing p-1"
            onPointerDown={(e) => {
              if (gameRef.current.gameMode === "ai" && gameRef.current.turn === 2) return;
              setIsDraggingCue(true);
              const rect = e.currentTarget.getBoundingClientRect();
              const p = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
              setPower(p);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (isDraggingCue) {
                const rect = e.currentTarget.getBoundingClientRect();
                const p = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                setPower(p);
              }
            }}
            onPointerUp={() => {
              if (isDraggingCue) {
                setIsDraggingCue(false);
                executeShotWithPower(powerRef.current);
              }
            }}
          >
            {/* Power Level Background Fill Track */}
            <div className="absolute inset-y-0 w-2.5 rounded-full bg-slate-900 overflow-hidden">
              <div
                className="w-full bg-gradient-to-t from-red-600 via-amber-400 to-emerald-400 transition-all duration-75"
                style={{ height: `${power * 100}%` }}
              />
            </div>

            {/* Large & Bold Vertical Cue Stick Asset spanning full container height */}
            <div
              className="relative w-full h-full flex flex-col items-center justify-start pointer-events-none transition-transform duration-75"
              style={{ transform: `translateY(${power * 150}px)` }}
            >
              {/* Floating Power Percentage Badge directly attached to tip */}
              <div className="absolute top-[24px] z-20 flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[11px] shadow-lg border border-amber-300">
                {Math.round(power * 100)}%
              </div>

              {/* Large & Bold Vertical Cue Stick Graphic Positioned neatly inside container */}
              <div className="absolute top-[185px] w-[420px] h-[64px] flex items-center justify-center transform rotate-90 origin-center">
                <img
                  src="/assets/cue_stick.png"
                  alt="Cue Stick Slider"
                  className="w-full h-full object-fill filter drop-shadow-[0_0_12px_rgba(0,0,0,0.95)]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 3. CLASSIC MATCH STATUS FOOTER                       */}
      {/* ---------------------------------------------------- */}
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-2.5 rounded-2xl bg-[#121824] border border-slate-800 text-xs">
        <div className="font-bold text-slate-200">
          {gameState.message}
        </div>

        <div className="text-slate-400 text-[11px] font-medium">
          Aim: <span className="text-white">Click Ball / Aim Wheel</span> • Shoot: <span className="text-amber-400">Pull & Release Cue</span>
        </div>
      </footer>

      {/* MODALS */}
      {showThemeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-amber-400">Ball Themes</h3>
              <button onClick={() => setShowThemeModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="grid gap-2">
              {BALL_THEMES.map((theme) => (
                <div
                  key={theme.id}
                  onClick={() => {
                    soundEngine.playButtonClick();
                    setSelectedTheme(theme.id);
                    setShowThemeModal(false);
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${selectedTheme === theme.id ? "bg-amber-500/10 border-amber-500" : "bg-slate-800/60 border-slate-700 hover:bg-slate-800"}`}
                >
                  <div className="font-semibold text-sm">{theme.name}</div>
                  {selectedTheme === theme.id && <span className="text-xs bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded">Equipped</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-amber-400">Cue Stick Shop</h3>
              <button onClick={() => setShowCueModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="grid gap-2">
              {CUE_DESIGNS.map((cue) => (
                <div
                  key={cue.id}
                  onClick={() => {
                    soundEngine.playButtonClick();
                    setSelectedCue(cue);
                    setShowCueModal(false);
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${selectedCue.id === cue.id ? "bg-amber-500/10 border-amber-500" : "bg-slate-800/60 border-slate-700 hover:bg-slate-800"}`}
                >
                  <div className="font-semibold text-sm">{cue.name}</div>
                  {selectedCue.id === cue.id && <span className="text-xs bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded">Equipped</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> Official 8-Ball Rules
              </h3>
              <button onClick={() => setShowHelpModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <li>• <strong>Break Shot:</strong> Table is OPEN. Scratch on break gives Ball-in-Hand behind headstring.</li>
              <li>• <strong>Groups:</strong> Sinking your first legal object ball AFTER break assigns Solids vs Stripes.</li>
              <li>• <strong>8-Ball Called Pocket:</strong> Click any of the 6 pockets before shooting the 8-Ball.</li>
              <li>• <strong>Ball-in-Hand:</strong> Scratch or foul grants Ball-in-Hand anywhere on table.</li>
            </ul>

            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl uppercase"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {gameState.winner !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border-2 border-slate-700 p-6 text-center text-white space-y-5 shadow-2xl">
            <Trophy className="w-12 h-12 text-amber-400 mx-auto transform hover:scale-110 transition" />
            <h2 className="text-2xl font-black text-amber-400 uppercase tracking-wide">
              {gameState.gameMode === "practice" ? "RACK CLEARED!" : `PLAYER ${gameState.winner} WINS!`}
            </h2>
            <p className="text-xs text-slate-300 font-medium leading-relaxed">{gameState.message}</p>
            
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleReturnToMenu}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-black text-xs rounded-xl uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-1.5"
              >
                <HomeIcon className="w-4 h-4" /> HOME
              </button>

              <button
                onClick={() => handleStartMatch(gameState.gameMode)}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-xs rounded-xl uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> PLAY AGAIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
