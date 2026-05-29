import type { Metadata, Viewport } from "next";
import { Raleway, Fira_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import SentryBootstrap from "@/components/SentryBootstrap";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

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
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DringDring",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
          <SentryBootstrap />
          <ServiceWorkerRegister />
          {children}
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
