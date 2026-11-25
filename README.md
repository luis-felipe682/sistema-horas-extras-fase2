# Sistema de Controle de Ponto, Horas Extras e Sobreaviso CLT — Fase 2

Versão funcional do sistema proposto na Fase 1 (protótipo). Implementa as
principais funcionalidades descritas: lançamento de hora extra (50%/100%) e
sobreaviso, compensação cruzada entre os dois, estimativa financeira (CLT),
fluxo de aprovação do supervisor e proteção de dados salariais por perfil.

## Como executar

Pré-requisito: **Node.js 22 ou mais recente** (usa o módulo nativo `node:sqlite`).

```bash
node server.js
```

Não é preciso rodar `npm install` — o projeto não usa nenhuma dependência
externa (só módulos nativos do Node: `node:http`, `node:sqlite`, `node:crypto`).

Depois de iniciar, acesse **http://localhost:3000** no navegador.

Por padrão a porta é `3000` (variável `PORT`) e o segredo de assinatura dos
tokens de sessão vem da variável de ambiente `JWT_SECRET` — se ela não for
definida, o servidor usa uma chave de desenvolvimento e avisa no terminal.
Para rodar com uma chave própria:

```bash
JWT_SECRET="minha-chave-secreta" node server.js
```

Os dados ficam salvos em `dados.sqlite` (criado automaticamente na primeira
execução) e persistem entre reinícios do servidor.

## Contas de demonstração (senha: `123456`)

| Perfil | E-mail |
|---|---|
| Colaborador | joao@empresa.com |
| Colaboradora | maria@empresa.com |
| Supervisor | supervisor@empresa.com |

A tela de login tem botões de acesso rápido para essas três contas.

## O que foi implementado

- Cadastro e login com senha com hash (`scrypt`) e sessão por token assinado
  (HMAC-SHA256, formato equivalente a JWT) — tudo com `node:crypto`, sem
  biblioteca externa.
- Lançamento de hora extra (50%/100%) e sobreaviso, com cálculo automático
  de duração (inclusive turnos que viram a madrugada).
- **Compensação cruzada**: hora extra lançada dentro de uma janela de
  sobreaviso já registrada abate automaticamente as horas do sobreaviso
  (e vice-versa).
- Estimativa financeira por mês: valor da hora normal, subtotal de cada
  adicional, reflexo estimado de DSR (considerando domingos do mês) e total
  estimado vs. total já aprovado.
- Fluxo de aprovação do supervisor (aprovar/reprovar com parecer
  obrigatório), consolidado por colaborador e exportação em CSV.
- **Privacidade por perfil, em duas camadas**: a consulta do supervisor nunca
  traz colunas de salário do banco, e o endpoint financeiro individual
  retorna `403` se chamado por um supervisor.
- Todo texto vindo do usuário (justificativa, nome, parecer) é escapado
  antes de entrar no HTML, e a exportação CSV neutraliza células que
  começam com `=`, `+`, `-` ou `@` (proteção contra injeção de fórmula).

## Limitações conhecidas

- O reflexo de DSR é uma **estimativa simplificada** (considera só domingos,
  não feriados municipais/estaduais) — não substitui o fechamento oficial
  da folha.
- `node:sqlite` é um recurso ainda marcado como experimental pelo Node.js.
- Não há testes automatizados nem HTTPS configurado (uso local/demonstração).
ZZs