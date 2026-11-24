// database.js
// Banco SQLite nativo (node:sqlite) + toda a lógica de cálculo das horas.
// Nenhuma dependência externa: só módulos nativos do Node.

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashSenha } = require('./auth');

const CAMINHO_BANCO = process.env.DB_PATH || path.join(__dirname, 'dados.sqlite');
const db = new DatabaseSync(CAMINHO_BANCO);

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK (perfil IN ('COLABORADOR','SUPERVISOR')),
    cargo TEXT,
    salario REAL NOT NULL DEFAULT 0,
    carga_horaria_mensal INTEGER NOT NULL DEFAULT 220
  );

  CREATE TABLE IF NOT EXISTS registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('PONTO','HORA_EXTRA','SOBREAVISO')),
    data TEXT NOT NULL,
    data_fim TEXT NOT NULL,
    hora_inicio TEXT NOT NULL,
    hora_fim TEXT NOT NULL,
    porcentagem INTEGER NOT NULL DEFAULT 0,
    duracao_horas REAL NOT NULL,
    duracao_original REAL,
    horas_deduzidas REAL NOT NULL DEFAULT 0,
    justificativa TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','APROVADO','REPROVADO')),
    resposta_supervisor TEXT,
    criado_em TEXT NOT NULL,
    FOREIGN KEY (colaborador_id) REFERENCES usuarios(id)
  );
