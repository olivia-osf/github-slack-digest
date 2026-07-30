import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitHub → Slack Issue Digest",
  description: "FDE take-home: connects GitHub and Slack via OAuth and exposes a triggerable webhook.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
