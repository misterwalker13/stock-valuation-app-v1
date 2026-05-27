import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triton | Stock Valuation Dashboard",
  description: "A login-protected dashboard for managing stock ticker workflows and valuation review.",
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
