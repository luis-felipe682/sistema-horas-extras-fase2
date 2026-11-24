// auth.js
// Hash de senha e tokens de sessão (estilo JWT), usando só node:crypto.
// Sem bcrypt, sem jsonwebtoken: nenhuma dependência externa é necessária.

const crypto = require('node:crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'chave-de-desenvolvimento-trocar-em-producao';

if (!process.env.JWT_SECRET) {
  console.warn(
    '[aviso] JWT_SECRET não definido no ambiente. Usando uma chave padrão de desenvolvimento.\n' +
    '         Defina a variável de ambiente JWT_SECRET antes de usar isso em produção.'
  );
}

// ---------- Senhas ----------

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificarSenha(senha, senhaHash) {
  const [salt, hashArmazenado] = (senhaHash || '').split(':');
  if (!salt || !hashArmazenado) return false;

  const hashTentativa = crypto.scryptSync(senha, salt, 64).toString('hex');

  const bufArmazenado = Buffer.from(hashArmazenado, 'hex');
  const bufTentativa = Buffer.from(hashTentativa, 'hex');
  if (bufArmazenado.length !== bufTentativa.length) return false;

  return crypto.timingSafeEqual(bufArmazenado, bufTentativa);
}

// ---------- Tokens de sessão (HMAC-SHA256, formato tipo JWT) ----------

function base64url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function assinar(dados) {
  return base64url(crypto.createHmac('sha256', JWT_SECRET).update(dados).digest());
}

function gerarToken(payload, expiraEmSegundos = 8 * 60 * 60) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { ...payload, iat: agora, exp: agora + expiraEmSegundos };

  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const corpoB64 = base64url(Buffer.from(JSON.stringify(corpo)));
  const assinatura = assinar(`${headerB64}.${corpoB64}`);

  return `${headerB64}.${corpoB64}.${assinatura}`;
}

function verificarToken(token) {
  const partes = (token || '').split('.');
  if (partes.length !== 3) throw new Error('Token mal formado.');

  const [headerB64, corpoB64, assinaturaRecebida] = partes;
  const assinaturaEsperada = assinar(`${headerB64}.${corpoB64}`);

  const bufRecebida = Buffer.from(assinaturaRecebida);
  const bufEsperada = Buffer.from(assinaturaEsperada);
  if (bufRecebida.length !== bufEsperada.length || !crypto.timingSafeEqual(bufRecebida, bufEsperada)) {
    throw new Error('Assinatura inválida.');
  }

  const corpo = JSON.parse(Buffer.from(corpoB64, 'base64').toString('utf8'));
  if (corpo.exp && Math.floor(Date.now() / 1000) > corpo.exp) {
    throw new Error('Token expirado.');
  }
  return corpo;
}

module.exports = { hashSenha, verificarSenha, gerarToken, verificarToken };
