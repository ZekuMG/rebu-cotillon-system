select jsonb_agg(jsonb_build_object(
  'id', log.id,
  'created_at', log.created_at,
  'action', log.action,
  'user', coalesce(log.user_name, log.user),
  'reason', log.reason,
  'details', log.details
) order by log.created_at) as related_edits
from public.logs as log
where (
    log.details::text like '%6920250626109%'
    or log.details::text like '%7798132038888%'
  )
  and log.action in ('Edición Producto', 'Importacion Imagenes Productos');
