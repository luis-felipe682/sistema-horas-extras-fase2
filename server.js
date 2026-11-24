// server.js
// Servidor HTTP puro (sem Express) + roteamento manual.
// Só módulos nativos do Node: node:http, node:fs, node:path, node:url.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { hashSenha, verificarSenha, gerarToken, verificarToken } = require('./auth');
const {
  db,
  calcularDuracaoHoras,
  aplicarCompensacaoCruzada,
  calcularResumoFinanceiro
} = require('./database');

const PORTA = process.env.PORT || 3000;
const DIR_PUBLICO = path.join(__dirname, 'public');

// ---------------------------------------------------------------------
// Utilidades de requisição/resposta
// ---------------------------------------------------------------------

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

function enviarJSON(res, status, dados) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corpo)
  });
  res.end(corpo);
}

function lerCorpoJSON(req) {
  return new Promise((resolve, reject) => {
    let dados = '';
    let tamanho = 0;
    req.on('data', (chunk) => {
      tamanho += chunk.length;
      if (tamanho > 2 * 1024 * 1024) {
        req.destroy();
        reject(new ErroHttp(413, 'Corpo da requisição muito grande.'));
        return;
      }
      dados += chunk;
    });
    req.on('end', () => {
      if (!dados) return resolve({});
      try {
        resolve(JSON.parse(dados));
      } catch {
        reject(new ErroHttp(400, 'JSON inválido no corpo da requisição.'));
      }
    });
    req.on('error', reject);
  });
}

function autenticar(req) {
  const cabecalho = req.headers['authorization'] || '';
  const [tipo, token] = cabecalho.split(' ');
  if (tipo !== 'Bearer' || !token) {
    throw new ErroHttp(401, 'Não autenticado. Faça login novamente.');
  }
  try {
    return verificarToken(token);
  } catch {
    throw new ErroHttp(401, 'Sessão inválida ou expirada. Faça login novamente.');
  }
}

function exigirSupervisor(usuarioToken) {
  if (usuarioToken.perfil !== 'SUPERVISOR') {
    throw new ErroHttp(403, 'Acesso restrito a supervisores.');
  }
}

function buscarUsuarioPorId(id) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
}

function usuarioSemSenha(usuario) {
  const { senha_hash, ...resto } = usuario;
  return resto;
}

function validarCampos(obj, campos) {
  for (const campo of campos) {
    if (obj[campo] === undefined || obj[campo] === null || obj[campo] === '') {
      throw new ErroHttp(400, `Campo obrigatório ausente: ${campo}`);
    }
  }
}

// ---------------------------------------------------------------------
// Arquivos estáticos (frontend)
// ---------------------------------------------------------------------

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function servirArquivoEstatico(req, res, caminhoUrl) {
  let caminhoRelativo = caminhoUrl === '/' ? '/index.html' : caminhoUrl;
  caminhoRelativo = path.normalize(caminhoRelativo).replace(/^(\.\.(\/|\\|$))+/, '');
  const caminhoCompleto = path.join(DIR_PUBLICO, caminhoRelativo);

  if (!caminhoCompleto.startsWith(DIR_PUBLICO)) {
    res.writeHead(403);
    return res.end('Proibido.');
  }

  fs.readFile(caminhoCompleto, (erro, conteudo) => {
    if (erro) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado.');
    }
    const extensao = path.extname(caminhoCompleto);
    res.writeHead(200, { 'Content-Type': TIPOS_MIME[extensao] || 'application/octet-stream' });
    res.end(conteudo);
  });
}

// ---------------------------------------------------------------------
// Rotas da API
// ---------------------------------------------------------------------

const rotas = [];
function rota(metodo, padrao, manipulador) {
  // padrao vira regex; :id vira grupo nomeado numérico
  const partes = padrao.split('/').map((parte) =>
    parte.startsWith(':') ? '([^/]+)' : parte
  );
  const regex = new RegExp('^' + partes.join('/') + '$');
  rotas.push({ metodo, regex, manipulador, padrao });
}

// ---- Autenticação ----

