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

        const captureRadius = pocket.radius + 8;

        if (dist < captureRadius) {
          suckedIntoPocket = true;
          const pullFactor = 0.55;
          ball.vx += (dx / dist) * pullFactor;
          ball.vy += (dy / dist) * pullFactor;

          if (dist < pocket.radius * 0.9) {
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
      if (ball.x < 12 || ball.x > TABLE_WIDTH - 12 || ball.y < 12 || ball.y > TABLE_HEIGHT - 12) {
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

      // Cushion Collision Physics & Rail Tracker (With Frozen Ball Rule Check)
      if (!suckedIntoPocket) {
        const cushionRestitution = 0.80;
        let cushionHitThisStep = false;
        let cushionHitDirection: "left" | "right" | "top" | "bottom" | null = null;

        if (ball.x < PLAY_LEFT + BALL_RADIUS) {
          ball.x = PLAY_LEFT + BALL_RADIUS;
          ball.vx = Math.abs(ball.vx) * cushionRestitution;
          ball.vy += ball.sideSpin * 2.2;
          ball.sideSpin *= 0.5;
          cushionHitThisStep = true;
          cushionHitDirection = "left";
        }
        if (ball.x > PLAY_RIGHT - BALL_RADIUS) {
          ball.x = PLAY_RIGHT - BALL_RADIUS;
          ball.vx = -Math.abs(ball.vx) * cushionRestitution;
          ball.vy -= ball.sideSpin * 2.2;
          ball.sideSpin *= 0.5;
          cushionHitThisStep = true;
          cushionHitDirection = "right";
        }
        if (ball.y < PLAY_TOP + BALL_RADIUS) {
          ball.y = PLAY_TOP + BALL_RADIUS;
          ball.vy = Math.abs(ball.vy) * cushionRestitution;
          ball.vx -= ball.sideSpin * 2.2;
          ball.sideSpin *= 0.5;
          cushionHitThisStep = true;
          cushionHitDirection = "top";
        }
        if (ball.y > PLAY_BOTTOM - BALL_RADIUS) {
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
            // Frozen Ball Rule: Hitting the cushion that ball was already frozen to does NOT count!
            if (!ball.frozenCushion || ball.frozenCushion !== cushionHitDirection) {
              game.shot.railHitAfterContact = true;
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
// ADVANCED AUTOMATED AI BILLIARDS SHOT ENGINE
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
  let cueX = cueBall.x;
  let cueY = cueBall.y;

  // Ball in Hand positioning for AI
  if (game.ballInHand) {
    const minX = game.kitchenOnlyBallInHand ? PLAY_LEFT + BALL_RADIUS * 2 : PLAY_LEFT + BALL_RADIUS * 4;
    const maxX = game.kitchenOnlyBallInHand ? CUE_START.x : PLAY_RIGHT - BALL_RADIUS * 4;
    cueX = (minX + maxX) / 2;
    cueY = TABLE_HEIGHT / 2;
  }

  const aiGroup = game.groups[2];
  const activeBalls = game.balls.filter((b) => !b.pocketed && b.number !== 0);

  // Check if AI has remaining group balls on table
  let hasRemainingGroupBalls = true;
  if (game.tableState === "assigned" && aiGroup !== null) {
    hasRemainingGroupBalls = countGroupBalls(game, aiGroup) > 0;
  } else {
    // Open table: AI has remaining group balls
    hasRemainingGroupBalls = activeBalls.some((b) => b.number !== 8);
  }

  // Determine legal target balls for AI
  let legalBalls: BallState[] = [];

  if (!hasRemainingGroupBalls) {
    // ALL group balls pocketed: target 8-Ball only!
    legalBalls = activeBalls.filter((b) => b.number === 8);
  } else {
    // STRICT RULE: 8-Ball is 100% FORBIDDEN while group balls remain!
    if (game.tableState === "assigned" && aiGroup !== null) {
      legalBalls = activeBalls.filter((b) => getGroup(b.number) === aiGroup && b.number !== 8);
    } else {
      // Open table: any ball EXCEPT 8-Ball
      legalBalls = activeBalls.filter((b) => b.number !== 8);
    }
  }

  // Fallback protection: Never allow 8-ball if group balls remain!
  if (legalBalls.length === 0) {
    if (hasRemainingGroupBalls) {
      legalBalls = activeBalls.filter((b) => b.number !== 8);
    } else {
      legalBalls = activeBalls.filter((b) => b.number === 8);
    }
  }

  let bestShot: { aimAngle: number; power: number; score: number } | null = null;

  if (difficulty === "easy") {
    // ------------------------------------------------------------------
    // EASY_AI_BOT ROLE SPECIFICATION
    // ------------------------------------------------------------------
    // 1. GEOMETRY ANALYSIS: Scan only nearest 2 pockets per eligible target ball
    for (const target of legalBalls) {
      const sortedPockets = [...POCKETS]
        .sort((a, b) => {
          const distA = Math.hypot(a.x - target.x, a.y - target.y);
          const distB = Math.hypot(b.x - target.x, b.y - target.y);
          return distA - distB;
        })
        .slice(0, 2);

      for (const pocket of sortedPockets) {
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
        if (dot <= 0.1) continue;

        const cutAngle = Math.acos(Math.max(-1, Math.min(1, dot)));

        // 2. POSITION PLAY: S_position = 0. Pure pot score
        const sPot = 1000 - cutAngle * 500 - distPocket * 0.5 - distCue * 0.4;
        const sPosition = 0;
        const score = sPot + sPosition;

        if (!bestShot || score > bestShot.score) {
          const aimAngle = Math.atan2(cueDy, cueDx);
          const power = Math.max(0.3, Math.min(0.65, (distCue + distPocket) / 700));
          bestShot = { aimAngle, power, score };
        }
      }
    }

    // 3. DEFENSE: If no clear shot, hit cue ball softly toward nearest legal ball (excluding 8-Ball)
    if (!bestShot) {
      const target = (hasRemainingGroupBalls ? legalBalls.find((b) => b.number !== 8) : null) || legalBalls[0] || activeBalls[0];
      const aimAngle = Math.atan2(target.y - cueY, target.x - cueX);
      bestShot = { aimAngle, power: 0.25, score: 0 };
    }

    // 4. PRECISION MODIFIER: Random Gaussian noise offset between +/- 3.0 to 5.0 degrees
    const sign = Math.random() < 0.5 ? -1 : 1;
    const noiseDegrees = 3.0 + Math.random() * 2.0; // 3.0 to 5.0 deg
    const noiseRad = sign * ((noiseDegrees * Math.PI) / 180);

    return {
      aimAngle: bestShot.aimAngle + noiseRad,
      power: bestShot.power,
      cueX,
      cueY,
    };
  }

  if (difficulty === "master") {
    // ------------------------------------------------------------------
    // MASTER_AI_BOT ROLE SPECIFICATION (Maximum Performance Engine)
    // ------------------------------------------------------------------
    const maxCutAngleRad = (85 * Math.PI) / 180; // Accept cut angles up to 85 degrees

    for (const target of legalBalls) {
      for (const pocket of POCKETS) {
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
        if (dot <= 0.08) continue; // Up to 85 deg

        const cutAngle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (cutAngle > maxCutAngleRad) continue;

        // Immediate Pot Score S_pot
        const sPot = 1200 - cutAngle * 350 - distPocket * 0.35 - distCue * 0.25;

        // Invisible Physics Lookahead Simulation for Cue Resting Position S_position
        const tangX = -pDirY;
        const tangY = pDirX;
        const dotTang = cDirX * tangX + cDirY * tangY;
        const predictedRestX = ghostX + tangX * dotTang * 120;
        const predictedRestY = ghostY + tangY * dotTang * 120;

        // Evaluate next target ball availability from predicted rest position
        const remainingTargets = legalBalls.filter((b) => b.number !== target.number);
        let sPosition = 0;
        if (remainingTargets.length > 0) {
          let minDistToNext = Infinity;
          for (const nextB of remainingTargets) {
            const d = Math.hypot(nextB.x - predictedRestX, nextB.y - predictedRestY);
            if (d < minDistToNext) minDistToNext = d;
          }
          sPosition = Math.max(0, 300 - minDistToNext * 0.5);
        }

        const score = sPot + sPosition;

        if (!bestShot || score > bestShot.score) {
          const aimAngle = Math.atan2(cueDy, cueDx);
          const power = Math.max(0.35, Math.min(0.9, (distCue + distPocket) / 600));
          bestShot = { aimAngle, power, score };
        }
      }
    }

    // DEFENSE / SNOOKER SAFETY PLAY
    if (!bestShot) {
      const primaryTarget = (hasRemainingGroupBalls ? legalBalls.find((b) => b.number !== 8) : null) || legalBalls[0] || activeBalls[0];
      const aimAngle = Math.atan2(primaryTarget.y - cueY, primaryTarget.x - cueX);
      bestShot = { aimAngle, power: 0.28, score: 0 };
    }

    // PRECISION MODIFIER: Exactly 0.0 degrees noise (100% mathematically perfect execution)
    return {
      aimAngle: bestShot.aimAngle,
      power: bestShot.power,
      cueX,
      cueY,
    };
  }

  if (difficulty === "medium") {
    // ------------------------------------------------------------------
    // MEDIUM_AI_BOT ROLE SPECIFICATION
    // ------------------------------------------------------------------
    const maxCutAngleRad = (65 * Math.PI) / 180; // Filter cut angles > 65 degrees

    for (const target of legalBalls) {
      for (const pocket of POCKETS) {
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
        if (dot <= 0.1) continue;

        const cutAngle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (cutAngle > maxCutAngleRad) continue; // Filter out cut angles > 65 degrees

        // Prioritize target ball closest to a pocket to ensure consistent simple play
        const score = 1000 - distPocket * 2.0 - cutAngle * 150 - distCue * 0.2;

        if (!bestShot || score > bestShot.score) {
          const aimAngle = Math.atan2(cueDy, cueDx);
          const power = Math.max(0.35, Math.min(0.75, (distCue + distPocket) / 600));
          bestShot = { aimAngle, power, score };
        }
      }
    }

    // DEFENSE: If no immediate pots found (cut angle <= 65 deg), execute a basic contact shot (excluding 8-Ball)
    if (!bestShot) {
      const target = (hasRemainingGroupBalls ? legalBalls.find((b) => b.number !== 8) : null) || legalBalls[0] || activeBalls[0];
      const aimAngle = Math.atan2(target.y - cueY, target.x - cueX);
      bestShot = { aimAngle, power: 0.35, score: 0 };
    }

    // PRECISION MODIFIER: Minor random noise offset between +/- 1.0 to 1.5 degrees
    const sign = Math.random() < 0.5 ? -1 : 1;
    const noiseDegrees = 1.0 + Math.random() * 0.5; // 1.0 to 1.5 deg
    const noiseRad = sign * ((noiseDegrees * Math.PI) / 180);

    return {
      aimAngle: bestShot.aimAngle + noiseRad,
      power: bestShot.power,
      cueX,
      cueY,
    };
  }

  // MASTER AI (0 Noise, 100% Precision)
  if (!bestShot) {
    const target = legalBalls[0] || activeBalls[0];
    const aimAngle = Math.atan2(target.y - cueY, target.x - cueX);
    bestShot = { aimAngle, power: 0.5, score: 0 };
  }

  return {
    aimAngle: bestShot.aimAngle,
    power: bestShot.power,
    cueX,
    cueY,
  };
}

export function finalizeShotRules(game: GameState): GameState {
  return PoolRuleEngine.evaluateShotEnd(game);
}
