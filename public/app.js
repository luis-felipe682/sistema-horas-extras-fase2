// app.js
// Lógica do front-end. Nenhuma dependência externa.

// ---------------------------------------------------------------------
// Estado e utilidades gerais
// ---------------------------------------------------------------------

let estado = {
  token: localStorage.getItem('he_token') || null,
  usuario: null
};

function escapeHtml(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

function mesAnoAtual() {
  return new Date().toISOString().slice(0, 7);
}

async function api(caminho, opcoes = {}) {
  const cabecalhos = { 'Content-Type': 'application/json', ...(opcoes.headers || {}) };
  if (estado.token) cabecalhos['Authorization'] = `Bearer ${estado.token}`;

  const resposta = await fetch(caminho, { ...opcoes, headers: cabecalhos });
  const dados = await resposta.json().catch(() => ({}));

  if (resposta.status === 401) {
    sair();
    throw new Error(dados.erro || 'Sessão expirada.');
  }
  if (!resposta.ok) {
    throw new Error(dados.erro || 'Erro inesperado.');
  }
  return dados;
}

function sair() {
  estado = { token: null, usuario: null };
  localStorage.removeItem('he_token');
  mostrarView('view-auth');
}

function mostrarView(idView) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('escondido'));
  document.getElementById(idView).classList.remove('escondido');
}

// ---------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------

async function iniciar() {
  configurarEventos();
  iniciarRelogio();

  if (!estado.token) {
    mostrarView('view-auth');
    return;
  }

  try {
    const { usuario } = await api('/api/auth/me');
    estado.usuario = usuario;
    entrarNaTelaCorreta();
  } catch {
    mostrarView('view-auth');
  }
}

function entrarNaTelaCorreta() {
  if (estado.usuario.perfil === 'SUPERVISOR') {
    document.getElementById('sup-nome').textContent = estado.usuario.nome;
    mostrarView('view-supervisor');
    carregarTudoSupervisor();
  } else {
    document.getElementById('col-nome').textContent = estado.usuario.nome;
    document.getElementById('col-cargo').textContent = estado.usuario.cargo || '';
    document.getElementById('perfil-cargo').value = estado.usuario.cargo || '';
    document.getElementById('perfil-salario').value = estado.usuario.salario || 0;
    document.getElementById('perfil-carga').value = estado.usuario.carga_horaria_mensal || 220;
    mostrarView('view-colaborador');
    carregarResumoFinanceiro();
    carregarHistoricoColaborador();
  }
}

function iniciarRelogio() {
  const span = document.getElementById('relogio');
  if (!span) return;
  const atualizar = () => { span.textContent = new Date().toLocaleTimeString('pt-BR'); };
  atualizar();
  setInterval(atualizar, 1000);
}

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------

