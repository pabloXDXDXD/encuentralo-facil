import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PendingChip from "@/components/PendingChip";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "DóndeHay — ¿dónde hay?",
  description:
    "Reportes comunitarios de qué productos hay en cada tienda de La Habana, actualizados en tiempo real.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "es_CU",
    siteName: "DóndeHay",
    title: "DóndeHay — ¿dónde hay?",
    description:
      "Reportes comunitarios de qué productos hay en cada tienda de La Habana, actualizados en tiempo real.",
  },
  twitter: { card: "summary" },
};

export const viewport: Viewport = {
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-dvh bg-paper text-ink">
        <ServiceWorkerRegister />
        <header className="sticky top-0 z-40 border-b-2 border-ink bg-ink text-paper">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-2.5">
            <Link href="/" className="flex items-center gap-2" aria-label="DóndeHay inicio">
              <span aria-hidden className="inline-block h-3 w-3 rotate-45 bg-accent" />
              <span className="font-display text-xl leading-none">DóndeHay</span>
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/como-funciona" className="text-paper/70 underline-offset-4 hover:text-paper hover:underline">
                Cómo funciona
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-xl px-4 pb-24 pt-4">{children}</main>
        <footer className="border-t-2 border-dashed border-line py-6 text-center text-xs text-ink-soft">
          Hecho por y para el barrio · los reportes caducan a las 6 horas
        </footer>
        <PendingChip />
      </body>
    </html>
  );
}
