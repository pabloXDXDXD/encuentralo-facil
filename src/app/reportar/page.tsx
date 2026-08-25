import ReportFlow from "@/components/ReportFlow";
import { getStoreById, getProductBySlug, listBarrios } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportar — DóndeHay" };

type Props = {
  searchParams?: Promise<{ provincia?: string; producto?: string; store?: string }>;
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

  // Prefill via URL: /reportar?producto=<slug> and/or ?store=<id>.
  let initialProduct: { id: string; slug: string; name: string; emoji: string } | null = null;
  if (params.producto) {
    try {
      initialProduct = await getProductBySlug(params.producto);
    } catch {
      initialProduct = null;
    }
  }
  let initialStore: { id: string; name: string } | null = null;
  if (params.store) {
    try {
      initialStore = await getStoreById(params.store);
    } catch {
      initialStore = null;
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="px-1 font-display text-xl">Reportar</h1>
      {provincia && (
        <p className="px-1 text-xs text-ink-soft">Provincia activa: {provincia}</p>
      )}
      <ReportFlow
        barrios={barrios}
        provincia={provincia}
        initialProduct={initialProduct}
        initialStore={initialStore}
      />
    </div>
  );
}
