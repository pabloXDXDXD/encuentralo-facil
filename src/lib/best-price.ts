// Selección del mejor precio para el chip "Mejor precio" del home.
//
// Regla: el precio mínimo entre las filas visibles de la búsqueda; las filas
// sin precio (price_from null) se ignoran. En caso de empate gana la fila más
// cercana. La distancia sale de la propia fila ganadora (distance_m ya viene
// en la respuesta del search) — sin fetch adicional.

export type BestPriceInput = {
  price_from: number | null;
  distance_m: number;
};

export type BestPrice = {
  price: number;
  distanceM: number;
};

/** Devuelve el mejor precio visible, o null si no hay filas con precio. */
export function selectBestPrice(rows: readonly BestPriceInput[]): BestPrice | null {
  let best: BestPrice | null = null;
  for (const row of rows) {
    if (row.price_from === null) continue;
    if (
      best === null ||
      row.price_from < best.price ||
      (row.price_from === best.price && row.distance_m < best.distanceM)
    ) {
      best = { price: row.price_from, distanceM: row.distance_m };
    }
  }
  return best;
}
