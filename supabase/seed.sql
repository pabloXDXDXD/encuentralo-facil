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
  ('d0000000-00c0-4e00-8000-000000000008','Otros','📦',8),
  ('d0000000-00c0-4e00-8000-000000000009','Viandas y hortalizas','🥬',9)
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
  ('d0000000-00c0-4e00-8000-000000000243','velas','Velas','🕯️','d0000000-00c0-4e00-8000-000000000008'),
  -- Ampliación
  ('d0000000-00c0-4e00-8000-000000000106','soya','Picadillo de soya','🌱','d0000000-00c0-4e00-8000-000000000001'),
  ('d0000000-00c0-4e00-8000-000000000146','frijol-colorado','Frijol colorado','🫘','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000147','maiz-grano','Maíz en grano','🌽','d0000000-00c0-4e00-8000-000000000002'),
  ('d0000000-00c0-4e00-8000-000000000244','caramelos','Caramelos','🍭','d0000000-00c0-4e00-8000-000000000008'),
  -- Viandas y hortalizas
  ('d0000000-00c0-4e00-8000-000000000250','cebolla','Cebolla','🧅','d0000000-00c0-4e00-8000-000000000009'),
  ('d0000000-00c0-4e00-8000-000000000251','ajo','Ajo','🧄','d0000000-00c0-4e00-8000-000000000009'),
  ('d0000000-00c0-4e00-8000-000000000252','limon','Limón','🍋','d0000000-00c0-4e00-8000-000000000009'),
  ('d0000000-00c0-4e00-8000-000000000253','mango','Mango','🥭','d0000000-00c0-4e00-8000-000000000009'),
  ('d0000000-00c0-4e00-8000-000000000254','platano','Plátano','🍌','d0000000-00c0-4e00-8000-000000000009'),
  ('d0000000-00c0-4e00-8000-000000000255','boniato','Boniato','🍠','d0000000-00c0-4e00-8000-000000000009'),
  ('d0000000-00c0-4e00-8000-000000000256','yuca','Yuca','🥔','d0000000-00c0-4e00-8000-000000000009')
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
  ('d0000000-00c0-4e00-8000-000000000309','Agropecuario 19 y B','Plaza de la Revolución','state_market',23.148,-82.393),
  ('d0000000-00c0-4e00-8000-000000000310','Mercado La Rampa','Plaza de la Revolución','private_market',23.145,-82.396),
  ('d0000000-00c0-4e00-8000-000000000311','Bodega Calzada de Loma','Plaza de la Revolución','state_market',23.147,-82.391),
  ('d0000000-00c0-4e00-8000-000000000312','MIPYME El Vedadito','Plaza de la Revolución','mipyme',23.149,-82.394),
  -- Nuevo Vedado
  ('d0000000-00c0-4e00-8000-000000000313','Mercado Nuevo Vedado','Plaza de la Revolución','private_market',23.132,-82.401),
  ('d0000000-00c0-4e00-8000-000000000314','Bodega Rotonda','Plaza de la Revolución','state_market',23.133,-82.403),
  ('d0000000-00c0-4e00-8000-000000000315','Panadería Nuevo Vedado','Plaza de la Revolución','other',23.131,-82.400),
  -- Miramar
  ('d0000000-00c0-4e00-8000-000000000316','Agropecuario 5ta y 42','Playa','state_market',23.124,-82.410),
  ('d0000000-00c0-4e00-8000-000000000317','MIPYME Miramar Gourmet','Playa','mipyme',23.125,-82.408),
  ('d0000000-00c0-4e00-8000-000000000318','Caribe Miramar','Playa','state_market',23.123,-82.412),
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
  ('d0000000-00c0-4e00-8000-000000000326','Mercado Víbora','Diez de Octubre','private_market',23.104,-82.372),
  ('d0000000-00c0-4e00-8000-000000000327','Bodega Santa Catalina','Diez de Octubre','state_market',23.105,-82.370),
  ('d0000000-00c0-4e00-8000-000000000328','MIPYME El Trigal','Diez de Octubre','mipyme',23.103,-82.374),
  -- Santos Suárez
  ('d0000000-00c0-4e00-8000-000000000329','Agropecuario Dolores','Diez de Octubre','state_market',23.092,-82.362),
  ('d0000000-00c0-4e00-8000-000000000330','Bodega Acosta','Diez de Octubre','state_market',23.093,-82.361),
  ('d0000000-00c0-4e00-8000-000000000331','MIPYME Santos Market','Diez de Octubre','mipyme',23.091,-82.363),
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

