// Equipe da área privada do Radar de Votos.
// - criar_campanha: primeiro acesso; cria a campanha e a conta do administrador (precisa do código de acesso)
// - recuperar_admin: administrador que esqueceu a senha cadastra outra (precisa do código de acesso)
// - adicionar_membro, mudar_papel, remover_membro, redefinir_senha, excluir_campanha: só administradores da campanha
// As contas são criadas já confirmadas, sem depender de e-mail. A função confere sozinha quem chama
// (código de acesso ou sessão do usuário), por isso é publicada sem a checagem automática de JWT.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class Falha extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

const texto = (v: unknown, max = 160) => String(v ?? '').trim().slice(0, max);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function validarSenha(s: string) {
  if (s.length < 8) throw new Falha(400, 'A senha precisa ter pelo menos 8 caracteres.');
}
function traduzir(m: string) {
  if (/password/i.test(m)) return 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.';
  if (/email/i.test(m)) return 'E-mail inválido.';
  return 'Não foi possível concluir: ' + m;
}

async function quemChama(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Falha(401, 'Entre na sua conta para continuar.');
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Falha(401, 'Sua sessão expirou. Entre de novo.');
  return data.user;
}
async function papelDe(uid: string, campanha: string) {
  const { data } = await sb.from('membros').select('papel').eq('campanha_id', campanha).eq('user_id', uid).maybeSingle();
  return data?.papel as string | undefined;
}
async function exigirAdmin(uid: string, campanha: string) {
  if (await papelDe(uid, campanha) !== 'admin') throw new Falha(403, 'Só um administrador da campanha pode fazer isso.');
}
async function exigirMembro(uid: string, campanha: string) {
  if (!(await papelDe(uid, campanha))) throw new Falha(404, 'Essa pessoa não está na equipe.');
}
// a campanha nunca fica sem administrador
async function garantirOutroAdmin(campanha: string, alvo: string) {
  if (await papelDe(alvo, campanha) !== 'admin') return;
  const { count } = await sb.from('membros').select('*', { count: 'exact', head: true })
    .eq('campanha_id', campanha).eq('papel', 'admin').neq('user_id', alvo);
  if (!count) throw new Falha(400, 'A campanha precisa ter pelo menos um administrador.');
}
async function exigirCodigo(codigo: unknown) {
  const { data, error } = await sb.rpc('verificar_codigo', { codigo: texto(codigo, 100).toUpperCase().replace(/[^A-Z0-9]/g, '') });
  if (error) throw new Falha(500, 'Não foi possível conferir o código agora.');
  if (data !== true) throw new Falha(403, 'Código de acesso inválido.');
}
// conta que não está em nenhuma campanha deixa de existir
async function apagarSeSemCampanha(uid: string) {
  const { count, error } = await sb.from('membros').select('*', { count: 'exact', head: true }).eq('user_id', uid);
  if (!error && count === 0) await sb.auth.admin.deleteUser(uid);
}
// cria a conta (já confirmada) ou devolve a que já existe com esse e-mail (a senha dela não muda)
async function contaPorEmail(email: string, senha: string, nome: string) {
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
  if (!error) return { id: data.user.id, nova: true };
  const { data: id } = await sb.rpc('usuario_por_email', { e: email });
  if (id) return { id: id as string, nova: false };
  throw new Falha(400, traduzir(error.message));
}
function dadosPessoa(b: Record<string, unknown>) {
  const nome = texto(b.nome, 120), email = texto(b.email, 160).toLowerCase(), senha = String(b.senha ?? '');
  if (!nome) throw new Falha(400, 'Informe o nome.');
  if (!emailOk(email)) throw new Falha(400, 'E-mail inválido.');
  validarSenha(senha);
  return { nome, email, senha };
}

