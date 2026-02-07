import type { Metadata } from "next";
import { Raleway, Fira_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";

const dringSans = Raleway({
  variable: "--font-dringsans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const dringMono = Fira_Mono({
  variable: "--font-dringmono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "DringDring - Livraison cyclable",
  description: "Plateforme de logistique cyclable locale et responsable.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${dringSans.variable} ${dringMono.variable} antialiased font-sans`}
        suppressHydrationWarning
      >
        <LanguageProvider>
          {children}
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
