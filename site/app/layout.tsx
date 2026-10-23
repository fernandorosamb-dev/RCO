import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RCO | Manutenção Predial · Depósito BB Sorocaba",
  description: "Plano de manutenção preventivo e corretivo predial do Depósito BB em Sorocaba, SP.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
