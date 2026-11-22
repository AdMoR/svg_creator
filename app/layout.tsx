import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SVG Drawer: text to SVG with GRPO",
  description: "Training a 0.8B model to draw SVGs, scored by a rubric judge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
