import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eburon Codepilot – Autopilot",
  description:
    "Eburon Codepilot Autopilot — AI-powered coding assistant with CLI auto-detection",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-gray-950">{children}</body>
    </html>
  );
}
