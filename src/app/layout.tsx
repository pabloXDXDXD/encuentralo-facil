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
  themeColor: "#b45309",
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
      <body className="min-h-dvh bg-stone-50 text-stone-900">
        <ServiceWorkerRegister />
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              📍 DóndeHay
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/como-funciona" className="text-stone-500">
                Cómo funciona
              </Link>
              <Link href="/reportar" className="rounded-full bg-amber-600 px-3 py-1.5 font-semibold text-white">
                + Reportar
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-xl px-4 pb-24 pt-3">{children}</main>
        <PendingChip />
      </body>
    </html>
  );
}