rota('POST', '/api/auth/cadastro', async (req, res) => {
  const corpo = await lerCorpoJSON(req);
  validarCampos(corpo, ['nome', 'email', 'senha', 'perfil']);

  const perfil = String(corpo.perfil).toUpperCase();
  if (!['COLABORADOR', 'SUPERVISOR'].includes(perfil)) {
    throw new ErroHttp(400, 'Perfil deve ser COLABORADOR ou SUPERVISOR.');
  }
  if (String(corpo.senha).length < 6) {
    throw new ErroHttp(400, 'A senha deve ter pelo menos 6 caracteres.');
  }

  const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(corpo.email);
  if (existente) throw new ErroHttp(409, 'Já existe uma conta com este e-mail.');

  const salario = perfil === 'COLABORADOR' ? Number(corpo.salario) || 0 : 0;
  const cargaHoraria = Number(corpo.carga_horaria_mensal) || 220;

  const resultado = db
    .prepare(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil, cargo, salario, carga_horaria_mensal)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(String(corpo.nome).trim(), String(corpo.email).trim().toLowerCase(), hashSenha(corpo.senha), perfil,
         corpo.cargo ? String(corpo.cargo).trim() : null, salario, cargaHoraria);

  const usuario = buscarUsuarioPorId(resultado.lastInsertRowid);
  const token = gerarToken({ id: usuario.id, perfil: usuario.perfil });
  enviarJSON(res, 201, { token, usuario: usuarioSemSenha(usuario) });
});

rota('POST', '/api/auth/login', async (req, res) => {
  const corpo = await lerCorpoJSON(req);
  validarCampos(corpo, ['email', 'senha']);

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(String(corpo.email).trim().toLowerCase());
  if (!usuario || !verificarSenha(corpo.senha, usuario.senha_hash)) {
    throw new ErroHttp(401, 'E-mail ou senha incorretos.');
  }

  const token = gerarToken({ id: usuario.id, perfil: usuario.perfil });
  enviarJSON(res, 200, { token, usuario: usuarioSemSenha(usuario) });
});

rota('GET', '/api/auth/me', async (req, res) => {
  const tokenPayload = autenticar(req);
  const usuario = buscarUsuarioPorId(tokenPayload.id);
  if (!usuario) throw new ErroHttp(401, 'Usuário não encontrado.');
  enviarJSON(res, 200, { usuario: usuarioSemSenha(usuario) });
});

// ---- Colaborador ----

rota('GET', '/api/colaborador/resumo-financeiro', async (req, res, _match, query) => {
  const tokenPayload = autenticar(req);
  if (tokenPayload.perfil === 'SUPERVISOR') {
    throw new ErroHttp(403, 'Supervisores não têm acesso a dados financeiros individuais.');
  }
  const usuario = buscarUsuarioPorId(tokenPayload.id);
  const resumo = calcularResumoFinanceiro(usuario, query.get('mes_ano') || null);
  enviarJSON(res, 200, resumo);
});

rota('GET', '/api/colaborador/registros', async (req, res, _match, query) => {
  const tokenPayload = autenticar(req);

  let sql = 'SELECT * FROM registros WHERE colaborador_id = ?';
  const params = [tokenPayload.id];

  if (query.get('tipo')) { sql += ' AND tipo = ?'; params.push(query.get('tipo')); }
  if (query.get('status')) { sql += ' AND status = ?'; params.push(query.get('status')); }
  if (query.get('mes_ano')) { sql += " AND substr(data, 1, 7) = ?"; params.push(query.get('mes_ano')); }
  sql += ' ORDER BY data DESC, id DESC';

  const registros = db.prepare(sql).all(...params);
  enviarJSON(res, 200, { registros });
});

rota('GET', '/api/colaborador/checar-dia', async (req, res, _match, query) => {
  const tokenPayload = autenticar(req);
  const data = query.get('data');
  if (!data) throw new ErroHttp(400, 'Informe o parâmetro "data" (YYYY-MM-DD).');

  const registros = db
    .prepare(`SELECT * FROM registros WHERE colaborador_id = ? AND status != 'REPROVADO'`)
    .all(tokenPayload.id);

  let totalSobreavisoNaData = 0;
  let totalExtraNaData = 0;
  for (const r of registros) {
    const cobreData = r.data <= data && data <= r.data_fim;
    if (!cobreData) continue;
    if (r.tipo === 'SOBREAVISO') totalSobreavisoNaData += r.duracao_horas;
    if (r.tipo === 'HORA_EXTRA') totalExtraNaData += r.duracao_horas;
  }

  enviarJSON(res, 200, {
    total_sobreaviso_horas: Math.round(totalSobreavisoNaData * 100) / 100,
    total_extra_horas: Math.round(totalExtraNaData * 100) / 100
  });
});

