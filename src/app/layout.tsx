import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NFL Underdog Pick'em",
  description: "Private season-long NFL underdog pick'em with DraftKings spreads.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
