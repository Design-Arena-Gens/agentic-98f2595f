export const metadata = {
  title: "YouTube 720p Video Generator",
  description: "Generate a 720p WebM video suitable for YouTube.",
};

import "./globals.css";
import React from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