-- Municipios sin cobertura en La Habana
insert into public.stores (id, name, barrio, kind, lat, lng) values
  ('d0000000-00c0-4e00-8000-000000000355','Agropecuario Regla','Regla','state_market',23.127,-82.335),
  ('d0000000-00c0-4e00-8000-000000000356','Bodega Guanabacoa','Guanabacoa','state_market',23.123,-82.297),
  ('d0000000-00c0-4e00-8000-000000000357','Mercado Cotorro','Cotorro','private_market',23.095,-82.290)
on conflict (id) do nothing;

-- Segunda provincia para probar el selector en cascada
insert into public.stores (id, name, barrio, kind, lat, lng, province) values
  ('d0000000-00c0-4e00-8000-000000000401','Agropecuario Circunvalación','Sancti Spíritus','state_market',21.933,-79.444,'Sancti Spíritus'),
  ('d0000000-00c0-4e00-8000-000000000402','Bodega Céspedes','Sancti Spíritus','state_market',21.931,-79.441,'Sancti Spíritus'),
  ('d0000000-00c0-4e00-8000-000000000403','Mercado Municipal Trinidad','Trinidad','private_market',21.802,-79.983,'Sancti Spíritus'),
  ('d0000000-00c0-4e00-8000-000000000404','MIPYME El Puente','Cabaiguán','mipyme',21.992,-79.398,'Sancti Spíritus'),
  ('d0000000-00c0-4e00-8000-000000000405','Caribe Jatibonico','Jatibonico','state_market',21.946,-79.172,'Sancti Spíritus'),
  ('d0000000-00c0-4e00-8000-000000000406','Mercado Yaguajay','Yaguajay','private_market',22.327,-79.192,'Sancti Spíritus')
on conflict (id) do nothing;

-- Demo reports so the first open shows a living map.
-- Remove anytime: delete from reports where device_hash = 'seed-demo';
with data(store_name, product_slug, avail, price, mins_ago) as (values
  -- La Habana: reportes frescos repartidos por municipios
  ('Agropecuario 19 y B','pollo','available',400,15),
  ('Agropecuario 19 y B','huevos','available',180,32),
  ('Caribe San Lázaro','aceite','available',1850,48),
  ('Mercado Cuatro Caminos','arroz','available',320,60),
  ('MIPYME El Vedadito','cafe','available',950,75),
  ('Agropecuario Dolores','frijoles-negros','available',480,90),
  ('Mercado Víbora','leche-polvo','out_of_stock',null::integer,105),
  ('TRD Panamericana','detergente','available',780,125),
  ('Bodega Acosta','azucar','available',210,140),
  ('MIPYME Miramar Gourmet','queso','available',1400,20),
  ('Mercado Cubanacán','cerdo','available',350,26),
  ('Bodega Kohly','pan','available',95,44),
  ('Agropecuario Siboney','pescado','available',600,58),
  ('Mercado Jesús del Monte','pasta','available',260,66),
  ('Agropecuario Calzada del Monte','soya','available',180,36),
  ('Bodega San Nicolás','jabon-lavar','out_of_stock',null::integer,150),
  ('MIPYME El Ángel','papel-sanitario','available',250,80),
  ('Agropecuario Marianao','platano','available',60,22),
  ('Mercado Puentes Grandes','cebolla','available',150,38),
  ('MIPYME El Bosque','mango','available',100,52),
  ('Mercado La Lisa','boniato','available',120,64),
  ('Agropecuario Arroyo Arenas','yuca','available',90,78),
  ('Agropecuario Santiago de las Vegas','malta','available',520,92),
  ('Mercado Wajay','frijol-colorado','available',520,110),
  ('TRD Panamericana','cerveza','available',390,130),
  ('Agropecuario Regla','maiz-grano','available',180,28),
  ('Bodega Guanabacoa','limon','available',80,45),
  ('Mercado Cotorro','galletas','available',300,70),
  -- Sancti Spíritus: segunda provincia
  ('Agropecuario Circunvalación','arroz','available',340,24),
  ('Bodega Céspedes','aceite','available',1750,55),
  ('Mercado Municipal Trinidad','ron','available',900,40),
  ('MIPYME El Puente','detergente','available',820,68),
  ('Caribe Jatibonico','huevos','available',170,85),
  ('Mercado Yaguajay','picadillo','available',280,100)
)
insert into public.reports (store_id, product_id, device_hash, availability, price_cup, created_at)
select s.id, p.id, 'seed-demo', d.avail, d.price, now() - make_interval(mins => d.mins_ago)
from data d
join public.stores s   on s.name = d.store_name
join public.products p on p.slug = d.product_slug
where not exists (select 1 from public.reports where device_hash = 'seed-demo');

