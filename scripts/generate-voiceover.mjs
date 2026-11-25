import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'node-edge-tts';
import { parseFile } from 'music-metadata';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, '..', 'public', 'audio');
const voice = process.env.TTS_VOICE || 'pt-BR-FranciscaNeural';
const rate = process.env.TTS_RATE || '-5%';
const segments = [
  { file: '01-intro.mp3', label: 'Intro', seconds: 15, text: 'Toda empresa que lida com plantão ou hora extra conhece esse problema: ninguém sabe ao certo quanto cada pessoa trabalhou, nem quanto isso vai custar no fim do mês. O Controle de Horas nasceu pra resolver exatamente isso.' },
  { file: '02-problema.mp3', label: 'Problema', seconds: 15, text: 'Quando o controle é feito em planilha, a visão se perde rápido. Registros espalhados, divergência no fechamento, e hora extra ou plantão sem nenhum histórico confiável pra consultar depois.' },
  { file: '03-solucao.mp3', label: 'Solução e arquitetura', seconds: 20.034, rate: '+11%', text: 'A solução é uma aplicação web simples, de ponta a ponta: interface em HTML e JavaScript, servidor Node.js com API REST, autenticação por token assinado, e os dados guardados em SQLite. E o mais importante: cada perfil vê só o que precisa ver — o supervisor nunca tem acesso ao salário do colaborador.' },
  { file: '04-demo-login.mp3', label: 'Demo — login', seconds: 15, text: 'Na prática, o acesso é simples: o colaborador entra com e-mail e senha, e a sessão já nasce protegida por um token assinado.' },
  { file: '05-demo-registro.mp3', label: 'Demo — lançamento', seconds: 15, text: 'Pra lançar uma hora extra ou um sobreaviso, basta escolher o tipo, informar o período e justificar. O sistema calcula a duração sozinho — inclusive quando o turno vira a madrugada.' },
  { file: '06-demo-historico.mp3', label: 'Demo — histórico', seconds: 15, text: 'E dá pra acompanhar tudo depois: filtrar por tipo, ver o que já foi aprovado, o que ainda tá pendente, o que foi reprovado — sem precisar abrir planilha nenhuma.' },
  { file: '07-demo-aprovacao.mp3', label: 'Demo — aprovação', seconds: 15, text: 'Do outro lado, o supervisor enxerga as solicitações de toda a equipe, lê a justificativa, e aprova ou reprova com um parecer — sem nunca ver o valor do salário de ninguém.' },
  { file: '08-outro.mp3', label: 'Conclusão', seconds: 10, text: 'O resultado é rastreabilidade total, segurança de verdade, e um fechamento de horas muito mais ágil — pra colaborador e pra gestor.' },
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
    console.log('Usando ' + segment.file + ' já gerado');
    continue;
  }
  console.log('Gerando ' + segment.file + ' (' + voice + ')');
  const segmentRate = segment.rate || rate;
  const tts = new EdgeTTS({ voice, lang: 'pt-BR', outputFormat: 'audio-24khz-96kbitrate-mono-mp3', rate: segmentRate, pitch: 'default', volume: 'default', saveSubtitles: true, timeout: 45000 });
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
  const result = { ...segment, rate: segment.rate || rate, durationSeconds: Number(duration.toFixed(3)), durationFrames: Math.ceil(duration * 30), fits: duration <= segment.seconds };
  results.push(result);
  console.log('  ' + result.file + ': ' + result.durationSeconds + ' s de ' + result.seconds + ' s disponíveis' + (result.fits ? '' : ' — texto excede a janela'));
}
const report = { voice, rate, fps: 30, segments: results, totalDurationSeconds: Number(results.reduce((sum, item) => sum + item.durationSeconds, 0).toFixed(3)), allFit: results.every((item) => item.fits) };
await writeFile(path.join(outputDir, 'voiceover-manifest.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
if (!report.allFit) process.exitCode = 2;
