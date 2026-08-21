import Link from "next/link";

export const metadata = { title: "Cómo funciona — DóndeHay" };

const RULES = [
  ["📍", "Reportes de la comunidad", "Cualquier persona reporta qué hay en cada tienda. Sin cuenta, sin registro, sin datos personales."],
  ["⏳", "La información caduca", "Un reporte vale menos con el tiempo y desaparece del listado a las 6 horas. Lo que ves está fresco."],
  ["👥", "Varios ojos, más confianza", "Cuando varias personas confirman lo mismo, el reporte gana fuerza en el listado."],
  ["📴", "Funciona sin internet", "Puedes hacer reportes durante un apagón: se envían solos cuando vuelve la conexión."],
];

export default function ComoFuncionaPage() {
  return (
    <div className="space-y-4">
      <h1 className="px-1 text-xl font-bold">Cómo funciona</h1>
      {RULES.map(([emoji, title, body]) => (
        <section key={title} className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="font-semibold">
            <span className="mr-2">{emoji}</span>
            {title}
          </p>
          <p className="mt-1 text-sm text-stone-600">{body}</p>
        </section>
      ))}
      <Link
        href="/reportar"
        className="block rounded-full bg-amber-600 py-3 text-center font-bold text-white"
      >
        Empezar a reportar
      </Link>
    </div>
  );
}
