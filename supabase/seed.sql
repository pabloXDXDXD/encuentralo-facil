-- Seed for DóndeHay v1: canonical basket catalog + Havana stores + demo reports.
-- Deterministic UUIDs -> idempotent (safe to re-run).

insert into public.product_categories (id, name, emoji, sort_order) values
  ('d0000000-00c0-4e00-8000-000000000001','Proteína','🍖',1),
  ('d0000000-00c0-4e00-8000-000000000002','Granos y cereales','🌾',2),
  ('d0000000-00c0-4e00-8000-000000000003','Aceites y condimentos','🫙',3),
  ('d0000000-00c0-4e00-8000-000000000004','Lácteos y huevos','🥛',4),
  ('d0000000-00c0-4e00-8000-000000000005','Limpieza','🧼',5),
  ('d0000000-00c0-4e00-8000-000000000006','Higiene personal','🧴',6),
  ('d0000000-00c0-4e00-8000-000000000007','Bebidas','🥤',7),
  ('d0000000-00c0-4e00-8000-000000000008','Otros','📦',8)
on conflict (id) do nothing;

insert into public.products (id, slug, name, emoji, category_id) values
  -- Proteína
  ('d0000000-00c0-4e00-8000-000000000101','pollo','Pollo','🍗','d0000000-00c0-4e00-8000-000000000001'),
  ('d0000000-00c0-4e00-8000-000000000102','cerdo','Carne de cerdo','🐖','d0000000-00c0-4e00-8000-000000000001'),
  ('d0000000-00c0-4e00-8000-000000000103','picadillo','Picadillo de cerdo','🥩','d0000000-00c0-4e00-8000-000000000001'),
  ('d0000000-00c0-4e00-8000-000000000104','salchichas','Salchichas','🌭','d0000000-00c0-4e00-8000-000000000001'),
  ('d0000000-00c0-4e00-8000-000000000105','pescado','Pescado','🐟','d0000000-00c0-4e00-8000-000000000001'),
  -- Granos y cereales
  ('d0000000-00c0-4e00-8000-000000000120','arroz','Arroz','🍚','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000121','frijoles-negros','Frijoles negros','🫘','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000122','chicharos','Chícharos secos','🫛','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000123','garbanzos','Garbanzos','🌰','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000124','lentejas','Lentejas','🫘','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000125','harina-trigo','Harina de trigo','🌾','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000126','harina-maiz','Harina de maíz','🌽','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000127','pasta','Pasta','🍝','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000128','pan','Pan','🍞','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000129','galletas','Galletas','🍪','d0000000-00c0-4e00-8000-000000000002'),
  -- Aceites y condimentos
  ('d0000000-00c0-4e00-8000-000000000140','aceite','Aceite vegetal','🫒','d0000000-00c0-4e00-8000-000000000003'),
  ('d0000000-00c0-4e00-8000-000000000141','sal','Sal','🧂','d0000000-00c0-4e00-8000-000000000003'),
  ('d0000000-00c0-4e00-8000-000000000142','azucar','Azúcar','🍬','d0000000-00c0-4e00-8000-000000000003'),
  ('d0000000-00c0-4e00-8000-000000000143','cafe','Café molido','☕','d0000000-00c0-4e00-8000-000000000003'),
  ('d0000000-00c0-4e00-8000-000000000144','vinagre','Vinagre','🍶','d0000000-00c0-4e00-8000-000000000003'),
  ('d0000000-00c0-4e00-8000-000000000145','consome','Consomé de tomate','🥫','d0000000-00c0-4e00-8000-000000000003'),
  -- Lácteos y huevos
  ('d0000000-00c0-4e00-8000-000000000160','leche-polvo','Leche en polvo','🥛','d0000000-00c0-4e00-8000-000000000004'),
  ('d0000000-00c0-4e00-8000-000000000161','huevos','Huevos','🥚','d0000000-00c0-4e00-8000-000000000004'),
  ('d0000000-00c0-4e00-8000-000000000162','queso','Queso','🧀','d0000000-00c0-4e00-8000-000000000004'),
  ('d0000000-00c0-4e00-8000-000000000163','yogurt','Yogur natural','🥣','d0000000-00c0-4e00-8000-000000000004'),
  -- Limpieza
  ('d0000000-00c0-4e00-8000-000000000180','detergente','Detergente','🧺','d0000000-00c0-4e00-8000-000000000005'),
  ('d0000000-00c0-4e00-8000-000000000181','jabon-lavar','Jabón de lavar','🧼','d0000000-00c0-4e00-8000-000000000005'),
  ('d0000000-00c0-4e00-8000-000000000182','lejia','Cloro / lejía','🧪','d0000000-00c0-4e00-8000-000000000005'),
  ('d0000000-00c0-4e00-8000-000000000183','papel-sanitario','Papel sanitario','🧻','d0000000-00c0-4e00-8000-000000000005'),
  ('d0000000-00c0-4e00-8000-000000000184','panales','Pañales','👶','d0000000-00c0-4e00-8000-000000000005'),
  -- Higiene personal
  ('d0000000-00c0-4e00-8000-000000000200','jabon-bano','Jabón de baño','🧴','d0000000-00c0-4e00-8000-000000000006'),
  ('d0000000-00c0-4e00-8000-000000000201','champu','Champú','🚿','d0000000-00c0-4e00-8000-000000000006'),
  ('d0000000-00c0-4e00-8000-000000000202','pasta-dental','Pasta dental','🪥','d0000000-00c0-4e00-8000-000000000006'),
  -- Bebidas
  ('d0000000-00c0-4e00-8000-000000000220','agua','Agua embotellada','💧','d0000000-00c0-4e00-8000-000000000007'),
  ('d0000000-00c0-4e00-8000-000000000221','refresco','Refresco','🥤','d0000000-00c0-4e00-8000-000000000007'),
  ('d0000000-00c0-4e00-8000-000000000222','malta','Malta','🍺','d0000000-00c0-4e00-8000-000000000007'),
  ('d0000000-00c0-4e00-8000-000000000223','cerveza','Cerveza','🍻','d0000000-00c0-4e00-8000-000000000007'),
  ('d0000000-00c0-4e00-8000-000000000224','ron','Ron','🥃','d0000000-00c0-4e00-8000-000000000007'),
  -- Otros
  ('d0000000-00c0-4e00-8000-000000000240','baterias','Baterías AA/AAA','🔋','d0000000-00c0-4e00-8000-000000000008'),
  ('d0000000-00c0-4e00-8000-000000000241','gas-balon','Gas (balón)','🛢️','d0000000-00c0-4e00-8000-000000000008'),
  ('d0000000-00c0-4e00-8000-000000000242','bombillos','Bombillos LED','💡','d0000000-00c0-4e00-8000-000000000008'),
  ('d0000000-00c0-4e00-8000-000000000243','velas','Velas','🕯️','d0000000-00c0-4e00-8000-000000000008')
