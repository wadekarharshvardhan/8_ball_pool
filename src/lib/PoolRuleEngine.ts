// Official 8-Ball Pool Rule Engine & State Machine Architect
import { soundEngine } from "./audio";

export type PlayerId = 1 | 2;
export type Group = "solids" | "stripes";
export type BallKind = "cue" | "solid" | "stripe" | "eight";
export type TableState = "open" | "assigned";
export type GamePhase = "break" | "normal" | "ball_in_hand" | "game_over";

export interface BallState {
  id: number;
  number: number;
  kind: BallKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  topSpin: number;
  sideSpin: number;
  pocketed: boolean;
  pocketAnimProgress: number;
  fallingPocketIndex: number | null;
  frozenCushion?: "left" | "right" | "top" | "bottom" | null;
}

export interface Pocket {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export interface ShotTracker {
  player: PlayerId;
  cuePocketed: boolean;
  cueDrivenOffTable: boolean;
  objectBallsDrivenOffTable: number[];
  pocketedNumbers: number[];
  eightPocketIndex: number | null;
  firstContactBallNumber: number | null;
  railHitAfterContact: boolean;
}

export interface GameState {
  balls: BallState[];
  turn: PlayerId;
  tableState: TableState;
  gamePhase: GamePhase;
  groups: Record<PlayerId, Group | null>;
  calledPocket: Record<PlayerId, number | null>;
  ballInHand: boolean;
  kitchenOnlyBallInHand: boolean; // True if scratch on break shot
  winner: PlayerId | null;
  moving: boolean;
  aiming: boolean;
  aimAngle: number;
  aimPower: number;
  cueSpin: { top: number; side: number };
  shot: ShotTracker | null;
  message: string;
  pocketedHistory: number[];
  gameMode: "pvp" | "ai" | "practice";
}

// Table Constants
export const TABLE_WIDTH = 860;
export const TABLE_HEIGHT = 480;
export const BALL_RADIUS = 12;
export const POCKET_RADIUS = 24;

export const PLAY_LEFT = 44;
export const PLAY_RIGHT = TABLE_WIDTH - 44;
export const PLAY_TOP = 44;
export const PLAY_BOTTOM = TABLE_HEIGHT - 44;

export const CUE_START = { x: 215, y: TABLE_HEIGHT / 2 };
export const RACK_ANCHOR = { x: 620, y: TABLE_HEIGHT / 2 };

export const POCKETS: Pocket[] = [
  { id: 0, x: PLAY_LEFT - 4, y: PLAY_TOP - 4, radius: POCKET_RADIUS + 4 },
  { id: 1, x: TABLE_WIDTH / 2, y: PLAY_TOP - 10, radius: POCKET_RADIUS + 2 },
  { id: 2, x: PLAY_RIGHT + 4, y: PLAY_TOP - 4, radius: POCKET_RADIUS + 4 },
  { id: 3, x: PLAY_LEFT - 4, y: PLAY_BOTTOM + 4, radius: POCKET_RADIUS + 4 },
  { id: 4, x: TABLE_WIDTH / 2, y: PLAY_BOTTOM + 10, radius: POCKET_RADIUS + 2 },
  { id: 5, x: PLAY_RIGHT + 4, y: PLAY_BOTTOM + 4, radius: POCKET_RADIUS + 4 },
];

export const SOLID_COLORS: Record<number, string> = {
  1: "#f59e0b",
  2: "#2563eb",
  3: "#dc2626",
  4: "#7c3aed",
  5: "#ea580c",
  6: "#16a34a",
  7: "#854d0e",
};

export const BALL_SPRITE_GRID: Record<number, { row: number; col: number }> = {
  1: { row: 0, col: 0 },
  2: { row: 0, col: 1 },
  3: { row: 0, col: 2 },
  4: { row: 0, col: 3 },
  5: { row: 1, col: 0 },
  6: { row: 1, col: 1 },
  7: { row: 1, col: 2 },
  8: { row: 1, col: 3 },
  9: { row: 2, col: 0 },
  10: { row: 2, col: 1 },
  11: { row: 2, col: 2 },
  12: { row: 2, col: 3 },
  13: { row: 3, col: 0 },
  14: { row: 3, col: 1 },
  15: { row: 3, col: 2 },
  0: { row: 3, col: 3 },
};

function shuffle<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function getGroup(number: number): Group {
  return number <= 7 ? "solids" : "stripes";
}

export function getBallColor(number: number, kind: BallKind): string {
  if (kind === "cue") return "#f8fafc";
  if (kind === "eight") return "#0f172a";
  if (kind === "stripe") return SOLID_COLORS[number - 8];
  return SOLID_COLORS[number];
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 1 ? 2 : 1;
}

// Check if cue ball overlaps any active object ball OR is placed inside/near a pocket during Ball-in-Hand
export function isCueBallOverlapping(game: GameState, testX: number, testY: number): boolean {
  // A. Overlap with active object balls
  for (const b of game.balls) {
    if (b.number === 0 || b.pocketed) continue;

    const dist = Math.hypot(testX - b.x, testY - b.y);
    if (dist < BALL_RADIUS * 2.0) {
      return true;
    }
  }

  // B. Proximity to pockets (Cannot place cue ball directly inside or on the edge of a pocket!)
  for (const pocket of POCKETS) {
    const dist = Math.hypot(testX - pocket.x, testY - pocket.y);
    if (dist < pocket.radius + BALL_RADIUS - 4) {
      return true;
    }
  }

  return false;
}

// OFFICIAL 8-BALL TRIANGLE RACK GENERATOR
export function createRackBalls(): BallState[] {
  const solids = shuffle([1, 2, 3, 4, 5, 6, 7]);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15]);

  const cornerSolid = solids.pop()!;
  const cornerStripe = stripes.pop()!;
  const remaining = shuffle([...solids, ...stripes]);

  const spacingX = BALL_RADIUS * 2.02;
  const spacingY = BALL_RADIUS * 2.02;
  const slots: { x: number; y: number }[] = [];

  for (let row = 0; row < 5; row++) {
    const rowX = RACK_ANCHOR.x + row * spacingX;
    const startY = RACK_ANCHOR.y - (row * spacingY) / 2;

    for (let col = 0; col <= row; col++) {
      slots.push({ x: rowX, y: startY + col * spacingY });
    }
  }

  const rackNumbers = new Array<number>(15);

  // Slot 4: 8-Ball in center of 3rd row
  rackNumbers[4] = 8;

  // Slot 10 & 14: Bottom-Left and Bottom-Right corners of 5th row
  rackNumbers[10] = cornerSolid;
  rackNumbers[14] = cornerStripe;

  let remIdx = 0;
  for (let i = 0; i < 15; i++) {
    if (i !== 4 && i !== 10 && i !== 14) {
      rackNumbers[i] = remaining[remIdx++];
    }
  }

  return rackNumbers.map((number, idx) => {
    const kind: BallKind = number === 8 ? "eight" : number <= 7 ? "solid" : "stripe";
    return {
      id: idx + 1,
      number,
      kind,
      x: slots[idx].x,
      y: slots[idx].y,
      vx: 0,
      vy: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      topSpin: 0,
      sideSpin: 0,
      pocketed: false,
      pocketAnimProgress: 0,
      fallingPocketIndex: null,
      frozenCushion: null,
    };
  });
}

