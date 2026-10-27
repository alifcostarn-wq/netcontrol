-- Área privada da campanha (Radar de Votos): equipe, eleitores e apoiadores, demandas, plano de ação, agenda e metas.
-- Cada registro pertence a uma campanha e só quem é membro dela lê e grava (RLS).
-- Contas e membros são criados pela função "equipe" (service role), nunca direto pela API.

create extension if not exists pgcrypto with schema extensions;

create table public.campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  candidato text,
  cargo text,
  ano int check (ano between 2020 and 2100),
  municipio_cd text,
  criado_em timestamptz not null default now()
);

create table public.membros (
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  email text not null,
  papel text not null default 'membro' check (papel in ('admin', 'membro')),
  criado_em timestamptz not null default now(),
  primary key (campanha_id, user_id)
);
create index membros_user_idx on public.membros (user_id);

-- quem é da campanha (security definer para não cair na própria regra de membros)
create function public.eh_membro(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros m where m.campanha_id = c and m.user_id = auth.uid())
$$;
create function public.eh_admin(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros m where m.campanha_id = c and m.user_id = auth.uid() and m.papel = 'admin')
$$;

create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 160),
  telefone text,
  email text,
  municipio_cd text,
  municipio text,
  bairro text,
  endereco text,
  zona int check (zona between 1 and 999),
  secao int check (secao between 1 and 9999),
  local_votacao text,
  tipo text not null default 'eleitor' check (tipo in ('eleitor', 'apoiador', 'lideranca', 'voluntario')),
  voto text not null default 'indefinido' check (voto in ('certo', 'provavel', 'indeciso', 'contrario', 'indefinido')),
  votos_estimados int not null default 1 check (votos_estimados between 0 and 1000000),
  lideranca_id uuid,
  responsavel_id uuid,
  consentimento boolean not null default false,
  observacoes text check (char_length(observacoes) <= 5000),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (campanha_id, id),
  foreign key (campanha_id, responsavel_id) references public.membros (campanha_id, user_id) on delete set null (responsavel_id)
);
alter table public.pessoas add foreign key (campanha_id, lideranca_id) references public.pessoas (campanha_id, id) on delete set null (lideranca_id);
create index pessoas_campanha_idx on public.pessoas (campanha_id, nome);
create index pessoas_lideranca_idx on public.pessoas (campanha_id, lideranca_id);
create index pessoas_responsavel_idx on public.pessoas (campanha_id, responsavel_id);

create table public.demandas (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  pessoa_id uuid,
  solicitante text,
  telefone text,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  descricao text check (char_length(descricao) <= 5000),
  categoria text not null default 'outros',
  municipio_cd text,
  municipio text,
  bairro text,
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'urgente')),
  status text not null default 'aberta' check (status in ('aberta', 'andamento', 'atendida', 'nao_atendida')),
  responsavel_id uuid,
  prazo date,
  concluida_em date,
  resultado text check (char_length(resultado) <= 5000),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (campanha_id, pessoa_id) references public.pessoas (campanha_id, id) on delete set null (pessoa_id),
  foreign key (campanha_id, responsavel_id) references public.membros (campanha_id, user_id) on delete set null (responsavel_id)
);
create index demandas_campanha_idx on public.demandas (campanha_id, status);
create index demandas_pessoa_idx on public.demandas (campanha_id, pessoa_id);
create index demandas_responsavel_idx on public.demandas (campanha_id, responsavel_id);

create table public.acoes (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  descricao text check (char_length(descricao) <= 5000),
  eixo text not null default 'mobilizacao',
  municipio_cd text,
  municipio text,
  bairro text,
  responsavel_id uuid,
  prazo date,
  status text not null default 'a_fazer' check (status in ('a_fazer', 'andamento', 'concluida', 'cancelada')),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (campanha_id, responsavel_id) references public.membros (campanha_id, user_id) on delete set null (responsavel_id)
);
create index acoes_campanha_idx on public.acoes (campanha_id, status);
create index acoes_responsavel_idx on public.acoes (campanha_id, responsavel_id);

create table public.agenda (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  tipo text not null default 'reuniao',
  inicio timestamptz not null,
  fim timestamptz,
  local text,
  municipio_cd text,
  municipio text,
  bairro text,
  responsavel_id uuid,
  publico_estimado int check (publico_estimado >= 0),
  status text not null default 'agendado' check (status in ('agendado', 'realizado', 'cancelado')),
  observacoes text check (char_length(observacoes) <= 5000),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim is null or fim >= inicio),
  foreign key (campanha_id, responsavel_id) references public.membros (campanha_id, user_id) on delete set null (responsavel_id)
);
create index agenda_campanha_idx on public.agenda (campanha_id, inicio);
create index agenda_responsavel_idx on public.agenda (campanha_id, responsavel_id);

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  municipio_cd text not null,
  municipio text not null,
  bairro text not null default '',
  meta_votos int not null check (meta_votos >= 0),
  observacoes text check (char_length(observacoes) <= 5000),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (campanha_id, municipio_cd, bairro)
);

-- autor e datas gravados pelo banco; um registro nunca muda de campanha
create function public.antes_de_gravar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    new.criado_em := now();
  else
    new.campanha_id := old.campanha_id;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

-- regras de acesso: membros leem, criam e editam; apaga quem criou o registro ou um administrador
alter table public.campanhas enable row level security;
alter table public.membros enable row level security;
create policy campanhas_ver on public.campanhas for select to authenticated using (public.eh_membro(id));
create policy campanhas_editar on public.campanhas for update to authenticated using (public.eh_admin(id)) with check (public.eh_admin(id));
create policy membros_ver on public.membros for select to authenticated using (public.eh_membro(campanha_id));

