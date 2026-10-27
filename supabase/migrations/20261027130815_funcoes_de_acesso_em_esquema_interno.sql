-- As funções que as regras de acesso usam ficam num esquema que a API não expõe
-- (as regras guardam a referência da função, então continuam valendo depois da mudança de esquema)
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated, service_role;
alter function public.eh_membro(uuid) set schema privado;
alter function public.eh_admin(uuid) set schema privado;