export function createInitialGameState(mode: "pvp" | "ai" | "practice" = "pvp"): GameState {
  return {
    balls: [
      {
        id: 0,
        number: 0,
        kind: "cue",
        x: CUE_START.x,
        y: CUE_START.y,
        vx: 0,
        vy: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        topSpin: 0,
        sideSpin: 0,
        pocketed: false,
        pocketAnimProgress: 0,
        fallingPocketIndex: null,
        frozenCushion: null,
      },
      ...createRackBalls(),
    ],
    turn: 1,
    tableState: "open",
    gamePhase: "break",
    groups: { 1: null, 2: null },
    calledPocket: { 1: null, 2: null },
    ballInHand: true,
    kitchenOnlyBallInHand: true,
    winner: null,
    moving: false,
    aiming: false,
    aimAngle: 0,
    aimPower: 0,
    cueSpin: { top: 0, side: 0 },
    shot: null,
    message: "Break Shot! Position the white cue ball behind the headstring and take your shot.",
    pocketedHistory: [],
    gameMode: mode,
  };
}

export function countGroupBalls(game: GameState, group: Group): number {
  return game.balls.filter(
    (b) => !b.pocketed && b.number !== 0 && b.number !== 8 && getGroup(b.number) === group
  ).length;
}

export function resetCueBall(game: GameState, kitchenOnly = false) {
  const cue = game.balls[0];
  cue.x = CUE_START.x;
  cue.y = CUE_START.y;
  cue.vx = 0;
  cue.vy = 0;
  cue.topSpin = 0;
  cue.sideSpin = 0;
  cue.pocketed = false;
  cue.pocketAnimProgress = 0;
  cue.fallingPocketIndex = null;
  game.ballInHand = true;
  game.kitchenOnlyBallInHand = kitchenOnly;
}

