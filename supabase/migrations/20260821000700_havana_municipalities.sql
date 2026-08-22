-- Normalize Havana zones to official municipalities.
-- Idempotent: safe on any current state.

update public.stores set barrio = 'Plaza de la Revolución'
where barrio in ('Vedado', 'Nuevo Vedado');

update public.stores set barrio = 'Playa'
where barrio = 'Miramar';

update public.stores set barrio = 'Diez de Octubre'
where barrio in ('Víbora', 'Santos Suárez');
