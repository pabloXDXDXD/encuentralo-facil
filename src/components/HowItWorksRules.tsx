"use client";

import Link from "next/link";
import { ClockCounterClockwise, Eyes, Users, WifiSlash } from "@phosphor-icons/react";

// Phosphor icons need a client boundary (they use createContext), so the
// rules list lives here and the page imports this component.

const RULES = [
  {
    icon: Users,
    title: "Reportes de la comunidad",
    body: "Cualquier persona reporta qué hay en cada tienda. Sin cuenta, sin registro, sin datos personales.",
  },
  {
    icon: ClockCounterClockwise,
    title: "La información caduca",
    body: "Un reporte vale menos con el tiempo y desaparece del listado a las 6 horas. Lo que ves está fresco.",
  },
  {
    icon: Eyes,
    title: "Varios ojos, más confianza",
    body: "Cuando varias personas confirman lo mismo, el reporte gana fuerza. Si lo desmienten, pierde hasta desaparecer.",
  },
  {
    icon: WifiSlash,
    title: "Funciona sin internet",
    body: "Puedes hacer reportes durante un apagón: se envían solos cuando vuelve la conexión.",
  },
];

export default function HowItWorksRules() {
  return (
    <>
      {RULES.map(({ icon: Icon, title, body }) => (
        <section key={title} className="card-ticket p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-card"
            >
              <Icon size={20} weight="duotone" className="text-accent" />
            </span>
            <div>
              <p className="font-display text-lg leading-tight tracking-wide">{title}</p>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </div>
          </div>
        </section>
      ))}
      <Link href="/reportar" className="btn btn-primary w-full rounded-md py-3 text-center">
        Empezar a reportar
      </Link>
    </>
  );
}