on conflict (slug) do nothing;

insert into public.stores (id, name, barrio, kind, lat, lng) values
  -- Habana Vieja
  ('d0000000-00c0-4e00-8000-000000000301','Agropecuario Egido','Habana Vieja','state_market',23.140,-82.360),
  ('d0000000-00c0-4e00-8000-000000000302','Mercado Comercial Obispo','Habana Vieja','private_market',23.139,-82.358),
  ('d0000000-00c0-4e00-8000-000000000303','Bodega Cuarteles','Habana Vieja','state_market',23.142,-82.362),
  ('d0000000-00c0-4e00-8000-000000000304','Panadería Compostela','Habana Vieja','other',23.138,-82.359),
  -- Centro Habana
  ('d0000000-00c0-4e00-8000-000000000305','Agropecuario Calzada del Monte','Centro Habana','state_market',23.145,-82.378),
  ('d0000000-00c0-4e00-8000-000000000306','Caribe San Lázaro','Centro Habana','state_market',23.146,-82.381),
  ('d0000000-00c0-4e00-8000-000000000307','Bodega San Nicolás','Centro Habana','state_market',23.143,-82.377),
  ('d0000000-00c0-4e00-8000-000000000308','MIPYME El Ángel','Centro Habana','mipyme',23.147,-82.379),
  -- Vedado
  ('d0000000-00c0-4e00-8000-000000000309','Agropecuario 19 y B','Vedado','state_market',23.148,-82.393),
  ('d0000000-00c0-4e00-8000-000000000310','Mercado La Rampa','Vedado','private_market',23.145,-82.396),
  ('d0000000-00c0-4e00-8000-000000000311','Bodega Calzada de Loma','Vedado','state_market',23.147,-82.391),
  ('d0000000-00c0-4e00-8000-000000000312','MIPYME El Vedadito','Vedado','mipyme',23.149,-82.394),
  -- Nuevo Vedado
  ('d0000000-00c0-4e00-8000-000000000313','Mercado Nuevo Vedado','Nuevo Vedado','private_market',23.132,-82.401),
  ('d0000000-00c0-4e00-8000-000000000314','Bodega Rotonda','Nuevo Vedado','state_market',23.133,-82.403),
  ('d0000000-00c0-4e00-8000-000000000315','Panadería Nuevo Vedado','Nuevo Vedado','other',23.131,-82.400),
  -- Miramar
  ('d0000000-00c0-4e00-8000-000000000316','Agropecuario 5ta y 42','Miramar','state_market',23.124,-82.410),
  ('d0000000-00c0-4e00-8000-000000000317','MIPYME Miramar Gourmet','Miramar','mipyme',23.125,-82.408),
  ('d0000000-00c0-4e00-8000-000000000318','Caribe Miramar','Miramar','state_market',23.123,-82.412),
  -- Playa
  ('d0000000-00c0-4e00-8000-000000000319','Mercado Cubanacán','Playa','private_market',23.110,-82.425),
  ('d0000000-00c0-4e00-8000-000000000320','Agropecuario Siboney','Playa','state_market',23.112,-82.421),
  ('d0000000-00c0-4e00-8000-000000000321','Bodega Kohly','Playa','state_market',23.109,-82.427),
  -- Cerro
  ('d0000000-00c0-4e00-8000-000000000322','Mercado Cuatro Caminos','Cerro','state_market',23.118,-82.372),
  ('d0000000-00c0-4e00-8000-000000000323','Agropecuario Palatino','Cerro','state_market',23.117,-82.370),
  ('d0000000-00c0-4e00-8000-000000000324','Bodega Cerro','Cerro','state_market',23.119,-82.374),
  ('d0000000-00c0-4e00-8000-000000000325','MIPYME El Faro','Cerro','mipyme',23.116,-82.369),
  -- Víbora
  ('d0000000-00c0-4e00-8000-000000000326','Mercado Víbora','Víbora','private_market',23.104,-82.372),
  ('d0000000-00c0-4e00-8000-000000000327','Bodega Santa Catalina','Víbora','state_market',23.105,-82.370),
  ('d0000000-00c0-4e00-8000-000000000328','MIPYME El Trigal','Víbora','mipyme',23.103,-82.374),
  -- Santos Suárez
  ('d0000000-00c0-4e00-8000-000000000329','Agropecuario Dolores','Santos Suárez','state_market',23.092,-82.362),
  ('d0000000-00c0-4e00-8000-000000000330','Bodega Acosta','Santos Suárez','state_market',23.093,-82.361),
  ('d0000000-00c0-4e00-8000-000000000331','MIPYME Santos Market','Santos Suárez','mipyme',23.091,-82.363),
  -- Diez de Octubre
  ('d0000000-00c0-4e00-8000-000000000332','Mercado Jesús del Monte','Diez de Octubre','private_market',23.098,-82.383),
  ('d0000000-00c0-4e00-8000-000000000333','Bodega Luyanó','Diez de Octubre','state_market',23.099,-82.381),
  ('d0000000-00c0-4e00-8000-000000000334','MIPYME Buen Viaje','Diez de Octubre','mipyme',23.097,-82.385),
  -- San Miguel del Padrón
  ('d0000000-00c0-4e00-8000-000000000335','Agropecuario Virgen del Camino','San Miguel del Padrón','state_market',23.113,-82.340),
  ('d0000000-00c0-4e00-8000-000000000336','Bodega Lacret','San Miguel del Padrón','state_market',23.114,-82.342),
  ('d0000000-00c0-4e00-8000-000000000337','Mercado San Miguel','San Miguel del Padrón','private_market',23.112,-82.338),
  -- Arroyo Naranjo
  ('d0000000-00c0-4e00-8000-000000000338','Mercado Pogolotti','Arroyo Naranjo','private_market',23.073,-82.356),
  ('d0000000-00c0-4e00-8000-000000000339','Bodega Calvario','Arroyo Naranjo','state_market',23.074,-82.354),
  ('d0000000-00c0-4e00-8000-000000000340','Agropecuario Buena Vista','Arroyo Naranjo','state_market',23.072,-82.358),
  -- Marianao
  ('d0000000-00c0-4e00-8000-000000000341','Agropecuario Marianao','Marianao','state_market',23.128,-82.437),
  ('d0000000-00c0-4e00-8000-000000000342','Mercado Puentes Grandes','Marianao','private_market',23.129,-82.435),
  ('d0000000-00c0-4e00-8000-000000000343','Bodega Marianao','Marianao','state_market',23.127,-82.439),
  ('d0000000-00c0-4e00-8000-000000000344','MIPYME El Bosque','Marianao','mipyme',23.130,-82.434),
  -- La Lisa
  ('d0000000-00c0-4e00-8000-000000000345','Mercado La Lisa','La Lisa','private_market',23.131,-82.458),
  ('d0000000-00c0-4e00-8000-000000000346','Bodega Punta Brava','La Lisa','state_market',23.132,-82.456),
  ('d0000000-00c0-4e00-8000-000000000347','Agropecuario Arroyo Arenas','La Lisa','state_market',23.130,-82.460),
  -- Boyeros
  ('d0000000-00c0-4e00-8000-000000000348','Agropecuario Santiago de las Vegas','Boyeros','state_market',23.065,-82.415),
  ('d0000000-00c0-4e00-8000-000000000349','Mercado Wajay','Boyeros','private_market',23.067,-82.413),
  ('d0000000-00c0-4e00-8000-000000000350','Bodega Calabazar','Boyeros','state_market',23.064,-82.417),
  -- Habana del Este
  ('d0000000-00c0-4e00-8000-000000000351','TRD Panamericana','Habana del Este','state_market',23.156,-82.322),
  ('d0000000-00c0-4e00-8000-000000000352','Agropecuario Guanabo','Habana del Este','state_market',23.158,-82.320),
  ('d0000000-00c0-4e00-8000-000000000353','Bodega Cojímar','Habana del Este','state_market',23.155,-82.325),
  ('d0000000-00c0-4e00-8000-000000000354','Mercado Alamar','Habana del Este','private_market',23.154,-82.318)
