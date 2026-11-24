import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'node-edge-tts';
import { parseFile } from 'music-metadata';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, '..', 'public', 'audio');
const voice = process.env.TTS_VOICE || 'pt-BR-AntonioNeural';
const segments = [
  { file: '01-intro.mp3', label: 'Abertura', seconds: 12, text: 'Eu desenvolvi este projeto para acompanhar horas extras e sobreaviso. Agora vou mostrar a motivação, as escolhas técnicas e o funcionamento, passo a passo.' },
  { file: '02-problema.mp3', label: 'O problema', seconds: 18, text: 'Eu comecei por um problema concreto: planilhas manuais causam erros e retrabalho. Também falta transparência nos cálculos de hora extra de cinquenta e cem por cento e no sobreaviso. Sem justificativas e histórico, conferir os lançamentos é difícil.' },
  { file: '03-solucao.mp3', label: 'A solução e arquitetura', seconds: 18, text: 'Eu escolhi Node.js com API REST. No banco, salvo os registros no arquivo dados.sqlite. A autenticação usa token assinado equivalente a JWT. Também separei os perfis.' },
  { file: '04-demo-login.mp3', label: 'Acesso e cadastro', seconds: 12, text: 'Primeiro, o usuário cria uma conta ou entra com e-mail e senha. Depois da autenticação, o perfil define quais informações cada pessoa pode consultar.' },
  { file: '05-demo-registro.mp3', label: 'Registro de horas', seconds: 16, text: 'Eu informo tipo, período, horários e justificativa. A duração é calculada, mesmo na virada do dia. Escolho adicional de cinquenta ou cem por cento e aplico compensação cruzada.' },
  { file: '06-demo-historico.mp3', label: 'Histórico e acompanhamento', seconds: 13, text: 'Depois, eu consulto o histórico e filtro por tipo ou status. Cada lançamento mostra duração, justificativa, parecer e se está pendente, aprovado ou reprovado.' },
  { file: '07-demo-aprovacao.mp3', label: 'Gestão e aprovação', seconds: 13, text: 'Como supervisor, eu analiso a justificativa, registro meu parecer e aprovo ou reprovo. A visão mostra totais por colaborador, sem expor salários individuais.' },
  { file: '08-outro.mp3', label: 'Resultados e encerramento', seconds: 18, text: 'Eu conectei o repositório ao GitHub e publiquei a aplicação no Render. No sistema, o histórico e os pareceres ajudam a conferir os cálculos e as decisões. Assim concluo a apresentação do meu projeto. Obrigado.' },
];

await mkdir(outputDir, { recursive: true });
const tts = new EdgeTTS({ voice, lang: 'pt-BR', outputFormat: 'audio-24khz-96kbitrate-mono-mp3', rate: '-5%', pitch: 'default', volume: 'default', saveSubtitles: true, timeout: 45000 });
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
    console.log('Usando ' + segment.file + ' já gerado');
    continue;
  }
  console.log('Gerando ' + segment.file + ' (' + voice + ')');
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
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

const results = [];
for (const segment of segments) {
  const output = path.join(outputDir, segment.file);
  const metadata = await parseFile(output);
  const duration = metadata.format.duration ?? 0;
  const result = { ...segment, durationSeconds: Number(duration.toFixed(3)), durationFrames: Math.ceil(duration * 30), fits: duration <= segment.seconds };
  results.push(result);
  console.log('  ' + result.file + ': ' + result.durationSeconds + ' s de ' + result.seconds + ' s disponíveis' + (result.fits ? '' : ' — texto excede a janela'));
}
const report = { voice, rate: '-5%', fps: 30, segments: results, totalDurationSeconds: Number(results.reduce((sum, item) => sum + item.durationSeconds, 0).toFixed(3)), allFit: results.every((item) => item.fits) };
await writeFile(path.join(outputDir, 'voiceover-manifest.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
if (!report.allFit) process.exitCode = 2;
