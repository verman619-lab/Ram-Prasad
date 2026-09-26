import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inverbrass CRM",
  description: "Requirement, sourcing, quotation and order control for defence contracts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
