import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Battle Royale",
  description: "Four AI personas compete for the next conversational turn.",
  icons: {
    icon: "/agent-mark.png",
    shortcut: "/agent-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