function configurarEventos() {
  // Contas de demonstração só aparecem em ambientes locais de desenvolvimento.
  const ambienteLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  document.getElementById('demo-caixa').classList.toggle('escondido', !ambienteLocal);

  document.querySelectorAll('[data-password-target]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const campo = document.getElementById(botao.dataset.passwordTarget);
      const mostrar = campo.type === 'password';
      campo.type = mostrar ? 'text' : 'password';
      botao.textContent = mostrar ? 'Ocultar' : 'Mostrar';
      botao.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    });
  });
  document.getElementById('link-recuperar-senha').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-erro').textContent = 'Para redefinir sua senha, fale com o administrador da sua empresa.';
  });

  document.querySelectorAll('.aba-auth').forEach((botao) => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('.aba-auth').forEach((b) => b.classList.remove('ativa'));
      botao.classList.add('ativa');
      const aba = botao.dataset.aba;
      document.getElementById('form-login').classList.toggle('escondido', aba !== 'login');
      document.getElementById('form-cadastro').classList.toggle('escondido', aba !== 'cadastro');
    });
  });

  document.getElementById('cad-perfil').addEventListener('change', (e) => {
    document.getElementById('campo-cad-salario').classList.toggle('escondido', e.target.value === 'SUPERVISOR');
  });

  document.querySelectorAll('[data-demo-email]').forEach((botao) => {
    botao.addEventListener('click', async () => {
      document.getElementById('login-email').value = botao.dataset.demoEmail;
      document.getElementById('login-senha').value = '123456';
      await fazerLogin(botao.dataset.demoEmail, '123456');
    });
  });

  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    await fazerLogin(email, senha);
  });

  document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erroEl = document.getElementById('cadastro-erro');
    erroEl.textContent = '';
    try {
      const corpo = {
        nome: document.getElementById('cad-nome').value.trim(),
        email: document.getElementById('cad-email').value.trim(),
        senha: document.getElementById('cad-senha').value,
        perfil: document.getElementById('cad-perfil').value,
        cargo: document.getElementById('cad-cargo').value.trim(),
        salario: Number(document.getElementById('cad-salario').value) || 0
      };
      const dados = await api('/api/auth/cadastro', { method: 'POST', body: JSON.stringify(corpo) });
      logarComToken(dados.token, dados.usuario);
    } catch (erro) {
      erroEl.textContent = erro.message;
    }
  });

  document.getElementById('btn-sair-colaborador').addEventListener('click', sair);
  document.getElementById('btn-sair-supervisor').addEventListener('click', sair);

  document.querySelectorAll('.aba-conteudo').forEach((botao) => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('.aba-conteudo').forEach((b) => b.classList.remove('ativa'));
      document.querySelectorAll('#view-colaborador .painel').forEach((p) => p.classList.add('escondido'));
      botao.classList.add('ativa');
      document.getElementById(botao.dataset.painel).classList.remove('escondido');
    });
  });

  document.getElementById('resumo-mes-ano').addEventListener('change', carregarResumoFinanceiro);

  document.getElementById('reg-tipo').addEventListener('change', atualizarCamposFormularioRegistro);
  document.getElementById('reg-data').addEventListener('change', verificarCompensacaoNaData);
  document.getElementById('reg-tipo').addEventListener('change', verificarCompensacaoNaData);
  atualizarCamposFormularioRegistro();

  document.getElementById('form-registro').addEventListener('submit', salvarRegistro);
  document.getElementById('filtro-hist-tipo').addEventListener('change', carregarHistoricoColaborador);
  document.getElementById('filtro-hist-status').addEventListener('change', carregarHistoricoColaborador);

  document.getElementById('form-perfil').addEventListener('submit', salvarPerfil);

  document.getElementById('sup-mes-ano').addEventListener('change', carregarTudoSupervisor);
  document.getElementById('filtro-sup-colaborador').addEventListener('change', carregarRegistrosSupervisor);
  document.getElementById('filtro-sup-tipo').addEventListener('change', carregarRegistrosSupervisor);
  document.getElementById('filtro-sup-status').addEventListener('change', carregarRegistrosSupervisor);
  document.getElementById('btn-exportar-csv').addEventListener('click', exportarCSV);

  document.getElementById('modal-cancelar').addEventListener('click', fecharModal);
}

async function fazerLogin(email, senha) {
  const erroEl = document.getElementById('login-erro');
  const botao = document.querySelector('#form-login button[type="submit"]');
  erroEl.textContent = '';
  botao.disabled = true;
  botao.textContent = 'Verificando acesso…';
  try {
    const dados = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
    logarComToken(dados.token, dados.usuario);
  } catch (erro) {
    erroEl.textContent = erro.message;
  } finally {
    botao.disabled = false;
    botao.textContent = 'Acessar minha conta';
  }
}

function logarComToken(token, usuario) {
  estado.token = token;
  estado.usuario = usuario;
  localStorage.setItem('he_token', token);
  entrarNaTelaCorreta();
}

// ---------------------------------------------------------------------
// COLABORADOR — resumo financeiro
// ---------------------------------------------------------------------

