import ReportFlow from "@/components/ReportFlow";
import { getPlaceById, getProductBySlug } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportar — DóndeHay" };

type Props = {
  searchParams?: Promise<{
    provincia?: string;
    producto?: string;
    place?: string;
    store?: string;
  }>;
};

export default async function ReportarPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const provincia = params.provincia ?? null;

  // Prefill via URL: /reportar?producto=<slug> y/o ?place=<id>.
  let initialProduct: { id: string; slug: string; name: string; emoji: string } | null = null;
  if (params.producto) {
    try {
      initialProduct = await getProductBySlug(params.producto);
    } catch {
      initialProduct = null;
    }
  }

  // El param legado ?store= se aliasa a ?place= (bundles viejos, D6): los
  // lugares heredan los UUID de las tiendas. Id desconocido o inactivo ->
  // null, y el flujo arranca con el pin vacio sin romperse.
  let initialPlace: {
    id: string;
    name: string;
    lat: number | null;
    lng: number | null;
    address: string | null;
  } | null = null;
  const rawPlace = params.place ?? params.store;
  if (rawPlace) {
    try {
      const place = await getPlaceById(rawPlace);
      if (place) {
        initialPlace = {
          id: place.id,
          name: place.label,
          lat: place.lat,
          lng: place.lng,
          address: place.address,
        };
      }
    } catch {
      initialPlace = null;
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="px-1 font-display text-xl">Reportar</h1>
      {provincia && (
        <p className="px-1 text-xs text-ink-soft">Provincia activa: {provincia}</p>
      )}
      <ReportFlow
        provincia={provincia}
        initialProduct={initialProduct}
        initialPlace={initialPlace}
      />
    </div>
  );
}
