-- READ ONLY. Run after 20260810_incremental_order_member_points.sql and before
-- deciding whether historical partial payments should receive points now.
select
  o.id as order_id,
  o.member_id,
  c.name as member_name,
  o.paid_total,
  o.total_amount,
  o.points_credited,
  floor(least(greatest(o.paid_total, 0), greatest(o.total_amount, 0)) / 500)::bigint
    - o.points_credited as points_to_credit
from public.orders o
join public.clients c on c.id = o.member_id
where o.is_active is true
  and lower(coalesce(o.status, '')) <> 'cancelado'
  and o.paid_total > 0
  and o.paid_total < o.total_amount
  and o.points_accounting_mode = 'legacy'
  and floor(least(greatest(o.paid_total, 0), greatest(o.total_amount, 0)) / 500)::bigint
        > o.points_credited
order by points_to_credit desc, o.created_at;