on conflict (id) do nothing;

-- Demo reports so the first open shows a living map.
-- Remove anytime: delete from reports where device_hash = 'seed-demo';
with data(store_name, product_slug, avail, price, mins_ago) as (values
  ('Agropecuario 19 y B','pollo','available',400,12),
  ('Agropecuario 19 y B','huevos','available',180,25),
  ('Caribe San Lázaro','aceite','available',1850,40),
  ('Mercado Cuatro Caminos','arroz','available',320,55),
  ('MIPYME El Vedadito','cafe','available',950,70),
  ('Agropecuario Dolores','frijoles-negros','available',480,90),
  ('Mercado Víbora','leche-polvo','out_of_stock',null::integer,110),
  ('TRD Panamericana','detergente','available',780,130),
  ('Bodega Acosta','azucar','available',210,150),
  ('Agropecuario Santiago de las Vegas','malta','available',520,170),
  ('MIPYME Miramar Gourmet','queso','available',1400,190),
  ('Mercado Jesús del Monte','pasta','available',260,205),
  ('Agropecuario Guanabo','pescado','available',600,230),
  ('Caribe San Lázaro','jabon-lavar','out_of_stock',null::integer,250),
  ('Bodega Kohly','pan','available',95,280),
  ('Mercado Cubanacán','cerdo','available',350,300)
)
insert into public.reports (store_id, product_id, device_hash, availability, price_cup, created_at)
select s.id, p.id, 'seed-demo', d.avail, d.price, now() - make_interval(mins => d.mins_ago)
from data d
join public.stores s   on s.name = d.store_name
join public.products p on p.slug = d.product_slug
where not exists (select 1 from public.reports where device_hash = 'seed-demo');
