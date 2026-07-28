// 8-Ball Pool Physics Engine & Rules Manager (Expert 2D Rigid Body Mechanics)
import { soundEngine } from "./audio";
import {
  GameState,
  BallState,
  POCKETS,
  BALL_RADIUS,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  PLAY_BOTTOM,
  TABLE_WIDTH,
  TABLE_HEIGHT,
  CUE_START,
  countGroupBalls,
  getGroup,
  isCueBallOverlapping,
  findValidCueBallPosition,
  PoolRuleEngine,
} from "./PoolRuleEngine";

export * from "./PoolRuleEngine";

// ----------------------------------------------------------------------
// 1. SUB-STEPPING PHYSICS ENGINE WITH SHOT TRACKING
// ----------------------------------------------------------------------
export function stepPhysics(game: GameState, subSteps = 12): boolean {
  if (game.winner !== null) return false;

  const dt = 1.0 / subSteps;
  let anyMoved = false;
  let collisionOccurred = false;

  const activeBalls = game.balls.filter((b) => !b.pocketed);

  for (let step = 0; step < subSteps; step++) {
    activeBalls.forEach((ball) => {
      if (ball.pocketed) return;

      const speed = Math.hypot(ball.vx, ball.vy);

      if (speed > 0.001) {
        anyMoved = true;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // Two-Stage Friction Dynamics
        const isSliding = speed > 3.0 || Math.abs(ball.topSpin) > 0.1;
        const frictionCoeff = isSliding ? 0.988 : 0.993;
        const friction = Math.pow(frictionCoeff, dt);

        ball.vx *= friction;
        ball.vy *= friction;

        if (ball.number === 0 && Math.abs(ball.topSpin) > 0.05) {
          const spinFriction = 0.96;
          ball.topSpin *= Math.pow(spinFriction, dt);
          if (Math.abs(ball.topSpin) < 0.02) ball.topSpin = 0;
        }

        if (speed < 0.035) {
          ball.vx = 0;
          ball.vy = 0;
          ball.topSpin = 0;
          ball.sideSpin = 0;
        }

        // 3D Roll Rotation Tumble Physics Update
        const rollAngle = (speed * dt) / BALL_RADIUS;
        const dirX = ball.vx / (speed || 1);
        const dirY = ball.vy / (speed || 1);
        ball.rotX = (ball.rotX + dirY * rollAngle) % (Math.PI * 2);
        ball.rotY = (ball.rotY + dirX * rollAngle) % (Math.PI * 2);
        ball.rotZ = (ball.rotZ + (dirX - dirY) * 0.1 * rollAngle) % (Math.PI * 2);
      }

      // ACCURATE POCKET GRAVITY & DROP PHYSICS
      let suckedIntoPocket = false;
      for (const pocket of POCKETS) {
        // DO NOT suck cue ball into pocket when Ball-in-Hand is active!
        if (game.ballInHand && ball.number === 0) continue;

        const dx = pocket.x - ball.x;
        const dy = pocket.y - ball.y;
        const dist = Math.hypot(dx, dy);

        // Corner pockets (0, 2, 3, 5) need slightly wider capture radius from mouth entry
        const isCorner = pocket.id !== 1 && pocket.id !== 4;
        const captureRadius = pocket.radius + (isCorner ? 14 : 10);

        if (dist < captureRadius) {
          suckedIntoPocket = true;
          const pullFactor = isCorner ? 0.75 : 0.70;
          ball.vx += (dx / dist) * pullFactor;
          ball.vy += (dy / dist) * pullFactor;

          if (dist < pocket.radius * 0.98) {
            ball.pocketed = true;
            ball.vx = 0;
            ball.vy = 0;
            ball.fallingPocketIndex = pocket.id;
            soundEngine.playPocketDrop();

            if (!game.pocketedHistory.includes(ball.number)) {
              game.pocketedHistory.push(ball.number);
            }

            // Track Shot Events
            if (game.shot) {
              if (ball.number === 0) {
                game.shot.cuePocketed = true;
              } else if (!game.shot.pocketedNumbers.includes(ball.number)) {
                game.shot.pocketedNumbers.push(ball.number);
              }

              if (ball.number === 8) {
                game.shot.eightPocketIndex = pocket.id;
              }
            }
            break;
          }
        }
      }

      if (ball.pocketed) return;

      // DETECT BALL DRIVEN OFF TABLE BOUNDARIES
      if (ball.x < 10 || ball.x > TABLE_WIDTH - 10 || ball.y < 10 || ball.y > TABLE_HEIGHT - 10) {
        ball.pocketed = true;
        ball.vx = 0;
        ball.vy = 0;
        soundEngine.playPocketDrop();

        if (game.shot) {
          if (ball.number === 0) {
            game.shot.cueDrivenOffTable = true;
          } else {
            if (!game.shot.objectBallsDrivenOffTable.includes(ball.number)) {
              game.shot.objectBallsDrivenOffTable.push(ball.number);
            }
            if (!game.pocketedHistory.includes(ball.number)) {
              game.pocketedHistory.push(ball.number);
            }
          }
        }
        return;
      }

      // Pocket Jaw Facing Deflection & Cushion Physics
      if (!suckedIntoPocket) {
        const POCKET_JAWS = [
          // Top-Left Pocket (0)
          { x: PLAY_LEFT + 28, y: PLAY_TOP },
          { x: PLAY_LEFT, y: PLAY_TOP + 28 },
          // Top-Center Pocket (1)
          { x: TABLE_WIDTH / 2 - 18, y: PLAY_TOP },
          { x: TABLE_WIDTH / 2 + 18, y: PLAY_TOP },
          // Top-Right Pocket (2)
          { x: PLAY_RIGHT - 28, y: PLAY_TOP },
          { x: PLAY_RIGHT, y: PLAY_TOP + 28 },
          // Bottom-Left Pocket (3)
          { x: PLAY_LEFT + 28, y: PLAY_BOTTOM },
          { x: PLAY_LEFT, y: PLAY_BOTTOM - 28 },
          // Bottom-Center Pocket (4)
          { x: TABLE_WIDTH / 2 - 18, y: PLAY_BOTTOM },
          { x: TABLE_WIDTH / 2 + 18, y: PLAY_BOTTOM },
          // Bottom-Right Pocket (5)
          { x: PLAY_RIGHT - 28, y: PLAY_BOTTOM },
          { x: PLAY_RIGHT, y: PLAY_BOTTOM - 28 },
        ];

        let jawHit = false;
        for (const jaw of POCKET_JAWS) {
          const jdx = ball.x - jaw.x;
          const jdy = ball.y - jaw.y;
          const jdist = Math.hypot(jdx, jdy);
          const jawRadius = 3.5;
          const minJawDist = BALL_RADIUS + jawRadius;

          if (jdist < minJawDist && jdist > 0.001) {
            const jnx = jdx / jdist;
            const jny = jdy / jdist;

            const overlap = minJawDist - jdist;
            ball.x += jnx * overlap;
            ball.y += jny * overlap;

            const vDotN = ball.vx * jnx + ball.vy * jny;
            if (vDotN < 0) {
              const cushionRestitution = 0.82;
              ball.vx = (ball.vx - 2 * vDotN * jnx) * cushionRestitution;
              ball.vy = (ball.vy - 2 * vDotN * jny) * cushionRestitution;
              soundEngine.playCushionHit(speed / 10);
              if (game.shot && game.shot.firstContactBallNumber !== null) {
                game.shot.railHitAfterContact = true;
              }
            }
            jawHit = true;
            break;
          }
        }

        // Standard Cushion Boundary Collisions (Scoped strictly to actual cushion spans)
        if (!jawHit) {
          const cushionRestitution = 0.80;
          let cushionHitThisStep = false;
          let cushionHitDirection: "left" | "right" | "top" | "bottom" | null = null;

          const inLeftCushionSpan = ball.y >= PLAY_TOP + 26 && ball.y <= PLAY_BOTTOM - 26;
          const inRightCushionSpan = ball.y >= PLAY_TOP + 26 && ball.y <= PLAY_BOTTOM - 26;
          const inTopCushionSpan =
            (ball.x >= PLAY_LEFT + 26 && ball.x <= TABLE_WIDTH / 2 - 16) ||
            (ball.x >= TABLE_WIDTH / 2 + 16 && ball.x <= PLAY_RIGHT - 26);
          const inBottomCushionSpan =
            (ball.x >= PLAY_LEFT + 26 && ball.x <= TABLE_WIDTH / 2 - 16) ||
            (ball.x >= TABLE_WIDTH / 2 + 16 && ball.x <= PLAY_RIGHT - 26);

          if (inLeftCushionSpan && ball.x < PLAY_LEFT + BALL_RADIUS) {
            ball.x = PLAY_LEFT + BALL_RADIUS;
            ball.vx = Math.abs(ball.vx) * cushionRestitution;
            ball.vy += ball.sideSpin * 2.2;
            ball.sideSpin *= 0.5;
            cushionHitThisStep = true;
            cushionHitDirection = "left";
          }
          if (inRightCushionSpan && ball.x > PLAY_RIGHT - BALL_RADIUS) {
            ball.x = PLAY_RIGHT - BALL_RADIUS;
            ball.vx = -Math.abs(ball.vx) * cushionRestitution;
            ball.vy -= ball.sideSpin * 2.2;
            ball.sideSpin *= 0.5;
            cushionHitThisStep = true;
            cushionHitDirection = "right";
          }
          if (inTopCushionSpan && ball.y < PLAY_TOP + BALL_RADIUS) {
            ball.y = PLAY_TOP + BALL_RADIUS;
            ball.vy = Math.abs(ball.vy) * cushionRestitution;
            ball.vx -= ball.sideSpin * 2.2;
            ball.sideSpin *= 0.5;
            cushionHitThisStep = true;
            cushionHitDirection = "top";
          }
          if (inBottomCushionSpan && ball.y > PLAY_BOTTOM - BALL_RADIUS) {
            ball.y = PLAY_BOTTOM - BALL_RADIUS;
            ball.vy = -Math.abs(ball.vy) * cushionRestitution;
            ball.vx += ball.sideSpin * 2.2;
            ball.sideSpin *= 0.5;
            cushionHitThisStep = true;
            cushionHitDirection = "bottom";
          }

          if (cushionHitThisStep) {
            soundEngine.playCushionHit(speed / 10);
            if (game.shot && game.shot.firstContactBallNumber !== null) {
              if (!ball.frozenCushion || ball.frozenCushion !== cushionHitDirection) {
                game.shot.railHitAfterContact = true;
              }
            }
          }
        }
      }
    });

    // ELASTIC BILLIARD BALL-TO-BALL IMPACTS
    for (let i = 0; i < activeBalls.length; i++) {
      for (let j = i + 1; j < activeBalls.length; j++) {
        const b1 = activeBalls[i];
        const b2 = activeBalls[j];
        if (b1.pocketed || b2.pocketed) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = BALL_RADIUS * 2;

        // DO NOT push or displace object balls when dragging cue ball during Ball-in-Hand!
        if (game.ballInHand && (b1.number === 0 || b2.number === 0)) continue;

        if (dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const tx = -ny;
          const ty = nx;

          const overlap = minDist - dist;
          b1.x -= nx * overlap * 0.5;
          b1.y -= ny * overlap * 0.5;
          b2.x += nx * overlap * 0.5;
          b2.y += ny * overlap * 0.5;

          const v1n = b1.vx * nx + b1.vy * ny;
          const v1t = b1.vx * tx + b1.vy * ty;
          const v2n = b2.vx * nx + b2.vy * ny;
          const v2t = b2.vx * tx + b2.vy * ty;

          if (v1n - v2n > 0) {
            let newV1n = v2n;
            let newV2n = v1n;

            if (b1.number === 0 && Math.abs(b1.topSpin) > 0.05) {
              const spinImpulse = b1.topSpin * 4.5;
              newV1n += spinImpulse;
            } else if (b2.number === 0 && Math.abs(b2.topSpin) > 0.05) {
              const spinImpulse = b2.topSpin * 4.5;
              newV2n += spinImpulse;
            }

            b1.vx = newV1n * nx + v1t * tx;
            b1.vy = newV1n * ny + v1t * ty;
            b2.vx = newV2n * nx + v2t * tx;
            b2.vy = newV2n * ny + v2t * ty;

            // Track First Contact with Cue Ball
            if (game.shot && game.shot.firstContactBallNumber === null) {
              if (b1.number === 0) game.shot.firstContactBallNumber = b2.number;
              else if (b2.number === 0) game.shot.firstContactBallNumber = b1.number;
            }

            const relativeSpeed = Math.abs(v1n - v2n);
            soundEngine.playBallCollision(relativeSpeed / 12);
            collisionOccurred = true;
          }
        }
      }
    }
  }

  return anyMoved || collisionOccurred;
}

