# Área da campanha (Supabase)

A área privada do Radar de Votos (tela `#campanha`) guarda os dados da equipe no projeto Supabase
**radar-de-votos** (`stnnlwsspqogykieaygh`, região São Paulo).

- `migrations/`: tabelas, regras de acesso (RLS) e funções do banco, na ordem em que foram aplicadas.
- `functions/equipe/`: função que cria a campanha e o administrador (com o código de acesso), cuida da equipe
  (adicionar, mudar papel, remover), redefine senhas e exclui a campanha. As contas são criadas já confirmadas,
  sem depender de e-mail.

Cada registro pertence a uma campanha. Só quem é membro dela lê e grava. Quem criou um registro pode apagá-lo,
e o administrador pode apagar qualquer um. O código de acesso do administrador fica no banco só cifrado (bcrypt), na tabela
`config_privada`, que não é lida pela API.

Para trocar o código de acesso (no SQL Editor do Supabase), sem traços e em maiúsculas:

```sql
update public.config_privada set valor = extensions.crypt('NOVOCODIGO', extensions.gen_salt('bf', 10))
where chave = 'codigo_admin';
```