async function carregarResumoFinanceiro() {
  const mesAno = document.getElementById('resumo-mes-ano').value || mesAnoAtual();
  document.getElementById('resumo-mes-label').textContent = `— ${mesAno}`;

  try {
    const resumo = await api(`/api/colaborador/resumo-financeiro?mes_ano=${mesAno}`);
    const cartoes = [
      ['Salário base', formatarMoeda(resumo.salario_base)],
      ['Valor da hora normal', formatarMoeda(resumo.valor_hora_normal)],
      ['Horas extra 50%', `${resumo.totais_horas.extra_50} h`],
      ['Horas extra 100%', `${resumo.totais_horas.extra_100} h`],
      ['Horas de sobreaviso', `${resumo.totais_horas.sobreaviso} h`],
      ['Subtotal extra 50%', formatarMoeda(resumo.financeiro.subtotal_extra_50)],
      ['Subtotal extra 100%', formatarMoeda(resumo.financeiro.subtotal_extra_100)],
      ['Subtotal sobreaviso (1/3)', formatarMoeda(resumo.financeiro.subtotal_sobreaviso)],
      ['DSR estimado', formatarMoeda(resumo.financeiro.reflexo_dsr_estimado)],
      ['Total aprovado (garantido)', formatarMoeda(resumo.financeiro.total_aprovado_garantido)],
      ['Estimativa total do mês', formatarMoeda(resumo.financeiro.estimativa_total_geral)]
    ];
    document.getElementById('cartoes-resumo').innerHTML = cartoes.map(([rotulo, valor]) => `
      <div class="cartao">
        <span class="rotulo">${escapeHtml(rotulo)}</span>
        <span class="valor">${escapeHtml(valor)}</span>
      </div>
    `).join('');
  } catch (erro) {
    document.getElementById('cartoes-resumo').innerHTML = `<p class="mensagem-erro">${escapeHtml(erro.message)}</p>`;
  }
}

// ---------------------------------------------------------------------
// COLABORADOR — lançar hora extra / sobreaviso
// ---------------------------------------------------------------------

function atualizarCamposFormularioRegistro() {
  const tipo = document.getElementById('reg-tipo').value;
  document.getElementById('campo-reg-porcentagem').classList.toggle('escondido', tipo !== 'HORA_EXTRA');
  document.getElementById('campo-reg-data-fim').classList.toggle('escondido', tipo !== 'SOBREAVISO');
}

async function verificarCompensacaoNaData() {
  const data = document.getElementById('reg-data').value;
  const tipo = document.getElementById('reg-tipo').value;
  const avisoEl = document.getElementById('aviso-compensacao');
  if (!data) { avisoEl.classList.add('escondido'); return; }

  try {
    const info = await api(`/api/colaborador/checar-dia?data=${data}`);
    if (tipo === 'HORA_EXTRA' && info.total_sobreaviso_horas > 0) {
      avisoEl.textContent = `Há ${info.total_sobreaviso_horas}h de sobreaviso registradas nesta data — o tempo trabalhado será abatido automaticamente do sobreaviso.`;
      avisoEl.classList.remove('escondido');
    } else if (tipo === 'SOBREAVISO' && info.total_extra_horas > 0) {
      avisoEl.textContent = `Há ${info.total_extra_horas}h de hora extra já registradas nesta data — elas serão abatidas da duração deste sobreaviso.`;
      avisoEl.classList.remove('escondido');
    } else {
      avisoEl.classList.add('escondido');
    }
  } catch {
    avisoEl.classList.add('escondido');
  }
}

async function salvarRegistro(e) {
  e.preventDefault();
  const erroEl = document.getElementById('reg-erro');
  erroEl.textContent = '';

  const tipo = document.getElementById('reg-tipo').value;
  const corpo = {
    tipo,
    data: document.getElementById('reg-data').value,
    data_fim: tipo === 'SOBREAVISO' ? (document.getElementById('reg-data-fim').value || undefined) : undefined,
    hora_inicio: document.getElementById('reg-hora-inicio').value,
    hora_fim: document.getElementById('reg-hora-fim').value,
    porcentagem: tipo === 'HORA_EXTRA' ? Number(document.getElementById('reg-porcentagem').value) : undefined,
    justificativa: document.getElementById('reg-justificativa').value.trim()
  };

  try {
    await api('/api/colaborador/registros', { method: 'POST', body: JSON.stringify(corpo) });
    document.getElementById('form-registro').reset();
    atualizarCamposFormularioRegistro();
    document.getElementById('aviso-compensacao').classList.add('escondido');
    carregarResumoFinanceiro();
    carregarHistoricoColaborador();
  } catch (erro) {
    erroEl.textContent = erro.message;
  }
}