export function calculateAimTrajectory(game: GameState) {
  const cue = game.balls[0];
  const angle = game.aimAngle;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  let closestHitDist = 2000;
  let targetBall: BallState | null = null;
  let ghostX = cue.x + dirX * closestHitDist;
  let ghostY = cue.y + dirY * closestHitDist;

  for (const b of game.balls) {
    if (b.number === 0 || b.pocketed) continue;

    const dx = b.x - cue.x;
    const dy = b.y - cue.y;
    const projLength = dx * dirX + dy * dirY;

    if (projLength > 0) {
      const perpDistSq = dx * dx + dy * dy - projLength * projLength;
      const combinedRadius = BALL_RADIUS * 2;

      if (perpDistSq < combinedRadius * combinedRadius) {
        const hitDist = projLength - Math.sqrt(Math.max(0, combinedRadius * combinedRadius - perpDistSq));
        if (hitDist > 0 && hitDist < closestHitDist) {
          closestHitDist = hitDist;
          targetBall = b;
          ghostX = cue.x + dirX * hitDist;
          ghostY = cue.y + dirY * hitDist;
        }
      }
    }
  }

  if (!targetBall) {
    let t = closestHitDist;
    if (dirX > 0) t = Math.min(t, (PLAY_RIGHT - BALL_RADIUS - cue.x) / dirX);
    if (dirX < 0) t = Math.min(t, (PLAY_LEFT + BALL_RADIUS - cue.x) / dirX);
    if (dirY > 0) t = Math.min(t, (PLAY_BOTTOM - BALL_RADIUS - cue.y) / dirY);
    if (dirY < 0) t = Math.min(t, (PLAY_TOP + BALL_RADIUS - cue.y) / dirY);

    ghostX = cue.x + dirX * t;
    ghostY = cue.y + dirY * t;

    return {
      cueX: cue.x,
      cueY: cue.y,
      aimEndX: ghostX,
      aimEndY: ghostY,
      hasCollision: false,
      ghostX,
      ghostY,
      targetBallNumber: null,
      targetDirX: 0,
      targetDirY: 0,
      cueDeflectX: 0,
      cueDeflectY: 0,
    };
  }

  const normX = (targetBall.x - ghostX) / (BALL_RADIUS * 2);
  const normY = (targetBall.y - ghostY) / (BALL_RADIUS * 2);

  const tangX = -normY;
  const tangY = normX;
  const dotTang = dirX * tangX + dirY * tangY;

  const cueDeflectX = tangX * dotTang;
  const cueDeflectY = tangY * dotTang;

  return {
    cueX: cue.x,
    cueY: cue.y,
    aimEndX: ghostX,
    aimEndY: ghostY,
    hasCollision: true,
    ghostX,
    ghostY,
    targetBallNumber: targetBall.number,
    targetDirX: normX,
    targetDirY: normY,
    cueDeflectX,
    cueDeflectY,
  };
}