type Acao = (req: Request, b: Record<string, unknown>) => Promise<unknown>;
const ACOES: Record<string, Acao> = {
  async criar_campanha(_req, b) {
    await exigirCodigo(b.codigo);
    const c = (b.campanha || {}) as Record<string, unknown>;
    const nomeCampanha = texto(c.nome, 120);
    if (nomeCampanha.length < 2) throw new Falha(400, 'Dê um nome para a campanha.');
    const { nome, email, senha } = dadosPessoa(b);
    const conta = await contaPorEmail(email, senha, nome);
    const { data: camp, error } = await sb.from('campanhas').insert({
      nome: nomeCampanha, candidato: texto(c.candidato, 120) || null, cargo: texto(c.cargo, 60) || null,
      ano: Number(c.ano) || null, municipio_cd: texto(c.municipio_cd, 10) || null,
    }).select('id').single();
    if (error) throw new Falha(500, 'Não foi possível criar a campanha.');
    const { error: e2 } = await sb.from('membros').insert({ campanha_id: camp.id, user_id: conta.id, nome, email, papel: 'admin' });
    if (e2) throw new Falha(500, 'Não foi possível cadastrar o administrador.');
    return { ok: true, campanha_id: camp.id, conta_nova: conta.nova };
  },

  async recuperar_admin(_req, b) {
    await exigirCodigo(b.codigo);
    const email = texto(b.email, 160).toLowerCase(), senha = String(b.senha ?? '');
    validarSenha(senha);
    const { data: id } = await sb.rpc('usuario_por_email', { e: email });
    if (!id) throw new Falha(404, 'Não há conta com esse e-mail.');
    const { count } = await sb.from('membros').select('*', { count: 'exact', head: true }).eq('user_id', id).eq('papel', 'admin');
    if (!count) throw new Falha(403, 'Essa conta não é administradora. Peça ao administrador da campanha para redefinir a sua senha.');
    const { error } = await sb.auth.admin.updateUserById(id as string, { password: senha });
    if (error) throw new Falha(400, traduzir(error.message));
    return { ok: true };
  },

  async adicionar_membro(req, b) {
    const eu = await quemChama(req);
    const campanha = texto(b.campanha_id, 40);
    await exigirAdmin(eu.id, campanha);
    const { nome, email, senha } = dadosPessoa(b);
    const conta = await contaPorEmail(email, senha, nome);
    const { error } = await sb.from('membros').upsert(
      { campanha_id: campanha, user_id: conta.id, nome, email, papel: b.papel === 'admin' ? 'admin' : 'membro' },
      { onConflict: 'campanha_id,user_id' });
    if (error) throw new Falha(500, 'Não foi possível adicionar à equipe.');
    return { ok: true, conta_nova: conta.nova };
  },

  async mudar_papel(req, b) {
    const eu = await quemChama(req);
    const campanha = texto(b.campanha_id, 40), alvo = texto(b.user_id, 40), papel = b.papel === 'admin' ? 'admin' : 'membro';
    await exigirAdmin(eu.id, campanha);
    await exigirMembro(alvo, campanha);
    if (papel === 'membro') await garantirOutroAdmin(campanha, alvo);
    const { error } = await sb.from('membros').update({ papel }).eq('campanha_id', campanha).eq('user_id', alvo);
    if (error) throw new Falha(500, 'Não foi possível mudar o papel.');
    return { ok: true };
  },

  async remover_membro(req, b) {
    const eu = await quemChama(req);
    const campanha = texto(b.campanha_id, 40), alvo = texto(b.user_id, 40);
    await exigirAdmin(eu.id, campanha);
    await exigirMembro(alvo, campanha);
    await garantirOutroAdmin(campanha, alvo);
    const { error } = await sb.from('membros').delete().eq('campanha_id', campanha).eq('user_id', alvo);
    if (error) throw new Falha(500, 'Não foi possível remover da equipe.');
    await apagarSeSemCampanha(alvo);
    return { ok: true };
  },

  async redefinir_senha(req, b) {
    const eu = await quemChama(req);
    const campanha = texto(b.campanha_id, 40), alvo = texto(b.user_id, 40), senha = String(b.senha ?? '');
    await exigirAdmin(eu.id, campanha);
    await exigirMembro(alvo, campanha);
    validarSenha(senha);
    const { error } = await sb.auth.admin.updateUserById(alvo, { password: senha });
    if (error) throw new Falha(400, traduzir(error.message));
    return { ok: true };
  },

  // apaga a campanha com todos os dados; pede o nome da campanha digitado para confirmar
  async excluir_campanha(req, b) {
    const eu = await quemChama(req);
    const campanha = texto(b.campanha_id, 40);
    await exigirAdmin(eu.id, campanha);
    const { data: camp } = await sb.from('campanhas').select('nome').eq('id', campanha).single();
    if (!camp || texto(b.confirmacao, 120).toLowerCase() !== camp.nome.trim().toLowerCase())
      throw new Falha(400, 'Para excluir, digite o nome da campanha exatamente como está.');
    const { data: ms } = await sb.from('membros').select('user_id').eq('campanha_id', campanha);
    const { error } = await sb.from('campanhas').delete().eq('id', campanha);
    if (error) throw new Falha(500, 'Não foi possível excluir a campanha.');
    for (const m of ms || []) await apagarSeSemCampanha(m.user_id);
    return { ok: true };
  },
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta(405, { erro: 'Use POST.' });
  try {
    const b = await req.json().catch(() => ({}));
    const acao = String(b?.acao);
    if (!Object.hasOwn(ACOES, acao)) return resposta(400, { erro: 'Ação desconhecida.' });
    const f = ACOES[acao];
    return resposta(200, await f(req, b));
  } catch (e) {
    if (e instanceof Falha) return resposta(e.status, { erro: e.message });
    console.error(e);
    return resposta(500, { erro: 'Erro inesperado. Tente de novo.' });
  }
});