// ---------------------------------------------------------------------
// COLABORADOR — histórico
// ---------------------------------------------------------------------

function rotuloTipo(tipo) {
  return { PONTO: 'Ponto', HORA_EXTRA: 'Hora extra', SOBREAVISO: 'Sobreaviso' }[tipo] || tipo;
}

function seloStatus(status) {
  const classe = { PENDENTE: 'selo-pendente', APROVADO: 'selo-aprovado', REPROVADO: 'selo-reprovado' }[status] || '';
  const rotulo = { PENDENTE: 'Pendente', APROVADO: 'Aprovado', REPROVADO: 'Reprovado' }[status] || status;
  return `<span class="selo ${classe}">${escapeHtml(rotulo)}</span>`;
}

async function carregarHistoricoColaborador() {
  const tipo = document.getElementById('filtro-hist-tipo').value;
  const status = document.getElementById('filtro-hist-status').value;
  const parametros = new URLSearchParams();
  if (tipo) parametros.set('tipo', tipo);
  if (status) parametros.set('status', status);

  const corpoTabela = document.getElementById('tabela-historico');
  try {
    const { registros } = await api(`/api/colaborador/registros?${parametros}`);
    if (registros.length === 0) {
      corpoTabela.innerHTML = `<tr><td colspan="8">Nenhum registro encontrado.</td></tr>`;
      return;
    }
    corpoTabela.innerHTML = registros.map((r) => `
      <tr>
        <td>${escapeHtml(rotuloTipo(r.tipo))}${r.tipo === 'HORA_EXTRA' ? ` (${r.porcentagem}%)` : ''}</td>
        <td>${formatarData(r.data)}${r.data !== r.data_fim ? ' – ' + formatarData(r.data_fim) : ''}</td>
        <td>${escapeHtml(r.hora_inicio)} – ${escapeHtml(r.hora_fim)}</td>
        <td>${r.duracao_horas} h${r.horas_deduzidas > 0 ? ` <span class="subtitulo">(−${r.horas_deduzidas}h compensada)</span>` : ''}</td>
        <td>${escapeHtml(r.justificativa)}</td>
        <td>${seloStatus(r.status)}</td>
        <td>${escapeHtml(r.resposta_supervisor || '—')}</td>
        <td>${r.status === 'PENDENTE' ? `<button type="button" class="botao-link" data-excluir="${r.id}">Excluir</button>` : ''}</td>
      </tr>
    `).join('');

    corpoTabela.querySelectorAll('[data-excluir]').forEach((botao) => {
      botao.addEventListener('click', async () => {
        if (!confirm('Excluir este lançamento pendente?')) return;
        try {
          await api(`/api/colaborador/registros/${botao.dataset.excluir}`, { method: 'DELETE' });
          carregarHistoricoColaborador();
          carregarResumoFinanceiro();
        } catch (erro) {
          alert(erro.message);
        }
      });
    });
  } catch (erro) {
    corpoTabela.innerHTML = `<tr><td colspan="8" class="mensagem-erro">${escapeHtml(erro.message)}</td></tr>`;
  }
}

// ---------------------------------------------------------------------
// COLABORADOR — perfil
// ---------------------------------------------------------------------

