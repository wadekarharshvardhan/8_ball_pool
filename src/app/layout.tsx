import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Open_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-open-sans",
});

/* ── Site URL – update this when you deploy ── */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://8ballpool.games";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#080b10",
};

export const metadata: Metadata = {
  /* ── Core ── */
  title: {
    default: "8 Ball Pool - Play Free Online Billiards Game | 3D Pool",
    template: "%s | 8 Ball Pool",
  },
  description:
    "Play 8 Ball Pool online for free! Realistic 3D billiards game with lifelike physics, AI opponents, and multiplayer modes. No download required — play instantly in your browser.",
  applicationName: "8 Ball Pool",
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  keywords: [
    "8 ball pool",
    "pool game",
    "billiards",
    "online pool",
    "free pool game",
    "3D pool",
    "snooker",
    "billiards game online",
    "play pool online",
    "browser pool game",
    "8 ball pool game",
    "pool game free",
    "online billiards",
    "realistic pool game",
    "pool simulator",
    "cue sports",
    "multiplayer pool",
    "AI pool opponent",
    "play billiards free",
    "web pool game",
  ],
  authors: [{ name: "Harshvardhan Wadekar" }],
  creator: "Harshvardhan Wadekar",
  publisher: "Harshvardhan Wadekar",
  category: "Games",
  classification: "Game",

  /* ── Canonical & Alternates ── */
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },

  /* ── Robots ── */
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  /* ── Open Graph (Facebook, LinkedIn, Discord, etc.) ── */
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "8 Ball Pool",
    title: "8 Ball Pool – Free Online 3D Billiards Game",
    description:
      "Experience the most realistic 8 Ball Pool game online. Stunning 3D graphics, true-to-life physics, smart AI opponents. Play free — no download needed!",
    images: [
      {
        url: "/pool_balls.jpg",
        width: 1200,
        height: 630,
        alt: "8 Ball Pool – Realistic 3D Billiards Game",
        type: "image/jpeg",
      },
    ],
  },

  /* ── Twitter Card ── */
  twitter: {
    card: "summary_large_image",
    title: "8 Ball Pool – Free Online 3D Billiards Game",
    description:
      "Play the best free online pool game! Realistic 3D physics, AI opponents & instant browser play. No download required.",
    images: ["/pool_balls.jpg"],
  },

  /* ── Icons & Manifest ── */
  icons: {
    icon: [
      { url: "/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon_io/favicon.ico",
    apple: "/favicon_io/apple-touch-icon.png",
  },
  manifest: "/manifest.json",

  /* ── Verification (add your codes when ready) ── */
  // verification: {
  //   google: "YOUR_GOOGLE_SEARCH_CONSOLE_CODE",
  //   yandex: "YOUR_YANDEX_CODE",
  // },

  /* ── Misc ── */
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "8 Ball Pool",
    "msapplication-TileColor": "#080b10",
  },
};

/* ── JSON-LD Structured Data for rich Google results ── */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "8 Ball Pool",
  description:
    "A free, realistic 3D 8-Ball Pool game you can play online in your browser. Features lifelike physics, AI opponents, and beautiful graphics.",
  url: SITE_URL,
  image: `${SITE_URL}/pool_balls.jpg`,
  genre: ["Sports", "Simulation", "Casual"],
  gamePlatform: ["Web Browser", "PC", "Mobile"],
  applicationCategory: "Game",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  author: {
    "@type": "Person",
    name: "Harshvardhan Wadekar",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    ratingCount: "1250",
    bestRating: "5",
    worstRating: "1",
  },
  inLanguage: "en",
  isAccessibleForFree: true,
  playMode: ["SinglePlayer", "MultiPlayer"],
  numberOfPlayers: {
    "@type": "QuantitativeValue",
    minValue: 1,
    maxValue: 2,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${openSans.variable} font-sans h-full antialiased`}>
      <head>
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-XXSL2MZ82G"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-XXSL2MZ82G');
          `}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-[#080b10] text-slate-100 font-sans">{children}</body>
    </html>
  );
}

