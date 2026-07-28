import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="min-h-screen w-full flex flex-col landscape:flex-row items-center justify-center landscape:justify-center landscape:gap-10 px-6 py-8 landscape:py-4"
      style={{ background: "#111111" }}
    >
      {/* 8-ball with 404 */}
      <div className="relative mb-10 landscape:mb-0 shrink-0">
        <div
          className="w-44 h-44 sm:w-56 sm:h-56 landscape:w-32 landscape:h-32 landscape:sm:w-44 landscape:sm:h-44 landscape:lg:w-56 landscape:lg:h-56 rounded-full flex items-center justify-center"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, #444 0%, #0a0a0a 60%, #000 100%)",
            boxShadow:
              "0 12px 40px rgba(0,0,0,0.7), inset 0 -4px 12px rgba(0,0,0,0.5)",
          }}
        >
          {/* White number circle */}
          <div
            className="w-20 h-20 sm:w-24 sm:h-24 landscape:w-14 landscape:h-14 landscape:sm:w-20 landscape:sm:h-20 landscape:lg:w-24 landscape:lg:h-24 rounded-full flex items-center justify-center"
            style={{
              background:
                "radial-gradient(circle at 40% 35%, #ffffff 0%, #e8e8e8 100%)",
              boxShadow: "inset 0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            <span
              className="font-bebas text-5xl sm:text-6xl landscape:text-3xl landscape:sm:text-5xl landscape:lg:text-6xl text-slate-900 tracking-wider"
              style={{ fontFamily: "var(--font-bebas), sans-serif" }}
            >
              404
            </span>
          </div>
          {/* Glossy reflection */}
          <div
            className="absolute top-3 left-7 sm:top-4 sm:left-9 landscape:top-2 landscape:left-5 landscape:sm:top-3 landscape:sm:left-7 w-12 h-8 sm:w-16 sm:h-10 landscape:w-8 landscape:h-5 landscape:sm:w-12 landscape:sm:h-8 rounded-full"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)",
              transform: "rotate(-30deg)",
            }}
          />
        </div>
      </div>

      {/* Text + button group */}
      <div className="flex flex-col items-center landscape:items-start">
        {/* Message */}
        <p
          className="text-center landscape:text-left text-slate-400 text-2xl sm:text-3xl landscape:text-xl landscape:sm:text-2xl landscape:lg:text-3xl max-w-lg leading-snug"
          style={{
            fontFamily: "var(--font-bebas), sans-serif",
            letterSpacing: "0.04em",
          }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Back link */}
        <Link
          href="/"
          className="mt-10 landscape:mt-5 inline-flex items-center gap-3 px-8 py-3.5 landscape:px-6 landscape:py-2.5 rounded-xl font-semibold text-white text-base landscape:text-sm landscape:sm:text-base transition-all duration-200 hover:brightness-110"
          style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Game
        </Link>
      </div>
    </main>
  );
}