async function salvarPerfil(e) {
  e.preventDefault();
  const sucessoEl = document.getElementById('perfil-sucesso');
  sucessoEl.classList.add('escondido');
  try {
    const corpo = {
      cargo: document.getElementById('perfil-cargo').value.trim(),
      salario: Number(document.getElementById('perfil-salario').value) || 0,
      carga_horaria_mensal: Number(document.getElementById('perfil-carga').value) || 220
    };
    const { usuario } = await api('/api/colaborador/perfil', { method: 'PUT', body: JSON.stringify(corpo) });
    estado.usuario = usuario;
    document.getElementById('col-cargo').textContent = usuario.cargo || '';
    sucessoEl.classList.remove('escondido');
    carregarResumoFinanceiro();
  } catch (erro) {
    alert(erro.message);
  }
}

// ---------------------------------------------------------------------
// SUPERVISOR
// ---------------------------------------------------------------------

async function carregarTudoSupervisor() {
  await carregarColaboradoresFiltro();
  await carregarRegistrosSupervisor();
  await carregarTotaisSupervisor();
}

async function carregarColaboradoresFiltro() {
  try {
    const { colaboradores } = await api('/api/supervisor/colaboradores');
    const select = document.getElementById('filtro-sup-colaborador');
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Todos</option>' +
      colaboradores.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
    select.value = valorAtual;
  } catch (erro) {
    console.error(erro);
  }
}

async function carregarRegistrosSupervisor() {
  const mesAno = document.getElementById('sup-mes-ano').value;
  document.getElementById('sup-mes-label').textContent = mesAno ? `— ${mesAno}` : '— todos os meses';

  const parametros = new URLSearchParams();
  const colaboradorId = document.getElementById('filtro-sup-colaborador').value;
  const tipo = document.getElementById('filtro-sup-tipo').value;
  const status = document.getElementById('filtro-sup-status').value;
  if (colaboradorId) parametros.set('colaborador_id', colaboradorId);
  if (tipo) parametros.set('tipo', tipo);
  if (status) parametros.set('status', status);
  if (mesAno) parametros.set('mes_ano', mesAno);

  const corpoTabela = document.getElementById('tabela-supervisor');
  try {
    const { registros } = await api(`/api/supervisor/registros?${parametros}`);
    if (registros.length === 0) {
      corpoTabela.innerHTML = `<tr><td colspan="7">Nenhum registro encontrado.</td></tr>`;
      return;
    }
    corpoTabela.innerHTML = registros.map((r) => `
      <tr>
        <td><strong>${escapeHtml(r.colaborador_nome)}</strong><div class="subtitulo">${escapeHtml(r.colaborador_cargo || '')}</div></td>
        <td>${escapeHtml(rotuloTipo(r.tipo))}${r.tipo === 'HORA_EXTRA' ? ` (${r.porcentagem}%)` : ''}</td>
        <td>${formatarData(r.data)}${r.data !== r.data_fim ? ' – ' + formatarData(r.data_fim) : ''}</td>
        <td>${r.duracao_horas} h</td>
        <td style="max-width:220px;">${escapeHtml(r.justificativa)}</td>
        <td>${seloStatus(r.status)}</td>
        <td>${r.status === 'PENDENTE' ? `<button type="button" class="botao-link" data-avaliar="${r.id}">Avaliar</button>` : escapeHtml(r.resposta_supervisor || '—')}</td>
      </tr>
    `).join('');

    corpoTabela.querySelectorAll('[data-avaliar]').forEach((botao) => {
      const registro = registros.find((r) => String(r.id) === botao.dataset.avaliar);
      botao.addEventListener('click', () => abrirModalAvaliacao(registro));
    });
  } catch (erro) {
    corpoTabela.innerHTML = `<tr><td colspan="7" class="mensagem-erro">${escapeHtml(erro.message)}</td></tr>`;
  }
}

