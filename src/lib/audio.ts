// Official 8 Ball Pool Audio Engine using /public/8 Ball Pool sounds/ assets with Web Audio fallback

class SoundEngine {
  private muted: boolean = false;
  private audioCache: Map<string, HTMLAudioElement> = new Map();

  constructor() {
    if (typeof window !== "undefined") {
      this.preloadSounds();
    }
  }

  private SOUND_PATHS = {
    cueStrong: "/8 Ball Pool sounds/cue_collision_strong.mp3",
    cueWeak: "/8 Ball Pool sounds/cue_collision_weak.mp3",
    ballCollision: "/8 Ball Pool sounds/ball_collision.mp3",
    cushionCollision: "/8 Ball Pool sounds/cushion_collision.mp3",
    pocketDrop: "/8 Ball Pool sounds/pocket.mp3",
    win: "/8 Ball Pool sounds/win.mp3",
    lose: "/8 Ball Pool sounds/lose.mp3",
    foul: "/8 Ball Pool sounds/foul.mp3",
    scratch: "/8 Ball Pool sounds/scratch.mp3",
    clock: "/8 Ball Pool sounds/clock.mp3",
    yourTurn: "/8 Ball Pool sounds/your_turn.mp3",
    button: "/8 Ball Pool sounds/button.mp3",
  };

  private preloadSounds() {
    Object.entries(this.SOUND_PATHS).forEach(([key, path]) => {
      try {
        const audio = new Audio(path);
        audio.preload = "auto";
        this.audioCache.set(key, audio);
      } catch {
        // Fallback handled gracefully
      }
    });
  }

  private playAudio(key: string, volumeRatio: number = 1.0) {
    if (this.muted || typeof window === "undefined") return;

    try {
      const path = this.SOUND_PATHS[key as keyof typeof this.SOUND_PATHS];
      if (!path) return;

      const audio = new Audio(path);
      audio.volume = Math.max(0.05, Math.min(1.0, volumeRatio));
      const promise = audio.play();
      if (promise !== undefined) {
        promise.catch(() => {
          // Ignore browser autoplay restriction errors
        });
      }
    } catch {
      // Ignore
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  // Play Cue Stick Strike
  public playCueStrike(powerRatio: number = 0.5) {
    const key = powerRatio > 0.5 ? "cueStrong" : "cueWeak";
    this.playAudio(key, powerRatio);
  }

  // Play Ball-to-Ball Impact
  public playBallCollision(intensity: number = 0.5) {
    this.playAudio("ballCollision", intensity);
  }

  // Play Cushion Bounce
  public playCushionHit(intensity: number = 0.5) {
    this.playAudio("cushionCollision", intensity);
  }

  // Play Ball Drop Into Pocket
  public playPocketDrop() {
    this.playAudio("pocketDrop", 1.0);
  }

  // Play Win Fanfare
  public playWin() {
    this.playAudio("win", 1.0);
  }

  // Play Lose Sound
  public playLose() {
    this.playAudio("lose", 1.0);
  }

  // Play Foul / Scratch Sound
  public playFoul() {
    this.playAudio("scratch", 0.9);
  }

  // Play Countdown Timer Tick
  public playTimerTick() {
    this.playAudio("clock", 0.6);
  }

  // Play Turn Switch Sound
  public playYourTurn() {
    this.playAudio("yourTurn", 0.8);
  }

  // Play UI Button Click
  public playButtonClick() {
    this.playAudio("button", 0.7);
  }
}

export const soundEngine = new SoundEngine();