`);

// ---------------------------------------------------------------------
// Cálculo de duração entre dois instantes (em horas, 2 casas decimais)
// ---------------------------------------------------------------------
function calcularDuracaoHoras(data, horaInicio, dataFim, horaFim) {
  const inicio = new Date(`${data}T${horaInicio}:00`);
  let fim = new Date(`${dataFim}T${horaFim}:00`);
  const diffMs = fim - inicio;
  const horas = diffMs / (1000 * 60 * 60);
  return Math.max(0, Math.round(horas * 100) / 100);
}

// ---------------------------------------------------------------------
// Duas datas (YYYY-MM-DD) se sobrepõem num intervalo [a_ini,a_fim] x [b_ini,b_fim]?
// ---------------------------------------------------------------------
function intervalosSeSobrepoem(aIni, aFim, bIni, bFim) {
  return aIni <= bFim && bIni <= aFim;
}

// ---------------------------------------------------------------------
// Compensação cruzada: horas extras trabalhadas durante um sobreaviso
// são abatidas do próprio sobreaviso (nunca geram dedução negativa).
// ---------------------------------------------------------------------
function aplicarCompensacaoCruzada(colaboradorId, novoRegistro) {
  if (novoRegistro.tipo === 'HORA_EXTRA') {
    // Abate a duração desta nova hora extra de qualquer sobreaviso
    // (ainda não reprovado) que cubra a mesma data.
    const sobreavisos = db
      .prepare(
        `SELECT * FROM registros
         WHERE colaborador_id = ? AND tipo = 'SOBREAVISO' AND status != 'REPROVADO'`
      )
      .all(colaboradorId);

    for (const sob of sobreavisos) {
      if (!intervalosSeSobrepoem(novoRegistro.data, novoRegistro.data_fim, sob.data, sob.data_fim)) continue;

      const duracaoOriginal = sob.duracao_original ?? sob.duracao_horas;
      const jaDeduzido = sob.horas_deduzidas || 0;
      const novaDeducaoTotal = Math.min(duracaoOriginal, jaDeduzido + novoRegistro.duracao_horas);
      const novaDuracao = Math.max(0, Math.round((duracaoOriginal - novaDeducaoTotal) * 100) / 100);

      db.prepare(
        `UPDATE registros
         SET duracao_horas = ?, duracao_original = ?, horas_deduzidas = ?
         WHERE id = ?`
      ).run(novaDuracao, duracaoOriginal, novaDeducaoTotal, sob.id);
    }
    return { duracaoFinal: novoRegistro.duracao_horas, duracaoOriginal: null, horasDeduzidas: 0 };
  }

  if (novoRegistro.tipo === 'SOBREAVISO') {
    // O sobreaviso recém-lançado já nasce com o tempo de horas extras
    // da mesma janela abatido (o colaborador já foi pago como hora extra).
    const extras = db
      .prepare(
        `SELECT * FROM registros
         WHERE colaborador_id = ? AND tipo = 'HORA_EXTRA' AND status != 'REPROVADO'`
      )
      .all(colaboradorId);

    let totalExtraNaJanela = 0;
    for (const ex of extras) {
      if (intervalosSeSobrepoem(novoRegistro.data, novoRegistro.data_fim, ex.data, ex.data_fim)) {
        totalExtraNaJanela += ex.duracao_horas;
      }
    }

    const duracaoOriginal = novoRegistro.duracao_horas;
    const horasDeduzidas = Math.min(duracaoOriginal, totalExtraNaJanela);
    const duracaoFinal = Math.max(0, Math.round((duracaoOriginal - horasDeduzidas) * 100) / 100);

    return {
      duracaoFinal,
      duracaoOriginal: horasDeduzidas > 0 ? duracaoOriginal : null,
      horasDeduzidas: Math.round(horasDeduzidas * 100) / 100
    };
  }

  return { duracaoFinal: novoRegistro.duracao_horas, duracaoOriginal: null, horasDeduzidas: 0 };
}

// ---------------------------------------------------------------------
// Dias úteis e domingos de um mês (aproximação: só domingo é não útil;
// feriados municipais/estaduais não entram nessa estimativa).
// ---------------------------------------------------------------------
function contarDiasUteisEDomingos(ano, mes) {
  const diasNoMes = new Date(ano, mes, 0).getDate();
  let domingos = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    if (new Date(ano, mes - 1, d).getDay() === 0) domingos++;
  }
  return { diasUteis: diasNoMes - domingos, domingos };
}

// ---------------------------------------------------------------------
// Resumo financeiro (regras CLT) de um colaborador, opcionalmente filtrado
// por mes_ano (YYYY-MM). Só considera registros APROVADOS no "garantido".
// ---------------------------------------------------------------------
function calcularResumoFinanceiro(usuario, mesAno) {
  let sql = `SELECT * FROM registros WHERE colaborador_id = ?`;
  const params = [usuario.id];
  if (mesAno) {
    sql += ` AND substr(data, 1, 7) = ?`;
    params.push(mesAno);
  }
  const registros = db.prepare(sql).all(...params);

  const valorHoraNormal = usuario.carga_horaria_mensal > 0
    ? Math.round((usuario.salario / usuario.carga_horaria_mensal) * 100) / 100
    : 0;

  function somarHoras(tipo, porcentagem, apenasAprovados) {
    return registros
      .filter(r => r.tipo === tipo
        && (porcentagem === undefined || r.porcentagem === porcentagem)
        && (!apenasAprovados || r.status === 'APROVADO'))
      .reduce((soma, r) => soma + r.duracao_horas, 0);
  }

  const horasExtra50 = somarHoras('HORA_EXTRA', 50, false);
  const horasExtra100 = somarHoras('HORA_EXTRA', 100, false);
  const horasSobreaviso = somarHoras('SOBREAVISO', undefined, false);
  const horasPonto = somarHoras('PONTO', undefined, false);

  const subtotalExtra50 = Math.round(horasExtra50 * valorHoraNormal * 1.5 * 100) / 100;
  const subtotalExtra100 = Math.round(horasExtra100 * valorHoraNormal * 2.0 * 100) / 100;
  const subtotalSobreaviso = Math.round(horasSobreaviso * valorHoraNormal * (1 / 3) * 100) / 100;

  const [ano, mes] = (mesAno || new Date().toISOString().slice(0, 7)).split('-').map(Number);
  const { diasUteis, domingos } = contarDiasUteisEDomingos(ano, mes);
  const totalVariavel = subtotalExtra50 + subtotalExtra100 + subtotalSobreaviso;
  const reflexoDsr = diasUteis > 0
    ? Math.round((totalVariavel / diasUteis) * domingos * 100) / 100
    : 0;

  const estimativaTotalGeral = Math.round(
    (usuario.salario + totalVariavel + reflexoDsr) * 100
  ) / 100;

  // Total "garantido": só o que já foi aprovado pelo supervisor.
  const extra50Aprov = somarHoras('HORA_EXTRA', 50, true);
  const extra100Aprov = somarHoras('HORA_EXTRA', 100, true);
  const sobreavisoAprov = somarHoras('SOBREAVISO', undefined, true);
  const totalVariavelAprovado =
    Math.round(extra50Aprov * valorHoraNormal * 1.5 * 100) / 100 +
    Math.round(extra100Aprov * valorHoraNormal * 2.0 * 100) / 100 +
    Math.round(sobreavisoAprov * valorHoraNormal * (1 / 3) * 100) / 100;
  const totalAprovadoGarantido = Math.round((usuario.salario + totalVariavelAprovado) * 100) / 100;

  return {
    salario_base: usuario.salario,
    valor_hora_normal: valorHoraNormal,
    totais_horas: {
      ponto: Math.round(horasPonto * 100) / 100,
      extra_50: Math.round(horasExtra50 * 100) / 100,
      extra_100: Math.round(horasExtra100 * 100) / 100,
      sobreaviso: Math.round(horasSobreaviso * 100) / 100
    },
    financeiro: {
      subtotal_extra_50: subtotalExtra50,
      subtotal_extra_100: subtotalExtra100,
      subtotal_sobreaviso: subtotalSobreaviso,
      reflexo_dsr_estimado: reflexoDsr,
      estimativa_total_geral: estimativaTotalGeral,
      total_aprovado_garantido: totalAprovadoGarantido
    }
  };
}

// ---------------------------------------------------------------------
// Seed de demonstração (só roda se o banco estiver vazio)
// ---------------------------------------------------------------------
function semear() {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total > 0) return;

  const inserirUsuario = db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, perfil, cargo, salario, carga_horaria_mensal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const senhaDemo = hashSenha('123456');
  const joaoId = inserirUsuario.run('João Silva', 'joao@empresa.com', senhaDemo, 'COLABORADOR', 'Analista de Suporte', 3300, 220).lastInsertRowid;
  const mariaId = inserirUsuario.run('Maria Souza', 'maria@empresa.com', senhaDemo, 'COLABORADOR', 'Engenheira de Infraestrutura', 5500, 220).lastInsertRowid;
  inserirUsuario.run('Carlos Mendes', 'supervisor@empresa.com', senhaDemo, 'SUPERVISOR', 'Coordenador de Operações', 0, 220);

  const inserirRegistro = db.prepare(`
    INSERT INTO registros (colaborador_id, tipo, data, data_fim, hora_inicio, hora_fim, porcentagem,
                            duracao_horas, duracao_original, horas_deduzidas, justificativa, status,
                            resposta_supervisor, criado_em)
    VALUES (@colaborador_id, @tipo, @data, @data_fim, @hora_inicio, @hora_fim, @porcentagem,
            @duracao_horas, @duracao_original, @horas_deduzidas, @justificativa, @status,
            @resposta_supervisor, @criado_em)
  `);

  const hoje = new Date();
  const dataRecente = (diasAtras) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() - diasAtras);
    return d.toISOString().slice(0, 10);
  };

  const registrosSeed = [
    {
      colaborador_id: joaoId, tipo: 'HORA_EXTRA', data: dataRecente(5), data_fim: dataRecente(5),
      hora_inicio: '19:00', hora_fim: '22:00', porcentagem: 50,
      duracao_horas: 3, duracao_original: null, horas_deduzidas: 0,
      justificativa: 'Deploy emergencial fora do horário comercial.', status: 'APROVADO',
      resposta_supervisor: 'Aprovado conforme chamado interno.', criado_em: new Date().toISOString()
    },
    {
      colaborador_id: joaoId, tipo: 'HORA_EXTRA', data: dataRecente(1), data_fim: dataRecente(1),
      hora_inicio: '20:00', hora_fim: '23:00', porcentagem: 100,
      duracao_horas: 3, duracao_original: null, horas_deduzidas: 0,
      justificativa: 'Atendimento em feriado municipal.', status: 'PENDENTE',
      resposta_supervisor: null, criado_em: new Date().toISOString()
    },
    {
      colaborador_id: mariaId, tipo: 'SOBREAVISO', data: dataRecente(10), data_fim: dataRecente(9),
      hora_inicio: '18:00', hora_fim: '08:00', porcentagem: 0,
      duracao_horas: 14, duracao_original: null, horas_deduzidas: 0,
      justificativa: 'Escala de sobreaviso noturno da infraestrutura.', status: 'APROVADO',
      resposta_supervisor: 'Homologado automaticamente.', criado_em: new Date().toISOString()
    },
    {
      colaborador_id: mariaId, tipo: 'HORA_EXTRA', data: dataRecente(3), data_fim: dataRecente(3),
      hora_inicio: '09:00', hora_fim: '13:00', porcentagem: 50,
      duracao_horas: 4, duracao_original: null, horas_deduzidas: 0,
      justificativa: 'Correção de incidente em produção no sábado.', status: 'REPROVADO',
      resposta_supervisor: 'Reprovado: faltou autorização prévia do chamado.', criado_em: new Date().toISOString()
    }
  ];

  for (const reg of registrosSeed) inserirRegistro.run(reg);
}

semear();

module.exports = {
  db,
  calcularDuracaoHoras,
  aplicarCompensacaoCruzada,
  calcularResumoFinanceiro,
  contarDiasUteisEDomingos
};
