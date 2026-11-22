import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: APP_NAME,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
