/**
 * Catalogo canonico estatico (espejo del seed) para el typeahead del
 * buscador. Permite sugerir productos incluso sin conexion o antes de
 * que llegue el snapshot; los conteos de lugares vienen del snapshot.
 */
export const PRODUCT_CATALOG: { slug: string; name: string; emoji: string }[] = [
  // Proteina
  { slug: "pollo", name: "Pollo", emoji: "🍗" },
  { slug: "cerdo", name: "Carne de cerdo", emoji: "🐖" },
  { slug: "picadillo", name: "Picadillo de cerdo", emoji: "🥩" },
  { slug: "salchichas", name: "Salchichas", emoji: "🌭" },
  { slug: "pescado", name: "Pescado", emoji: "🐟" },
  // Granos y cereales
  { slug: "arroz", name: "Arroz", emoji: "🍚" },
  { slug: "frijoles-negros", name: "Frijoles negros", emoji: "🫘" },
  { slug: "chicharos", name: "Chícharos secos", emoji: "🫛" },
  { slug: "garbanzos", name: "Garbanzos", emoji: "🌰" },
  { slug: "lentejas", name: "Lentejas", emoji: "🫘" },
  { slug: "harina-trigo", name: "Harina de trigo", emoji: "🌾" },
  { slug: "harina-maiz", name: "Harina de maíz", emoji: "🌽" },
  { slug: "pasta", name: "Pasta", emoji: "🍝" },
  { slug: "pan", name: "Pan", emoji: "🍞" },
  { slug: "galletas", name: "Galletas", emoji: "🍪" },
  // Aceites y condimentos
  { slug: "aceite", name: "Aceite vegetal", emoji: "🫒" },
  { slug: "sal", name: "Sal", emoji: "🧂" },
  { slug: "azucar", name: "Azúcar", emoji: "🍬" },
  { slug: "cafe", name: "Café molido", emoji: "☕" },
  { slug: "vinagre", name: "Vinagre", emoji: "🍶" },
  { slug: "consome", name: "Consomé de tomate", emoji: "🥫" },
  // Lacteos y huevos
  { slug: "leche-polvo", name: "Leche en polvo", emoji: "🥛" },
  { slug: "huevos", name: "Huevos", emoji: "🥚" },
  { slug: "queso", name: "Queso", emoji: "🧀" },
  { slug: "yogur", name: "Yogur", emoji: "🥛" },
  // Limpieza
  { slug: "detergente", name: "Detergente", emoji: "🧼" },
  { slug: "jabon-lavar", name: "Jabón de lavar", emoji: "🧼" },
  { slug: "jabon-bano", name: "Jabón de baño", emoji: "🧴" },
  { slug: "papel-sanitario", name: "Papel sanitario", emoji: "🧻" },
  { slug: "cloro", name: "Cloro", emoji: "🧪" },
  // Bebidas y otros
  { slug: "malta", name: "Malta", emoji: "🍺" },
  { slug: "cerveza", name: "Cerveza", emoji: "🍺" },
  { slug: "ron", name: "Ron", emoji: "🥃" },
  { slug: "refresco", name: "Refresco", emoji: "🥤" },
  { slug: "cigarros", name: "Cigarros", emoji: "🚬" },
  // Viandas y hortalizas
  { slug: "platano", name: "Plátano", emoji: "🍌" },
  { slug: "boniato", name: "Boniato", emoji: "🍠" },
  { slug: "yuca", name: "Yuca", emoji: "🥔" },
  { slug: "papa", name: "Papa", emoji: "🥔" },
  { slug: "cebolla", name: "Cebolla", emoji: "🧅" },
  { slug: "ajo", name: "Ajo", emoji: "🧄" },
  { slug: "tomate", name: "Tomate", emoji: "🍅" },
  { slug: "lechuga", name: "Lechuga", emoji: "🥬" },
  { slug: "mango", name: "Mango", emoji: "🥭" },
  { slug: "limon", name: "Limón", emoji: "🍋" },
  { slug: "maiz-grano", name: "Maíz en grano", emoji: "🌽" },
  { slug: "soya", name: "Soya", emoji: "🫘" },
  { slug: "frijol-colorado", name: "Frijol colorado", emoji: "🫘" },
];