rota('POST', '/api/colaborador/registros', async (req, res) => {
  const tokenPayload = autenticar(req);
  const corpo = await lerCorpoJSON(req);
  validarCampos(corpo, ['tipo', 'data', 'hora_inicio', 'hora_fim']);

  const tipo = String(corpo.tipo).toUpperCase();
  if (!['PONTO', 'HORA_EXTRA', 'SOBREAVISO'].includes(tipo)) {
    throw new ErroHttp(400, 'Tipo deve ser PONTO, HORA_EXTRA ou SOBREAVISO.');
  }
  if (tipo === 'HORA_EXTRA' && ![50, 100].includes(Number(corpo.porcentagem))) {
    throw new ErroHttp(400, 'Hora extra exige porcentagem 50 ou 100.');
  }
  if ((tipo === 'HORA_EXTRA' || tipo === 'SOBREAVISO') && !corpo.justificativa) {
    throw new ErroHttp(400, 'Justificativa é obrigatória para hora extra e sobreaviso.');
  }

  let dataFim = corpo.data_fim || corpo.data;
  if (!corpo.data_fim && corpo.hora_fim <= corpo.hora_inicio) {
    // Sem data_fim explícita e hora final <= hora inicial no mesmo dia:
    // assume que o turno vira a madrugada e termina no dia seguinte.
    const dataSeguinte = new Date(`${corpo.data}T00:00:00`);
    dataSeguinte.setDate(dataSeguinte.getDate() + 1);
    dataFim = dataSeguinte.toISOString().slice(0, 10);
  }
  const duracao = calcularDuracaoHoras(corpo.data, corpo.hora_inicio, dataFim, corpo.hora_fim);
  if (duracao <= 0) throw new ErroHttp(400, 'O horário final deve ser depois do horário inicial.');

  const registroBase = {
    tipo,
    data: corpo.data,
    data_fim: dataFim,
    duracao_horas: duracao
  };

  const compensacao = aplicarCompensacaoCruzada(tokenPayload.id, registroBase);

  const resultado = db
    .prepare(
      `INSERT INTO registros (colaborador_id, tipo, data, data_fim, hora_inicio, hora_fim, porcentagem,
                               duracao_horas, duracao_original, horas_deduzidas, justificativa, status,
                               resposta_supervisor, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', NULL, ?)`
    )
    .run(
      tokenPayload.id, tipo, corpo.data, dataFim, corpo.hora_inicio, corpo.hora_fim,
      tipo === 'HORA_EXTRA' ? Number(corpo.porcentagem) : 0,
      compensacao.duracaoFinal, compensacao.duracaoOriginal, compensacao.horasDeduzidas,
      corpo.justificativa ? String(corpo.justificativa).trim() : '',
      new Date().toISOString()
    );

  const registroCriado = db.prepare('SELECT * FROM registros WHERE id = ?').get(resultado.lastInsertRowid);
  enviarJSON(res, 201, { registro: registroCriado });
});

rota('PUT', '/api/colaborador/registros/:id', async (req, res, match) => {
  const tokenPayload = autenticar(req);
  const id = Number(match[1]);
  const corpo = await lerCorpoJSON(req);

  const registro = db.prepare('SELECT * FROM registros WHERE id = ?').get(id);
  if (!registro || registro.colaborador_id !== tokenPayload.id) {
    throw new ErroHttp(404, 'Registro não encontrado.');
  }
  if (registro.status !== 'PENDENTE') {
    throw new ErroHttp(409, 'Só é possível editar registros com status PENDENTE.');
  }

  const novaData = corpo.data || registro.data;
  const novaDataFim = corpo.data_fim || corpo.data || registro.data_fim;
  const novaHoraInicio = corpo.hora_inicio || registro.hora_inicio;
  const novaHoraFim = corpo.hora_fim || registro.hora_fim;
  const novaDuracao = calcularDuracaoHoras(novaData, novaHoraInicio, novaDataFim, novaHoraFim);
  if (novaDuracao <= 0) throw new ErroHttp(400, 'O horário final deve ser depois do horário inicial.');

  db.prepare(
    `UPDATE registros
     SET data = ?, data_fim = ?, hora_inicio = ?, hora_fim = ?, duracao_horas = ?, justificativa = ?
     WHERE id = ?`
  ).run(
    novaData, novaDataFim, novaHoraInicio, novaHoraFim, novaDuracao,
    corpo.justificativa !== undefined ? String(corpo.justificativa).trim() : registro.justificativa,
    id
  );

  const atualizado = db.prepare('SELECT * FROM registros WHERE id = ?').get(id);
  enviarJSON(res, 200, { registro: atualizado });
});

