-- my_role: o admin da plataforma responde como tenant_admin em qualquer tenant (Edge Functions e telas usam my_role)
create or replace function public.my_role(t uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(app.tenant_role(t), case when app.is_platform_admin() then 'tenant_admin' end)
$$;
