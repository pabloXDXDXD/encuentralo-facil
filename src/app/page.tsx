import HomeView, { type HomeRow } from "@/components/HomeView";
import { getAvailability, listBarrios } from "@/lib/repo";

// Dynamic rendering keeps the freshness banner honest; the service worker
// provides the offline layer on top of this.
export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ barrio?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const barrio = params.barrio ?? null;

  let barrios: string[] = [];
  let rows: HomeRow[] = [];
  let offline = false;
  try {
    const [b, r] = await Promise.all([listBarrios(), getAvailability(barrio)]);
    barrios = b;
    rows = r.map((row) => ({
      ...row,
      last_seen_at: new Date(row.last_seen_at).toISOString(),
    }));
  } catch {
    offline = true;
  }

  return (
    <HomeView rows={rows} barrios={barrios} activeBarrio={barrio} offline={offline} />
  );
}