async function carregarTotaisSupervisor() {
  const mesAno = document.getElementById('sup-mes-ano').value;
  const parametros = mesAno ? `?mes_ano=${mesAno}` : '';

  try {
    const { resumo_geral, consolidado_por_colaborador } = await api(`/api/supervisor/totais${parametros}`);

    const cartoes = [
      ['Colaboradores', resumo_geral.total_colaboradores],
      ['Pendentes de avaliação', resumo_geral.pendentes],
      ['Horas extra 50%', `${resumo_geral.horas_extra_50} h`],
      ['Horas extra 100%', `${resumo_geral.horas_extra_100} h`],
      ['Horas de sobreaviso', `${resumo_geral.horas_sobreaviso} h`]
    ];
    document.getElementById('cartoes-supervisor').innerHTML = cartoes.map(([rotulo, valor]) => `
      <div class="cartao">
        <span class="rotulo">${escapeHtml(rotulo)}</span>
        <span class="valor">${escapeHtml(String(valor))}</span>
      </div>
    `).join('');

    document.getElementById('tabela-consolidado').innerHTML = consolidado_por_colaborador.map((c) => `
      <tr>
        <td>${escapeHtml(c.nome)}</td>
        <td>${escapeHtml(c.cargo || '')}</td>
        <td>${c.extra_50_horas} h</td>
        <td>${c.extra_100_horas} h</td>
        <td>${c.sobreaviso_horas} h</td>
        <td>${c.pendentes}</td>
        <td>${c.aprovados}</td>
        <td>${c.reprovados}</td>
      </tr>
    `).join('');
  } catch (erro) {
    console.error(erro);
  }
}

// ---------------------------------------------------------------------
// SUPERVISOR — modal de avaliação
// ---------------------------------------------------------------------

let registroEmAvaliacao = null;

function abrirModalAvaliacao(registro) {
  registroEmAvaliacao = registro;
  document.getElementById('modal-resumo-registro').textContent =
    `${registro.colaborador_nome} — ${rotuloTipo(registro.tipo)} — ${formatarData(registro.data)} — ${registro.duracao_horas}h`;
  document.getElementById('modal-parecer').value = '';
  document.getElementById('modal-erro').textContent = '';
  document.getElementById('modal-avaliacao').classList.remove('escondido');
}

function fecharModal() {
  registroEmAvaliacao = null;
  document.getElementById('modal-avaliacao').classList.add('escondido');
}

async function avaliarRegistro(status) {
  const erroEl = document.getElementById('modal-erro');
  const parecer = document.getElementById('modal-parecer').value.trim();
  if (!parecer) {
    erroEl.textContent = 'Escreva um parecer antes de confirmar a decisão.';
    return;
  }
  try {
    await api(`/api/supervisor/registros/${registroEmAvaliacao.id}/avaliar`, {
      method: 'PUT',
      body: JSON.stringify({ status, resposta_supervisor: parecer })
    });
    fecharModal();
    carregarRegistrosSupervisor();
    carregarTotaisSupervisor();
  } catch (erro) {
    erroEl.textContent = erro.message;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-aprovar').addEventListener('click', () => avaliarRegistro('APROVADO'));
  document.getElementById('modal-reprovar').addEventListener('click', () => avaliarRegistro('REPROVADO'));
});

// ---------------------------------------------------------------------
// SUPERVISOR — exportar CSV (com proteção contra injeção de fórmula)
// ---------------------------------------------------------------------

function celulaCSV(valor) {
  let texto = String(valor ?? '');
  // Neutraliza injeção de fórmula em planilhas: se começar com =,+,-,@,
  // o Excel/Sheets pode interpretar como fórmula ao abrir o arquivo.
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  texto = texto.replace(/"/g, '""');
  return `"${texto}"`;
}

async function exportarCSV() {
  try {
    const { registros } = await api('/api/supervisor/registros');
    const cabecalho = ['Colaborador', 'Cargo', 'Tipo', 'Data', 'Data fim', 'Duração (h)', 'Justificativa', 'Status', 'Parecer'];
    const linhas = registros.map((r) => [
      r.colaborador_nome, r.colaborador_cargo, rotuloTipo(r.tipo), r.data, r.data_fim,
      r.duracao_horas, r.justificativa, r.status, r.resposta_supervisor
    ]);

    const csv = [cabecalho, ...linhas].map((linha) => linha.map(celulaCSV).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `registros-horas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (erro) {
    alert(erro.message);
  }
}

// ---------------------------------------------------------------------

iniciar();
