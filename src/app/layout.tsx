import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Open_Sans } from "next/font/google";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#080b10",
};

export const metadata: Metadata = {
  title: "8 Ball Pool - Classic Billiards",
  description: "A classic, elegant 8-Ball Pool web game with 3D physics and AI opponents.",
  icons: {
    icon: [
      { url: "/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon_io/favicon.ico",
    apple: "/favicon_io/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${openSans.variable} font-sans h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#080b10] text-slate-100 font-sans">{children}</body>
    </html>
  );
}
