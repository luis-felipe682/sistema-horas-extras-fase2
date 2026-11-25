import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'node-edge-tts';
import { parseFile } from 'music-metadata';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, '..', 'public', 'audio');
const voice = process.env.TTS_VOICE || 'pt-BR-FranciscaNeural';
const rate = process.env.TTS_RATE || '-5%';

// The 11 narration slots add up to exactly 240 seconds at 30 fps.
// Keep the spoken script in first person: this is a student project defense.
const segments = [
  { file: '01-apresentacao.mp3', label: 'Bloco 1 · Apresentação', seconds: 20, scene: 'intro', text: 'Olá, professor. Nesta apresentação final da Fase 3, vou demonstrar o Sistema de Gestão de Horas Extras e Sobreaviso que eu desenvolvi. Vou explicar o problema, as decisões técnicas da solução e mostrar o sistema funcionando passo a passo, com exemplos práticos da rotina de trabalho.' },
  { file: '02-problema.mp3', label: 'Bloco 1 · Problema', seconds: 20, scene: 'problem', text: 'O problema começa no controle de jornadas e escalas de sobreaviso em planilhas ou papel. Esse modelo favorece erros nos adicionais de cinquenta e cem por cento, atrasos de aprovação e retrabalho. Também reduz a transparência sobre cálculos e andamento dos pedidos, dificultando a conferência posterior.' },
  { file: '03-backend.mp3', label: 'Bloco 2 · Backend e API', seconds: 20, scene: 'architecture', text: 'Para resolver isso, eu projetei uma aplicação que centraliza o fluxo. No backend, construí uma API REST em Node.js puro, usando módulos nativos, sem framework pesado. Mantive a estrutura enxuta e fácil de manter, com regras de cálculo e validação executadas no servidor.' },
  { file: '04-dados-seguranca.mp3', label: 'Bloco 2 · Dados e segurança', seconds: 30, scene: 'architecture', text: 'Aqui no banco de dados, uso SQLite relacional em dados.sqlite. As tabelas relacionam usuários e lançamentos por chave estrangeira e guardam período, horas, justificativa, status e parecer. Em auth.js, implementei hash de senha com scrypt e JWT assinado com HMAC-SHA256. Separei os perfis Colaborador e Supervisor; as permissões são verificadas pelo servidor.' },
  { file: '05-cadastro-login.mp3', label: 'Bloco 3 · Cadastro e login', seconds: 15, scene: 'login', text: 'Na tela inicial, a pessoa cria uma conta e escolhe o perfil de acesso, ou entra com suas credenciais. O servidor confere o hash da senha e inicia uma sessão com token assinado. Vou começar pelo perfil Colaborador.' },
  { file: '06-visao-colaborador.mp3', label: 'Bloco 3 · Visão do colaborador', seconds: 20, scene: 'dashboard', text: 'O painel exibe o resumo do mês. Eu calculo o total garantido dos registros aprovados e apresento também a estimativa baseada nos lançamentos, sempre identificada como estimativa. O colaborador acompanha os valores e os dados da própria jornada, sem refazer cálculos manualmente.' },
  { file: '07-lancamento.mp3', label: 'Bloco 3 · Lançamento', seconds: 20, scene: 'form', text: 'Na aba de lançamento, escolho hora extra de cinquenta ou cem por cento, ou sobreaviso. Informo data, horário de início e fim e justificativa técnica. A API valida a requisição e grava o registro com status pendente no banco, pronto para análise, com os dados reunidos.' },
  { file: '08-historico.mp3', label: 'Bloco 3 · Histórico', seconds: 15, scene: 'history', text: 'O lançamento aparece no histórico. Eu filtro por tipo ou status e confiro duração e parecer. Enquanto ainda está pendente, o colaborador também pode excluir o próprio registro antes da análise, sem perder o contexto.' },
  { file: '09-supervisor-banco.mp3', label: 'Bloco 3 · Supervisor e banco', seconds: 30, scene: 'approval', text: 'Agora, como Supervisor, consulto a fila de pedidos pendentes da equipe. Eu confiro a justificativa e aprovo ou reprovo com um parecer. Por privacidade, o gestor vê os dados operacionais necessários, mas não o salário base nem os valores individuais. A decisão atualiza o status no banco relacional dados.sqlite. Após atualizar o histórico, o colaborador consulta o resultado, sem expor dados financeiros pessoais.' },
  { file: '10-deploy.mp3', label: 'Bloco 4 · Versionamento e deploy', seconds: 25, scene: 'deploy', text: 'Versionei o código-fonte no GitHub e integrei o deploy contínuo no Render. A aplicação está publicada em sistema-horas-extras-fase2.onrender.com, com HTTPS ativo. Assim, a versão de produção acompanha as atualizações do repositório e pode ser acessada com conexão criptografada. Essa publicação facilita a demonstração e a avaliação.' },
  { file: '11-encerramento.mp3', label: 'Bloco 4 · Encerramento', seconds: 25, scene: 'outro', text: 'Com essa solução, eu reduzo o retrabalho manual, organizo os cálculos e mantenho rastreabilidade desde o lançamento até a aprovação. O colaborador acompanha seus pedidos e o supervisor avalia sem acessar dados financeiros individuais. Assim, consigo demonstrar o percurso completo e explicar como cada regra aparece no código e nos dados. Muito obrigado.' },
];

await mkdir(outputDir, { recursive: true });
const force = process.argv.includes('--force') || !process.argv.includes('--reuse');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const onlyFile = onlyArg?.slice('--only='.length);
const selectedSegments = onlyFile ? segments.filter((segment) => segment.file === onlyFile) : segments;
if (onlyFile && selectedSegments.length === 0) throw new Error('Segmento desconhecido: ' + onlyFile);

for (const segment of selectedSegments) {
  const output = path.join(outputDir, segment.file);
  let existingBytes = 0;
  try { existingBytes = (await stat(output)).size; } catch {}
  if (!force && existingBytes > 0) {
    console.log('Reutilizando ' + segment.file);
    continue;
  }
  console.log('Gerando ' + segment.file + ' (' + voice + ')');
  const tts = new EdgeTTS({
    voice, lang: 'pt-BR', outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
    rate: segment.rate || rate, pitch: 'default', volume: 'default',
    saveSubtitles: true, timeout: 45000,
  });
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await tts.ttsPromise(segment.text, output);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }
  if (lastError) throw lastError;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const results = [];
for (const segment of segments) {
  const metadata = await parseFile(path.join(outputDir, segment.file));
  const duration = metadata.format.duration ?? 0;
  const result = {
    ...segment,
    rate: segment.rate || rate,
    durationSeconds: Number(duration.toFixed(3)),
    durationFrames: Math.ceil(duration * 30),
    fits: duration <= segment.seconds,
  };
  results.push(result);
  console.log(`  ${result.file}: ${result.durationSeconds} s falados / ${result.seconds} s de cena${result.fits ? '' : ' — excedeu a janela'}`);
}

const targetSeconds = segments.reduce((sum, segment) => sum + segment.seconds, 0);
const report = {
  voice, rate, fps: 30, targetSeconds,
  totalDurationSeconds: Number(results.reduce((sum, item) => sum + item.durationSeconds, 0).toFixed(3)),
  allFit: results.every((item) => item.fits),
  segments: results,
};
await writeFile(path.join(outputDir, 'voiceover-manifest.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`Duração planejada do vídeo: ${targetSeconds} s`);
console.log(`Duração total das falas: ${report.totalDurationSeconds} s`);
if (!report.allFit) process.exitCode = 2;