rota('DELETE', '/api/colaborador/registros/:id', async (req, res, match) => {
  const tokenPayload = autenticar(req);
  const id = Number(match[1]);

  const registro = db.prepare('SELECT * FROM registros WHERE id = ?').get(id);
  if (!registro || registro.colaborador_id !== tokenPayload.id) {
    throw new ErroHttp(404, 'Registro não encontrado.');
  }
  if (registro.status !== 'PENDENTE') {
    throw new ErroHttp(409, 'Só é possível excluir registros com status PENDENTE.');
  }

  db.prepare('DELETE FROM registros WHERE id = ?').run(id);
  enviarJSON(res, 200, { ok: true });
});

rota('PUT', '/api/colaborador/perfil', async (req, res) => {
  const tokenPayload = autenticar(req);
  const corpo = await lerCorpoJSON(req);

  const usuario = buscarUsuarioPorId(tokenPayload.id);
  const novoCargo = corpo.cargo !== undefined ? String(corpo.cargo).trim() : usuario.cargo;
  const novoSalario = corpo.salario !== undefined ? Number(corpo.salario) : usuario.salario;
  const novaCarga = corpo.carga_horaria_mensal !== undefined ? Number(corpo.carga_horaria_mensal) : usuario.carga_horaria_mensal;

  if (novoSalario < 0) throw new ErroHttp(400, 'Salário não pode ser negativo.');
  if (novaCarga <= 0) throw new ErroHttp(400, 'Carga horária mensal deve ser maior que zero.');

  db.prepare('UPDATE usuarios SET cargo = ?, salario = ?, carga_horaria_mensal = ? WHERE id = ?')
    .run(novoCargo, novoSalario, novaCarga, tokenPayload.id);

  enviarJSON(res, 200, { usuario: usuarioSemSenha(buscarUsuarioPorId(tokenPayload.id)) });
});

// ---- Supervisor ----

rota('GET', '/api/supervisor/colaboradores', async (req, res) => {
  const tokenPayload = autenticar(req);
  exigirSupervisor(tokenPayload);
  const colaboradores = db
    .prepare(`SELECT id, nome, cargo FROM usuarios WHERE perfil = 'COLABORADOR' ORDER BY nome`)
    .all();
  enviarJSON(res, 200, { colaboradores });
});

rota('GET', '/api/supervisor/registros', async (req, res, _match, query) => {
  const tokenPayload = autenticar(req);
  exigirSupervisor(tokenPayload);

  let sql = `
    SELECT r.id, r.colaborador_id, u.nome AS colaborador_nome, u.cargo AS colaborador_cargo,
           r.tipo, r.data, r.data_fim, r.hora_inicio, r.hora_fim, r.porcentagem,
           r.duracao_horas, r.duracao_original, r.horas_deduzidas, r.justificativa,
           r.status, r.resposta_supervisor, r.criado_em
    FROM registros r
    JOIN usuarios u ON u.id = r.colaborador_id
    WHERE 1 = 1
  `;
  const params = [];
  if (query.get('colaborador_id')) { sql += ' AND r.colaborador_id = ?'; params.push(Number(query.get('colaborador_id'))); }
  if (query.get('tipo')) { sql += ' AND r.tipo = ?'; params.push(query.get('tipo')); }
  if (query.get('status')) { sql += ' AND r.status = ?'; params.push(query.get('status')); }
  if (query.get('mes_ano')) { sql += ' AND substr(r.data, 1, 7) = ?'; params.push(query.get('mes_ano')); }
  sql += ' ORDER BY r.data DESC, r.id DESC';

  const registros = db.prepare(sql).all(...params);
  enviarJSON(res, 200, { registros }); // nunca inclui salário/valores financeiros
});

rota('PUT', '/api/supervisor/registros/:id/avaliar', async (req, res, match) => {
  const tokenPayload = autenticar(req);
  exigirSupervisor(tokenPayload);
  const id = Number(match[1]);
  const corpo = await lerCorpoJSON(req);

  const status = String(corpo.status || '').toUpperCase();
  if (!['APROVADO', 'REPROVADO'].includes(status)) {
    throw new ErroHttp(400, 'Status deve ser APROVADO ou REPROVADO.');
  }

  const registro = db.prepare('SELECT * FROM registros WHERE id = ?').get(id);
  if (!registro) throw new ErroHttp(404, 'Registro não encontrado.');
  if (registro.status !== 'PENDENTE') throw new ErroHttp(409, 'Este registro já foi avaliado.');

  db.prepare('UPDATE registros SET status = ?, resposta_supervisor = ? WHERE id = ?')
    .run(status, corpo.resposta_supervisor ? String(corpo.resposta_supervisor).trim() : null, id);

  const atualizado = db.prepare('SELECT * FROM registros WHERE id = ?').get(id);
  enviarJSON(res, 200, { registro: atualizado });
});