// ----------------------------------------------------------------------
// 3. ADVANCED AUTOMATED AI BILLIARDS SHOT ENGINE
// ----------------------------------------------------------------------
export type AIDifficulty = "easy" | "medium" | "master";

export interface AIShotResult {
  aimAngle: number;
  power: number;
  cueX: number;
  cueY: number;
}

export function calculateBestAIShot(game: GameState, difficulty: AIDifficulty = "master"): AIShotResult {
  const cueBall = game.balls[0];
  const aiGroup = game.groups[2];
  const activeBalls = game.balls.filter((b) => !b.pocketed && b.number !== 0);

  // Check if AI has remaining group balls on table
  let hasRemainingGroupBalls = true;
  if (game.tableState === "assigned" && aiGroup !== null) {
    hasRemainingGroupBalls = countGroupBalls(game, aiGroup) > 0;
  } else {
    hasRemainingGroupBalls = activeBalls.some((b) => b.number !== 8);
  }

  let legalBalls: BallState[] = [];
  if (!hasRemainingGroupBalls) {
    legalBalls = activeBalls.filter((b) => b.number === 8);
  } else {
    if (game.tableState === "assigned" && aiGroup !== null) {
      legalBalls = activeBalls.filter((b) => getGroup(b.number) === aiGroup && b.number !== 8);
    } else {
      legalBalls = activeBalls.filter((b) => b.number !== 8);
    }
  }

  if (legalBalls.length === 0) {
    if (hasRemainingGroupBalls) {
      legalBalls = activeBalls.filter((b) => b.number !== 8);
    } else {
      legalBalls = activeBalls.filter((b) => b.number === 8);
    }
  }

  // Generate candidate non-overlapping cue ball positions for AI
  const candidateCuePositions: { x: number; y: number }[] = [];

  if (game.ballInHand) {
    const minX = PLAY_LEFT + BALL_RADIUS + 4;
    const maxX = game.kitchenOnlyBallInHand ? CUE_START.x : PLAY_RIGHT - BALL_RADIUS * 4;
    const minY = PLAY_TOP + BALL_RADIUS + 4;
    const maxY = PLAY_BOTTOM - BALL_RADIUS * 4;

    // A. Direct alignment candidate positions: line up straight behind target balls to pocket
    for (const target of legalBalls) {
      for (const pocket of POCKETS) {
        const pocketDx = pocket.x - target.x;
        const pocketDy = pocket.y - target.y;
        const distPocket = Math.hypot(pocketDx, pocketDy) || 1;
        const pDirX = pocketDx / distPocket;
        const pDirY = pocketDy / distPocket;

        const ghostX = target.x - pDirX * (BALL_RADIUS * 2);
        const ghostY = target.y - pDirY * (BALL_RADIUS * 2);

        // Try candidate positions along the straight line behind the ghost ball
        for (const distBack of [40, 70, 110, 160, 220]) {
          const setupX = ghostX - pDirX * distBack;
          const setupY = ghostY - pDirY * distBack;
          if (!isCueBallOverlapping(game, setupX, setupY)) {
            candidateCuePositions.push({ x: setupX, y: setupY });
          }
        }
      }
    }

    // B. Uniform Grid candidate positions across allowed area
    const stepX = Math.max(25, (maxX - minX) / 10);
    const stepY = Math.max(25, (maxY - minY) / 6);
    for (let x = minX; x <= maxX; x += stepX) {
      for (let y = minY; y <= maxY; y += stepY) {
        if (!isCueBallOverlapping(game, x, y)) {
          candidateCuePositions.push({ x, y });
        }
      }
    }

    // C. Fallback to guaranteed valid position if grid returned empty
    if (candidateCuePositions.length === 0) {
      candidateCuePositions.push(findValidCueBallPosition(game));
    }
  } else {
    candidateCuePositions.push({ x: cueBall.x, y: cueBall.y });
  }

  let bestShot: { aimAngle: number; power: number; score: number; cueX: number; cueY: number } | null = null;

  // Evaluate candidate positions across targets and pockets
  for (const pos of candidateCuePositions) {
    const cueX = pos.x;
    const cueY = pos.y;

    for (const target of legalBalls) {
      const pocketsToScan =
        difficulty === "easy"
          ? [...POCKETS]
              .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))
              .slice(0, 2)
          : POCKETS;

      for (const pocket of pocketsToScan) {
        const pocketDx = pocket.x - target.x;
        const pocketDy = pocket.y - target.y;
        const distPocket = Math.hypot(pocketDx, pocketDy) || 1;

        const pDirX = pocketDx / distPocket;
        const pDirY = pocketDy / distPocket;

        const ghostX = target.x - pDirX * (BALL_RADIUS * 2);
        const ghostY = target.y - pDirY * (BALL_RADIUS * 2);

        const cueDx = ghostX - cueX;
        const cueDy = ghostY - cueY;
        const distCue = Math.hypot(cueDx, cueDy) || 1;

        const cDirX = cueDx / distCue;
        const cDirY = cueDy / distCue;

        const dot = cDirX * pDirX + cDirY * pDirY;

        let maxCutDot = 0.1;
        if (difficulty === "master") maxCutDot = 0.08; // Up to 85 deg
        else if (difficulty === "medium") maxCutDot = 0.42; // Up to 65 deg
        else maxCutDot = 0.5;

        if (dot <= maxCutDot) continue;

        const cutAngle = Math.acos(Math.max(-1, Math.min(1, dot)));

        let sPot = 1000 - cutAngle * 400 - distPocket * 0.4 - distCue * 0.3;

        // Position bonus when Ball-in-Hand is active for clean straight setup
        if (game.ballInHand) {
          if (cutAngle < 0.1) sPot += 350; // Straight shot alignment bonus
          sPot += 100;
        }

        let sPosition = 0;
        if (difficulty === "master") {
          const tangX = -pDirY;
          const tangY = pDirX;
          const dotTang = cDirX * tangX + cDirY * tangY;
          const predictedRestX = ghostX + tangX * dotTang * 120;
          const predictedRestY = ghostY + tangY * dotTang * 120;

          const remainingTargets = legalBalls.filter((b) => b.number !== target.number);
          if (remainingTargets.length > 0) {
            let minDistToNext = Infinity;
            for (const nextB of remainingTargets) {
              const d = Math.hypot(nextB.x - predictedRestX, nextB.y - predictedRestY);
              if (d < minDistToNext) minDistToNext = d;
            }
            sPosition = Math.max(0, 300 - minDistToNext * 0.5);
          }
        }

        const score = sPot + sPosition;

        if (!bestShot || score > bestShot.score) {
          const aimAngle = Math.atan2(cueDy, cueDx);
          const power = Math.max(0.35, Math.min(0.9, (distCue + distPocket) / 600));
          bestShot = { aimAngle, power, score, cueX, cueY };
        }
      }
    }
  }

  // Fallback safety shot if no pot shot met criteria
  if (!bestShot) {
    const chosenPos = candidateCuePositions[0] || findValidCueBallPosition(game);
    const target = (hasRemainingGroupBalls ? legalBalls.find((b) => b.number !== 8) : null) || legalBalls[0] || activeBalls[0];
    const aimAngle = target ? Math.atan2(target.y - chosenPos.y, target.x - chosenPos.x) : 0;
    bestShot = { aimAngle, power: 0.3, score: 0, cueX: chosenPos.x, cueY: chosenPos.y };
  }

  // Ensure chosen position is 100% valid and non-overlapping
  const finalCuePos = findValidCueBallPosition(game, bestShot.cueX, bestShot.cueY);

  // Add random noise offset based on difficulty
  let noiseRad = 0;
  if (difficulty === "easy") {
    const sign = Math.random() < 0.5 ? -1 : 1;
    noiseRad = sign * (((3.0 + Math.random() * 2.0) * Math.PI) / 180);
  } else if (difficulty === "medium") {
    const sign = Math.random() < 0.5 ? -1 : 1;
    noiseRad = sign * (((1.0 + Math.random() * 0.5) * Math.PI) / 180);
  }

  return {
    aimAngle: bestShot.aimAngle + noiseRad,
    power: bestShot.power,
    cueX: finalCuePos.x,
    cueY: finalCuePos.y,
  };
}

export function finalizeShotRules(game: GameState): GameState {
  return PoolRuleEngine.evaluateShotEnd(game);
}
