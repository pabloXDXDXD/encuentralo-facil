import ReportFlow from "@/components/ReportFlow";
import { listBarrios } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportar — DóndeHay" };

type Props = {
  searchParams?: Promise<{ provincia?: string }>;
};

export default async function ReportarPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const provincia = params.provincia ?? null;

  let barrios: string[] = [];
  try {
    barrios = await listBarrios(provincia);
  } catch {
    /* flow still works with an empty filter */
  }

  return (
    <div className="space-y-3">
      <h1 className="px-1 font-display text-xl">Reportar</h1>
      {provincia && (
        <p className="px-1 text-xs text-ink-soft">Provincia activa: {provincia}</p>
      )}
      <ReportFlow barrios={barrios} provincia={provincia} />
    </div>
  );
}
