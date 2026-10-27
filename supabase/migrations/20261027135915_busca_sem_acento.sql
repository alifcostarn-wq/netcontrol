-- Busca sem diferença de acentos e maiúsculas ("joao" acha "João"): coluna "busca" calculada pelo banco
create extension if not exists unaccent with schema extensions;
create function privado.sem_acento(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')))
$$;
revoke execute on function privado.sem_acento(text) from public, anon;
grant execute on function privado.sem_acento(text) to authenticated, service_role;

alter table public.pessoas add column busca text generated always as
  (privado.sem_acento(nome || ' ' || coalesce(telefone, '') || ' ' || coalesce(bairro, '') || ' ' || coalesce(local_votacao, '') || ' ' || coalesce(email, ''))) stored;
alter table public.demandas add column busca text generated always as
  (privado.sem_acento(titulo || ' ' || coalesce(solicitante, '') || ' ' || coalesce(telefone, '') || ' ' || coalesce(bairro, '') || ' ' || coalesce(descricao, ''))) stored;
alter table public.acoes add column busca text generated always as
  (privado.sem_acento(titulo || ' ' || coalesce(descricao, '') || ' ' || coalesce(bairro, ''))) stored;
alter table public.agenda add column busca text generated always as
  (privado.sem_acento(titulo || ' ' || coalesce(local, '') || ' ' || coalesce(bairro, ''))) stored;