// ----------------------------------------------------------------------
// OFFICIAL STATE MACHINE & RULE ENGINE EVALUATION
// ----------------------------------------------------------------------
export class PoolRuleEngine {

  public static onShotStart(game: GameState, shotPowerRatio: number): ShotTracker {
    // Detect frozen balls touching rails before shot
    game.balls.forEach((b) => {
      if (b.pocketed) return;
      if (b.x <= PLAY_LEFT + BALL_RADIUS + 0.5) b.frozenCushion = "left";
      else if (b.x >= PLAY_RIGHT - BALL_RADIUS - 0.5) b.frozenCushion = "right";
      else if (b.y <= PLAY_TOP + BALL_RADIUS + 0.5) b.frozenCushion = "top";
      else if (b.y >= PLAY_BOTTOM - BALL_RADIUS - 0.5) b.frozenCushion = "bottom";
      else b.frozenCushion = null;
    });

    const tracker: ShotTracker = {
      player: game.turn,
      cuePocketed: false,
      cueDrivenOffTable: false,
      objectBallsDrivenOffTable: [],
      pocketedNumbers: [],
      eightPocketIndex: null,
      firstContactBallNumber: null,
      railHitAfterContact: false,
    };

    game.shot = tracker;
    return tracker;
  }

  public static evaluateShotEnd(game: GameState): GameState {
    if (!game.shot) return game;

    const shot = game.shot;
    const player = shot.player;

    // SOLO PRACTICE MODE: Direct free play without Player 1 / Player 2 turn switching or fouls!
    if (game.gameMode === "practice") {
      if (shot.cuePocketed || shot.cueDrivenOffTable) {
        resetCueBall(game, false);
        game.message = "Practice: Cue ball pocketed! Ball-in-Hand granted.";
      } else {
        const pocketedCount = shot.pocketedNumbers.length;
        if (pocketedCount > 0) {
          game.message = `Practice: Pocketed ${pocketedCount} ball(s)! Great shot!`;
        } else {
          game.message = "Solo Practice: Direct play active. Aim and shoot!";
        }
      }

      // Check if all 15 object balls have been cleared from the table!
      const remainingObjectBalls = game.balls.filter((b) => !b.pocketed && b.number !== 0);
      if (remainingObjectBalls.length === 0) {
        game.winner = 1;
        game.message = "🎉 Rack Cleared! Outstanding performance in Solo Practice Mode!";
        game.shot = null;
        return game;
      }

      game.turn = 1;
      game.shot = null;
      return game;
    }

    const opponent = otherPlayer(player);
    const playerGroup = game.groups[player];
    const isBreakShot = game.gamePhase === "break";

    const eightPocketed = shot.pocketedNumbers.includes(8);
    const eightDrivenOff = shot.objectBallsDrivenOffTable.includes(8);
    const objectPocketed = shot.pocketedNumbers.filter((n) => n !== 8);

    // ------------------------------------------------------------------
    // A. 8-BALL DRIVEN OFF TABLE INSTANT LOSS CHECK
    // ------------------------------------------------------------------
    if (eightDrivenOff) {
      game.winner = opponent;
      game.message = `FOUL & LOSS! 8-Ball driven off the table! Player ${opponent} wins!`;
      game.gamePhase = "game_over";
      game.shot = null;
      return game;
    }

    // ------------------------------------------------------------------
    // B. BREAK SHOT SPECIAL EVALUATION
    // ------------------------------------------------------------------
    if (isBreakShot) {
      game.gamePhase = "normal";

      // B1. 8-Ball Pocketed on Break
      if (eightPocketed) {
        if (shot.cuePocketed || shot.cueDrivenOffTable) {
          game.winner = opponent;
          game.message = `FOUL & LOSS! Player ${player} pocketed the 8-Ball and scratched on the break! Player ${opponent} wins!`;
          game.shot = null;
          return game;
        } else {
          const eightBall = game.balls.find((b) => b.number === 8);
          if (eightBall) {
            eightBall.pocketed = false;
            eightBall.x = RACK_ANCHOR.x;
            eightBall.y = RACK_ANCHOR.y;
            eightBall.vx = 0;
            eightBall.vy = 0;
          }
          game.message = `8-Ball pocketed on Break! 8-Ball spotted back on foot spot. Player ${player} continues turn.`;
          game.shot = null;
          return game;
        }
      }

      // B2. Scratch / Cue Driven Off on Break
      if (shot.cuePocketed || shot.cueDrivenOffTable) {
        resetCueBall(game, true);
        game.turn = opponent;
        soundEngine.playFoul();
        game.message = `Scratch on Break! Player ${opponent} gets Ball-in-Hand behind the headstring.`;
        game.shot = null;
        return game;
      }

      // B3. Balls pocketed on Break -> Table remains OPEN, player continues turn
      if (objectPocketed.length > 0) {
        game.message = `Break successful! Table remains OPEN. Player ${player}'s turn.`;
        game.shot = null;
        return game;
      } else {
        game.turn = opponent;
        game.message = `No balls pocketed on Break. Player ${opponent}'s turn.`;
        game.shot = null;
        return game;
      }
    }

    // ------------------------------------------------------------------
    // C. FOUL EVALUATION (Normal Play Phase)
    // ------------------------------------------------------------------
    let foulOccurred = false;
    let foulReason = "";

    // C1. Scratch Foul (Cue ball pocketed)
    if (shot.cuePocketed) {
      foulOccurred = true;
      foulReason = "Scratch! Cue ball pocketed.";
    }
    // C2. Cue Ball Driven Off Table
    else if (shot.cueDrivenOffTable) {
      foulOccurred = true;
      foulReason = "Scratch! Cue ball driven off table.";
    }
    // C3. Object Ball Driven Off Table
    else if (shot.objectBallsDrivenOffTable.length > 0) {
      foulOccurred = true;
      foulReason = `Foul! Ball #${shot.objectBallsDrivenOffTable.join(", #")} driven off table.`;
    }
    // C4. No Contact Foul (Cue ball hit no ball at all)
    else if (shot.firstContactBallNumber === null) {
      foulOccurred = true;
      foulReason = "Foul! Cue ball missed all object balls.";
    }
    // C5. Early 8-Ball Contact Foul & Wrong First Contact
    else {
      const firstContact = shot.firstContactBallNumber;
      const remainingGroupBalls = playerGroup ? countGroupBalls(game, playerGroup) : 7;
      const isPlayerOn8Ball = playerGroup !== null && remainingGroupBalls === 0;

      if (game.tableState === "open") {
        if (firstContact === 8) {
          foulOccurred = true;
          foulReason = "Foul! Hit 8-Ball early on open table. Opponent gets Ball-in-Hand.";
        }
      } else {
        if (!isPlayerOn8Ball && firstContact === 8) {
          foulOccurred = true;
          foulReason = "Foul! Hit 8-Ball early. Opponent gets Ball-in-Hand.";
        } else if (isPlayerOn8Ball && firstContact !== 8) {
          foulOccurred = true;
          foulReason = `Foul! Player ${player} is on the 8-Ball and must hit Ball #8 first.`;
        } else if (!isPlayerOn8Ball) {
          const contactGroup = getGroup(firstContact);
          if (contactGroup !== playerGroup) {
            foulOccurred = true;
            foulReason = `Foul! First contact was Ball #${firstContact} (${contactGroup}) instead of your assigned ${playerGroup}.`;
          }
        }
      }

      // C6. No Rail / No Pocket Contact Foul (Frozen Ball Rule aware)
      if (!foulOccurred && !shot.railHitAfterContact && shot.pocketedNumbers.length === 0) {
        foulOccurred = true;
        foulReason = "Foul! No ball hit a rail or was pocketed after contact.";
      }
    }

    // ------------------------------------------------------------------
    // D. 8-BALL WIN / LOSS CONDITIONS EVALUATION
    // ------------------------------------------------------------------
    if (eightPocketed) {
      const remainingGroupBalls = playerGroup ? countGroupBalls(game, playerGroup) : 7;
      const isPlayerOn8Ball = playerGroup !== null && remainingGroupBalls === 0;
      const targetPocket = game.calledPocket[player];

      if (shot.cuePocketed || shot.cueDrivenOffTable) {
        game.winner = opponent;
        game.message = `FOUL & LOSS! Player ${player} pocketed the 8-Ball and scratched! Player ${opponent} wins!`;
      } else if (!isPlayerOn8Ball) {
        game.winner = opponent;
        game.message = `FOUL & LOSS! Pocketed 8-Ball prematurely before clearing group balls! Player ${opponent} wins!`;
      } else if (targetPocket === null || targetPocket === undefined) {
        game.winner = opponent;
        game.message = `FOUL & LOSS! Player ${player} pocketed the 8-Ball without selecting a called pocket! Player ${opponent} wins!`;
      } else if (shot.eightPocketIndex !== targetPocket) {
        const actualPocketNum = shot.eightPocketIndex !== undefined && shot.eightPocketIndex !== null ? shot.eightPocketIndex + 1 : 0;
        game.winner = opponent;
        game.message = `FOUL & LOSS! Player ${player} pocketed the 8-Ball in Pocket #${actualPocketNum} instead of called Pocket #${targetPocket + 1}! Player ${opponent} wins!`;
      } else if (foulOccurred) {
        game.winner = opponent;
        game.message = `FOUL & LOSS! Player ${player} committed a foul on the 8-Ball shot! Player ${opponent} wins!`;
      } else {
        game.winner = player;
        game.message = `VICTORY! Player ${player} legally pocketed the 8-Ball into called Pocket #${targetPocket + 1}!`;
      }

      game.gamePhase = "game_over";
      game.shot = null;
      return game;
    }

    // ------------------------------------------------------------------
    // E. FOUL PENALTY PROCESSING
    // ------------------------------------------------------------------
    if (foulOccurred) {
      if (shot.cuePocketed || shot.cueDrivenOffTable) {
        resetCueBall(game, false);
      } else {
        game.ballInHand = true;
        game.kitchenOnlyBallInHand = false;
      }

      game.turn = opponent;
      soundEngine.playFoul();
      game.message = `${foulReason} Player ${opponent} gets Ball-in-Hand!`;
      game.shot = null;
      return game;
    }

    // ------------------------------------------------------------------
    // F. GROUP ASSIGNMENT ON OPEN TABLE
    // ------------------------------------------------------------------
    if (game.tableState === "open" && objectPocketed.length > 0) {
      const firstPocketed = objectPocketed[0];
      const assignedGroup = getGroup(firstPocketed);

      game.groups[player] = assignedGroup;
      game.groups[opponent] = assignedGroup === "solids" ? "stripes" : "solids";
      game.tableState = "assigned";

      game.message = `Player ${player} pocketed Ball #${firstPocketed} and is assigned ${assignedGroup}!`;
      game.shot = null;
      return game;
    }

    // ------------------------------------------------------------------
    // G. TURN CONTINUATION & SWITCHING
    // ------------------------------------------------------------------
    const currentGroup = game.groups[player];
    const pocketedOwnGroup = currentGroup
      ? objectPocketed.some((n) => getGroup(n) === currentGroup)
      : objectPocketed.length > 0;

    if (pocketedOwnGroup) {
      const isNowOn8Ball = currentGroup ? countGroupBalls(game, currentGroup) === 0 : false;
      const targetText = isNowOn8Ball ? " 🎯 Select a pocket to call your 8-Ball!" : "";
      game.message = `Player ${player} sunk a ball and keeps turn!${targetText}`;
    } else {
      game.turn = opponent;
      const opponentGroup = game.groups[opponent];
      const isOpponentOn8Ball = opponentGroup ? countGroupBalls(game, opponentGroup) === 0 : false;
      const targetText = isOpponentOn8Ball ? " 🎯 Select a pocket to call your 8-Ball!" : "";
      game.message = `Player ${opponent}'s turn.${targetText}`;
    }

    game.shot = null;
    return game;
  }
}
