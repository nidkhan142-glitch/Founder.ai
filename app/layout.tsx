import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FounderAI — The AI Accountability System",
  description: "Force intellectual honesty before wasting months building the wrong thing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