-- Bloque denso de un solo producto (pollo): muchos reportes del mismo item
-- en muchas tiendas, para testear agregacion, ranking y ventanas de tiempo.
-- Remove anytime: delete from reports where device_hash = 'seed-demo-pollo';
with data(store_name, product_slug, avail, price, mins_ago) as (values
  -- Pollo disponible en casi toda La Habana
  ('Agropecuario Egido','pollo','available',410,8),
  ('Mercado Comercial Obispo','pollo','available',450,14),
  ('Bodega Cuarteles','pollo','available',395,21),
  ('Panadería Compostela','pollo','available',480,35),
  ('Agropecuario Calzada del Monte','pollo','available',420,12),
  ('Caribe San Lázaro','pollo','available',405,27),
  ('Bodega San Nicolás','pollo','available',390,44),
  ('MIPYME El Ángel','pollo','available',520,18),
  ('Agropecuario 19 y B','pollo','available',430,55),
  ('Mercado La Rampa','pollo','available',510,31),
  ('Bodega Calzada de Loma','pollo','available',400,62),
  ('MIPYME El Vedadito','pollo','available',540,9),
  ('Mercado Nuevo Vedado','pollo','out_of_stock',null::integer,70),
  ('Bodega Rotonda','pollo','available',385,25),
  ('Panadería Nuevo Vedado','pollo','available',495,48),
  ('Agropecuario 5ta y 42','pollo','available',460,16),
  ('Bodega Santa Catalina','pollo','available',392,38),
  ('MIPYME El Trigal','pollo','available',505,22),
  ('Agropecuario Dolores','pollo','available',415,29),
  ('Bodega Acosta','pollo','available',398,51),
  ('MIPYME Santos Market','pollo','available',530,13),
  ('Mercado Jesús del Monte','pollo','out_of_stock',null::integer,88),
  ('Bodega Luyanó','pollo','available',388,41),
  ('MIPYME Buen Viaje','pollo','available',515,19),
  ('Agropecuario Virgen del Camino','pollo','available',408,33),
  ('Bodega Lacret','pollo','available',386,57),
  ('Mercado San Miguel','pollo','available',472,26),
  ('Mercado Pogolotti','pollo','available',455,37),
  ('Bodega Calvario','pollo','available',391,66),
  ('Agropecuario Buena Vista','pollo','available',412,24),
  ('Agropecuario Marianao','pollo','available',418,17),
  ('Mercado Puentes Grandes','pollo','available',468,42),
  ('Bodega Marianao','pollo','available',394,53),
  ('MIPYME El Bosque','pollo','available',525,11),
  ('Mercado La Lisa','pollo','available',462,34),
  ('Bodega Punta Brava','pollo','available',389,61),
  ('Agropecuario Arroyo Arenas','pollo','available',414,20),
  ('Agropecuario Santiago de las Vegas','pollo','available',407,46),
  ('Mercado Wajay','pollo','available',458,28),
  ('Bodega Calabazar','pollo','out_of_stock',null::integer,95),
  ('TRD Panamericana','pollo','available',365,15),
  ('Agropecuario Guanabo','pollo','available',380,39),
  ('Bodega Cojímar','pollo','available',378,58),
  ('Mercado Alamar','pollo','available',475,23),
  ('Agropecuario Regla','pollo','available',402,30),
  ('Bodega Guanabacoa','pollo','available',396,49),
  ('Mercado Cotorro','pollo','available',409,36),
  -- Sancti Spíritus también con pollo
  ('Agropecuario Circunvalación','pollo','available',370,26),
  ('Bodega Céspedes','pollo','available',385,43),
  ('Mercado Municipal Trinidad','pollo','available',440,32),
  ('MIPYME El Puente','pollo','available',495,18),
  ('Caribe Jatibonico','pollo','out_of_stock',null::integer,77),
  ('Mercado Yaguajay','pollo','available',410,54)
)
insert into public.reports (store_id, product_id, device_hash, availability, price_cup, created_at)
select s.id, p.id, 'seed-demo-pollo', d.avail, d.price, now() - make_interval(mins => d.mins_ago)
from data d
join public.stores s   on s.name = d.store_name
join public.products p on p.slug = d.product_slug
where not exists (select 1 from public.reports where device_hash = 'seed-demo-pollo');

