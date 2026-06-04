import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tiny DB Browser",
  description: "A tiny database browser.",
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