do $$
declare t text;
begin
  foreach t in array array['pessoas', 'demandas', 'acoes', 'agenda', 'metas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.eh_membro(campanha_id))', t || '_ver', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.eh_membro(campanha_id))', t || '_criar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.eh_membro(campanha_id)) with check (public.eh_membro(campanha_id))', t || '_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.eh_admin(campanha_id) or (criado_por = (select auth.uid()) and public.eh_membro(campanha_id)))', t || '_apagar', t);
    execute format('create trigger antes_de_gravar before insert or update on public.%I for each row execute function public.antes_de_gravar()', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
revoke all on public.campanhas, public.membros from anon;

-- código de acesso do administrador (guardado cifrado; ninguém lê pela API)
create table public.config_privada (chave text primary key, valor text not null);
alter table public.config_privada enable row level security;
revoke all on public.config_privada from anon, authenticated;

create function public.verificar_codigo(codigo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.valor = extensions.crypt(codigo, c.valor) from public.config_privada c where c.chave = 'codigo_admin'), false)
$$;
create function public.usuario_por_email(e text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(e)) limit 1
$$;

-- números do painel (com as mesmas regras de acesso de quem consulta)
create function public.resumo_campanha(c uuid) returns json
language sql stable set search_path = '' as $$
  select json_build_object(
    'pessoas', (select count(*) from public.pessoas p where p.campanha_id = c),
    'por_tipo', (select coalesce(json_object_agg(x.tipo, x.n), '{}'::json) from (select p.tipo, count(*) n from public.pessoas p where p.campanha_id = c group by p.tipo) x),
    'por_voto', (select coalesce(json_object_agg(x.voto, json_build_object('pessoas', x.n, 'votos', x.v)), '{}'::json)
                 from (select p.voto, count(*) n, sum(p.votos_estimados) v from public.pessoas p where p.campanha_id = c group by p.voto) x),
    'municipios', (select coalesce(json_agg(x order by x.votos desc, x.pessoas desc), '[]'::json) from (
                   select p.municipio_cd, max(p.municipio) municipio, count(*) pessoas,
                          coalesce(sum(p.votos_estimados) filter (where p.voto in ('certo', 'provavel')), 0) votos
                   from public.pessoas p where p.campanha_id = c and p.municipio_cd is not null group by p.municipio_cd) x),
    'liderancas', (select coalesce(json_agg(x order by x.votos desc), '[]'::json) from (
                   select l.id, l.nome, l.municipio, count(p.id) pessoas,
                          coalesce(sum(p.votos_estimados) filter (where p.voto in ('certo', 'provavel')), 0) votos
                   from public.pessoas l join public.pessoas p on p.campanha_id = l.campanha_id and p.lideranca_id = l.id
                   where l.campanha_id = c group by l.id order by votos desc limit 10) x),
    'demandas', (select coalesce(json_object_agg(x.status, x.n), '{}'::json) from (select d.status, count(*) n from public.demandas d where d.campanha_id = c group by d.status) x),
    'demandas_atrasadas', (select count(*) from public.demandas d where d.campanha_id = c and d.status in ('aberta', 'andamento') and d.prazo < current_date),
    'acoes', (select coalesce(json_object_agg(x.status, x.n), '{}'::json) from (select a.status, count(*) n from public.acoes a where a.campanha_id = c group by a.status) x),
    'acoes_atrasadas', (select count(*) from public.acoes a where a.campanha_id = c and a.status in ('a_fazer', 'andamento') and a.prazo < current_date),
    'proximos', (select coalesce(json_agg(x order by x.inicio), '[]'::json) from (
                 select g.id, g.titulo, g.tipo, g.inicio, g.local, g.municipio from public.agenda g
                 where g.campanha_id = c and g.status = 'agendado' and g.inicio >= now() - interval '3 hours' order by g.inicio limit 5) x),
    'metas', (select coalesce(sum(m.meta_votos), 0) from public.metas m where m.campanha_id = c and m.bairro = '')
  )
$$;

-- progresso de cada meta: votos certos e prováveis cadastrados no município (ou bairro)
create function public.progresso_metas(c uuid)
returns table (id uuid, municipio_cd text, municipio text, bairro text, meta_votos int, observacoes text, certos bigint, provaveis bigint, pessoas bigint)
language sql stable set search_path = '' as $$
  select m.id, m.municipio_cd, m.municipio, m.bairro, m.meta_votos, m.observacoes,
         coalesce(sum(p.votos_estimados) filter (where p.voto = 'certo'), 0),
         coalesce(sum(p.votos_estimados) filter (where p.voto = 'provavel'), 0),
         count(p.id)
  from public.metas m
  left join public.pessoas p on p.campanha_id = m.campanha_id and p.municipio_cd = m.municipio_cd
       and (m.bairro = '' or lower(btrim(p.bairro)) = lower(btrim(m.bairro)))
  where m.campanha_id = c
  group by m.id
  order by m.municipio, m.bairro
$$;

revoke execute on function public.eh_membro(uuid), public.eh_admin(uuid), public.resumo_campanha(uuid), public.progresso_metas(uuid),
  public.verificar_codigo(text), public.usuario_por_email(text), public.antes_de_gravar() from public, anon;
grant execute on function public.eh_membro(uuid), public.eh_admin(uuid), public.resumo_campanha(uuid), public.progresso_metas(uuid) to authenticated, service_role;
revoke execute on function public.verificar_codigo(text), public.usuario_por_email(text) from authenticated;
grant execute on function public.verificar_codigo(text), public.usuario_por_email(text) to service_role;