-- ---------------------------------------------------------------------------
-- Bulk de reportes concentrados para TESTEO de agregación:
-- pocos productos (pollo, arroz, aceite, huevos), TODAS las tiendas,
-- 3 reporteros distintos por (tienda, producto) con edades que pisan los
-- límites de frescura (~8min -> fresh 1.0, ~35min -> 0.7, ~150min -> 0.4).
-- Con 3 dispositivos por grupo score >= 2.1 -> siempre visible; sirve para
-- probar price_from (min dentro de ventana), reporter_count y orden por
-- frescura sin ruido de variedad.
-- Idempotente: solo corre si no existe ningun reporte 'seed-load-%'.
-- Remove anytime: delete from reports where device_hash like 'seed-load-%';
-- ---------------------------------------------------------------------------
with core(slug) as (values ('pollo'),('arroz'),('aceite'),('huevos')),
pairs as (
  select s.id as store_id,
         c.slug,
         row_number() over (order by s.id, c.slug) as rn
  from public.stores s
  cross join core c
)
insert into public.reports (store_id, product_id, device_hash, availability, price_cup, created_at)
select pr.store_id,
       p.id,
       'seed-load-' || (((pr.rn + k.n) % 9))::text,
       case when pr.rn % 11 = 0 then 'out_of_stock' else 'available' end,
       case
         when pr.rn % 11 = 0 then null::integer
         when p.slug = 'pollo'  then 380 + (pr.rn % 5) * 10
         when p.slug = 'arroz'  then 300 + (pr.rn % 4) * 15
         when p.slug = 'aceite' then 1750 + (pr.rn % 3) * 50
         else 160 + (pr.rn % 6) * 10   -- huevos
       end,
       now() - make_interval(mins => k.mins)
from pairs pr
join public.products p on p.slug = pr.slug
cross join (values (0, 8), (1, 35), (2, 150)) as k(n, mins)
where not exists (select 1 from public.reports where device_hash like 'seed-load-%');

-- Bloque "habia": reportes viejos (2-4 dias) para probar el estado habia
-- (mas de 24h pero dentro de la ventana de 7 dias).
-- Remove anytime: delete from reports where device_hash = 'seed-demo-habia';
with data(store_name, product_slug, avail, price, days_ago) as (values
  ('Agropecuario Egido','aceite','available',1700,2),
  ('Bodega Cuarteles','arroz','available',310,2),
  ('Mercado La Rampa','pollo','out_of_stock',null::integer,3),
  ('Bodega Rotonda','cafe','available',920,3),
  ('MIPYME El Ángel','detergente','available',760,4),
  ('Agropecuario Marianao','platano','available',55,4),
  ('TRD Panamericana','leche-polvo','out_of_stock',null::integer,2),
  ('Agropecuario Circunvalación','pollo','available',360,3)
)
insert into public.reports (store_id, product_id, device_hash, availability, price_cup, created_at)
select s.id, p.id, 'seed-demo-habia', d.avail, d.price, now() - make_interval(days => d.days_ago)
from data d
join public.stores s   on s.name = d.store_name
join public.products p on p.slug = d.product_slug
where not exists (select 1 from public.reports where device_hash = 'seed-demo-habia');
