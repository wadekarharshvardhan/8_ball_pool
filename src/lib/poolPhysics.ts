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

        // 3D Roll Rotation Tumble Update
        const rollAngle = (speed * dt) / BALL_RADIUS;
        const dirX = ball.vx / (speed || 1);
        const dirY = ball.vy / (speed || 1);
        ball.rotX += dirY * rollAngle;
        ball.rotZ -= dirX * rollAngle;
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

export function finalizeShotRules(game: GameState): GameState {
  return PoolRuleEngine.evaluateShotEnd(game);
}
