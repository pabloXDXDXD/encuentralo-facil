import ReportFlow from "@/components/ReportFlow";
import { listBarrios } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportar — DóndeHay" };

export default async function ReportarPage() {
  let barrios: string[] = [];
  try {
    barrios = await listBarrios();
  } catch {
    /* flow still works with an empty filter */
  }

  return (
    <div className="space-y-3">
      <h1 className="px-1 text-xl font-bold">Reportar</h1>
      <ReportFlow barrios={barrios} />
    </div>
  );
}
