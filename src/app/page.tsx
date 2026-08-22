import HomeView, { type HomeRow } from "@/components/HomeView";
import { getAvailability, listBarrios, listProvinces } from "@/lib/repo";

// Dynamic rendering keeps the freshness banner honest; the service worker
// provides the offline layer on top of this.
export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ provincia?: string; municipio?: string; barrio?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const provincia = params.provincia ?? null;
  // New param wins; old ?barrio= links keep working.
  const municipio = params.municipio ?? params.barrio ?? null;

  let provinces: string[] = [];
  let municipios: string[] = [];
  let rows: HomeRow[] = [];
  let offline = false;
  try {
    const [p, m, r] = await Promise.all([
      listProvinces(),
      listBarrios(provincia),
      getAvailability(municipio, provincia),
    ]);
    provinces = p;
    municipios = m;
    rows = r.map((row) => ({
      ...row,
      last_seen_at: new Date(row.last_seen_at).toISOString(),
      lat: row.lat === null ? null : Number(row.lat),
      lng: row.lng === null ? null : Number(row.lng),
    }));
  } catch {
    offline = true;
  }

  return (
    <HomeView
      rows={rows}
      provinces={provinces}
      municipios={municipios}
      activeProvincia={provincia}
      activeMunicipio={municipio}
      offline={offline}
    />
  );
}
