import PoolGame3D from "@/components/PoolGame3D";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center justify-between">
      {/* Visually hidden but crawlable content for SEO */}
      <div className="sr-only">
        <h1>8 Ball Pool – Play Free Online Billiards Game</h1>
        <p>
          Welcome to 8 Ball Pool, the most realistic free online billiards game.
          Enjoy stunning 3D graphics, true-to-life pool physics, and challenging
          AI opponents — all in your browser with no download required. Whether
          you are a casual player or a pool pro, our game delivers an authentic
          cue-sports experience. Play 8 ball pool, practice your trick shots,
          and compete against smart AI in this beautifully crafted web game.
        </p>
        <h2>Game Features</h2>
        <ul>
          <li>Realistic 3D pool table with lifelike ball physics</li>
          <li>Smart AI opponents with adjustable difficulty</li>
          <li>Beautiful graphics and smooth animations</li>
          <li>Play instantly in any modern browser</li>
          <li>No download or installation required</li>
          <li>Free to play billiards game</li>
          <li>Touch-friendly for mobile devices</li>
        </ul>
      </div>
      <PoolGame3D />
    </main>
  );
}

