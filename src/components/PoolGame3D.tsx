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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const [isDraggingCue, setIsDraggingCue] = useState(false);
  const [muted, setMuted] = useState(false);
  const [selectedCue, setSelectedCue] = useState(CUE_DESIGNS[0]);
  const [selectedTheme, setSelectedTheme] = useState<BallThemeId>("tournament");

  // Spin / English State (-1.0 to +1.0)
  const [cueSpin, setCueSpin] = useState({ top: 0, side: 0 });

  // Cue Forward Strike Animation State
  const [strikeAnimOffset, setStrikeAnimOffset] = useState<number | null>(null);

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
    if (gameState.winner !== null || gameState.moving) {
      setTurnTimer(TURN_TIME_LIMIT);
      return;
    }

    const interval = setInterval(() => {
      setTurnTimer((prev) => {
        if (prev <= 6 && prev > 1) {
          soundEngine.playTimerTick();
        }

        if (prev <= 1) {
          const game = gameRef.current;
          const timedOutPlayer = game.turn;
          const incomingPlayer = timedOutPlayer === 1 ? 2 : 1;

          game.turn = incomingPlayer;
          game.ballInHand = true;
          game.kitchenOnlyBallInHand = false;
          game.message = `⏱️ Time out! Player ${timedOutPlayer} ran out of time. Turn passes to Player ${incomingPlayer} with Ball-in-Hand!`;
          
          soundEngine.playFoul();
          setGameState({ ...game });
          return TURN_TIME_LIMIT;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState.turn, gameState.moving, gameState.winner]);

  // CANVAS POINTER DOWN HANDLER
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cueBall = gameRef.current.balls[0];
    if (cueBall.pocketed || gameRef.current.moving || strikeAnimOffset !== null) return;

    const canvasX = ((e.clientX - rect.left) / rect.width) * TABLE_WIDTH;
    const canvasY = ((e.clientY - rect.top) / rect.height) * TABLE_HEIGHT;

    // A. STRICT BALL-IN-HAND CHECK (ONLY WHITE CUE BALL CAN BE MOVED OR TOUCHED!)
    if (gameRef.current.ballInHand) {
      const distToCue = Math.hypot(canvasX - cueBall.x, canvasY - cueBall.y);
      if (distToCue <= BALL_RADIUS * 4.0) {
        setIsDraggingCueBall(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        soundEngine.playButtonClick();
      } else {
        soundEngine.playFoul();
        const game = gameRef.current;
        game.message = "✋ Ball-in-Hand active! Touch & drag the white ball to position it.";
        setGameState({ ...game });
      }
      return; // Return immediately: No other ball can be touched, aimed at, or moved!
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const game = gameRef.current;

      // Smooth Angular Dampening
      game.aimAngle = lerpAngle(game.aimAngle, targetAimAngleRef.current, 0.12);

      // Physics step
      const isMoving = stepPhysics(game, 12);

      if (game.moving && !isMoving) {
        game.moving = false;
        const previousTurn = game.turn;
        const updatedGame = finalizeShotRules(game);
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
      feltGrad.addColorStop(0, "#16a34a");
      feltGrad.addColorStop(0.55, "#15803d");
      feltGrad.addColorStop(0.85, "#116b34");
      feltGrad.addColorStop(1, "#094721");

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
          // Mirror horizontal axis so Tip (left of sprite) points at -currentPull towards white ball!
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
          ctx.rotate(ball.rotZ || 0);
          ctx.drawImage(
            ballSprite,
            -BALL_RADIUS,
            -BALL_RADIUS,
            BALL_RADIUS * 2,
            BALL_RADIUS * 2
          );
        } else {
          const ballColor = getBallColor(ball.number, ball.kind);
          ctx.fillStyle = ballColor;
          ctx.beginPath();
          ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [power, selectedCue, spritesLoaded, strikeAnimOffset, lockedBallNumber, cueSpriteReady]);

  // AUTOMATIC SHOT FIRE UPON RELEASE OF CUE STICK
  const executeShotWithPower = (shotPowerRatio: number) => {
    const game = gameRef.current;
    if (game.moving || game.winner !== null || shotPowerRatio <= 0.02) {
      setPower(0);
      return;
    }

    const cueBall = game.balls[0];
    if (game.ballInHand && isCueBallOverlapping(game, cueBall.x, cueBall.y)) {
      game.message = "🚫 Cannot shoot while the white ball is overlapping another ball!";
      soundEngine.playFoul();
      setPower(0);
      setIsDraggingCue(false);
      setGameState({ ...game });
      return;
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
        setGameState({ ...game });
      }
    };

    requestAnimationFrame(animateStrike);
  };

  const handleResetMatch = (mode: "pvp" | "ai" | "practice" = gameState.gameMode) => {
    soundEngine.playButtonClick();
    const newGame = createInitialGameState(mode);
    setGameState(newGame);
    setPower(0);
    setCueSpin({ top: 0, side: 0 });
    setTurnTimer(TURN_TIME_LIMIT);
    targetAimAngleRef.current = 0;
    setLockedBallNumber(null);
  };

  const timerRatio = turnTimer / TURN_TIME_LIMIT;

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
        
        {/* Player 1 Info Card */}
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
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              {gameState.turn === 2 && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">
                  {turnTimer}s
                </span>
              )}
              <span className="font-extrabold text-white text-sm">Player 2</span>
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

          {/* Clean Action Toolbar */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
            <button
              onClick={() => setMuted(soundEngine.toggleMute())}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Toggle Sound"
            >
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            <button
              onClick={() => handleResetMatch()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Reset Rack"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                soundEngine.playButtonClick();
                setShowSpinModal(!showSpinModal);
              }}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Cue Spin"
            >
              <Target className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                soundEngine.playButtonClick();
                setShowThemeModal(true);
              }}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Ball Designs"
            >
              <Disc className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                soundEngine.playButtonClick();
                setShowCueModal(true);
              }}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Cue Shop"
            >
              <Palette className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowHelpModal(true)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Rules"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------- */}
      {/* 2. MAIN POOL TABLE & CONTROLS GRID                   */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_120px] gap-3 items-center">

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

        {/* Sleek & Classic Right Controls Sidebar */}
        <div className="grid grid-cols-2 gap-2 h-[440px] sm:h-[470px] bg-[#121824] border border-slate-800 rounded-2xl p-2 shadow-xl select-none">

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
            className="relative flex-1 w-full flex items-center justify-center bg-[#0b0e14] border border-slate-800 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => {
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
            <div className="absolute w-3.5 h-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
              <div
                className="w-full bg-gradient-to-t from-red-600 via-amber-400 to-emerald-400"
                style={{ height: `${power * 100}%` }}
              />
            </div>

            {/* Real /assets/cue_stick.png image rotated vertically with Tip at top & Butt at bottom */}
            <div
              className="absolute pointer-events-none transition-transform duration-75 flex flex-col items-center justify-start h-full"
              style={{ transform: `translateY(${power * 75}%)` }}
            >
              <img
                src="/assets/cue_stick.png"
                alt="Cue Stick"
                className="w-36 h-8 object-contain rotate-90 drop-shadow-xl my-36"
              />
            </div>

            <div
              className="absolute pointer-events-none"
              style={{ top: `${power * 75 + 10}%` }}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] shadow-lg">
                {Math.round(power * 100)}%
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-amber-500/50 p-6 text-center text-white space-y-4">
            <Trophy className="w-10 h-10 text-amber-400 mx-auto" />
            <h2 className="text-2xl font-bold text-amber-400">PLAYER {gameState.winner} WINS!</h2>
            <p className="text-xs text-slate-300">{gameState.message}</p>
            <button
              onClick={() => handleResetMatch()}
              className="w-full py-3 bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl uppercase"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