rota('GET', '/api/supervisor/totais', async (req, res, _match, query) => {
  const tokenPayload = autenticar(req);
  exigirSupervisor(tokenPayload);
  const mesAno = query.get('mes_ano');

  let sqlRegistros = `
    SELECT r.*, u.nome AS colaborador_nome, u.cargo AS colaborador_cargo
    FROM registros r JOIN usuarios u ON u.id = r.colaborador_id WHERE 1 = 1
  `;
  const params = [];
  if (mesAno) { sqlRegistros += ' AND substr(r.data, 1, 7) = ?'; params.push(mesAno); }
  const registros = db.prepare(sqlRegistros).all(...params);

  const colaboradores = db
    .prepare(`SELECT id, nome, cargo FROM usuarios WHERE perfil = 'COLABORADOR' ORDER BY nome`)
    .all();

  const consolidadoPorColaborador = colaboradores.map((col) => {
    const doColaborador = registros.filter((r) => r.colaborador_id === col.id);
    const somar = (tipo, porcentagem) =>
      doColaborador
        .filter((r) => r.tipo === tipo && (porcentagem === undefined || r.porcentagem === porcentagem))
        .reduce((soma, r) => soma + r.duracao_horas, 0);

    return {
      colaborador_id: col.id,
      nome: col.nome,
      cargo: col.cargo,
      ponto_horas: Math.round(somar('PONTO') * 100) / 100,
      extra_50_horas: Math.round(somar('HORA_EXTRA', 50) * 100) / 100,
      extra_100_horas: Math.round(somar('HORA_EXTRA', 100) * 100) / 100,
      sobreaviso_horas: Math.round(somar('SOBREAVISO') * 100) / 100,
      pendentes: doColaborador.filter((r) => r.status === 'PENDENTE').length,
      aprovados: doColaborador.filter((r) => r.status === 'APROVADO').length,
      reprovados: doColaborador.filter((r) => r.status === 'REPROVADO').length
    };
  });

  const resumoGeral = {
    total_colaboradores: colaboradores.length,
    pendentes: registros.filter((r) => r.status === 'PENDENTE').length,
    horas_extra_50: Math.round(registros.filter((r) => r.tipo === 'HORA_EXTRA' && r.porcentagem === 50)
      .reduce((s, r) => s + r.duracao_horas, 0) * 100) / 100,
    horas_extra_100: Math.round(registros.filter((r) => r.tipo === 'HORA_EXTRA' && r.porcentagem === 100)
      .reduce((s, r) => s + r.duracao_horas, 0) * 100) / 100,
    horas_sobreaviso: Math.round(registros.filter((r) => r.tipo === 'SOBREAVISO')
      .reduce((s, r) => s + r.duracao_horas, 0) * 100) / 100
  };

  enviarJSON(res, 200, { resumo_geral: resumoGeral, consolidado_por_colaborador: consolidadoPorColaborador });
  // nenhum campo de salário/valor financeiro é retornado aqui
});

// ---------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------

const servidor = http.createServer(async (req, res) => {
  try {
    const urlCompleta = new URL(req.url, `http://localhost:${PORTA}`);
    const caminho = urlCompleta.pathname;

    if (!caminho.startsWith('/api/')) {
      return servirArquivoEstatico(req, res, caminho);
    }

    const rotaEncontrada = rotas.find((r) => r.metodo === req.method && r.regex.test(caminho));
    if (!rotaEncontrada) {
      return enviarJSON(res, 404, { erro: 'Rota não encontrada.' });
    }

    const match = caminho.match(rotaEncontrada.regex);
    await rotaEncontrada.manipulador(req, res, match, urlCompleta.searchParams);
  } catch (erro) {
    if (erro instanceof ErroHttp) {
      enviarJSON(res, erro.status, { erro: erro.message });
    } else {
      console.error('Erro inesperado:', erro);
      enviarJSON(res, 500, { erro: 'Erro interno do servidor.' });
    }
  }
});

servidor.listen(PORTA, () => {
  console.log(`Servidor rodando em http://localhost:${PORTA}`);
});

module.exports = servidor;
