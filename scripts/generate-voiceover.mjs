import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'node-edge-tts';
import { parseFile } from 'music-metadata';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, '..', 'public', 'audio');
const voice = process.env.TTS_VOICE || 'pt-BR-AntonioNeural';
const segments = [
  { file: '01-intro.mp3', label: 'Abertura', seconds: 12, text: 'Olá, seja bem-vindo ao Controle de Horas. Uma plataforma para organizar horas extras e sobreaviso. O tempo da sua equipe, bem acompanhado.' },
  { file: '02-problema.mp3', label: 'O problema', seconds: 18, text: 'Planilhas dispersas tornam o controle de horas sujeito a erros e retrabalho. Sem rastreabilidade, colaboradores e gestores têm dificuldade para consultar justificativas, históricos e acompanhar as decisões sobre cada solicitação.' },
  { file: '03-solucao.mp3', label: 'A solução e arquitetura', seconds: 18, text: 'Na base: interface web, API REST em Node.js e banco SQLite. Senhas protegidas por scrypt. Sessões com token assinado, equivalente ao formato JWT.' },
  { file: '04-demo-login.mp3', label: 'Acesso e cadastro', seconds: 12, text: 'Na entrada, o usuário informa e-mail e senha ou cria uma conta. O acesso inicia uma sessão autenticada com token assinado.' },
  { file: '05-demo-registro.mp3', label: 'Registro de horas', seconds: 16, text: 'No lançamento, escolhe hora extra ou sobreaviso, informa datas, horários e justificativa. O sistema calcula a duração, inclusive na virada do dia, e aplica a compensação cruzada quando cabível.' },
  { file: '06-demo-historico.mp3', label: 'Histórico e acompanhamento', seconds: 13, text: 'Os registros podem ser filtrados por tipo e status. O colaborador acompanha justificativas, pareceres e situações: pendente, aprovado ou reprovado.' },
  { file: '07-demo-aprovacao.mp3', label: 'Gestão e aprovação', seconds: 13, text: 'O supervisor revisa justificativas, inclui parecer e aprova ou reprova. Os totais ficam visíveis, sem acesso a salários individuais.' },
  { file: '08-outro.mp3', label: 'Resultados e encerramento', seconds: 18, text: 'Com histórico claro, pareceres e consolidação por colaborador, o Controle de Horas traz rastreabilidade e agilidade à gestão da jornada. Colaboradores consultam suas próprias estimativas financeiras. Obrigado por acompanhar.' },
];

await mkdir(outputDir, { recursive: true });
const tts = new EdgeTTS({ voice, lang: 'pt-BR', outputFormat: 'audio-24khz-96kbitrate-mono-mp3', rate: '-5%', pitch: 'default', volume: 'default', saveSubtitles: true, timeout: 45000 });
const results = [];
const force = process.argv.includes('--force');
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
  } else {
    console.log('Gerando ' + segment.file + ' (' + voice + ')');
    await tts.ttsPromise(segment.text, output);
  }
}
for (const segment of segments) {
  const output = path.join(outputDir, segment.file);
  const metadata = await parseFile(output);
  const duration = metadata.format.duration ?? 0;
  const result = { ...segment, durationSeconds: Number(duration.toFixed(3)), durationFrames: Math.ceil(duration * 30), fits: duration <= segment.seconds };
  results.push(result);
  console.log('  ' + result.durationSeconds + ' s de ' + segment.seconds + ' s disponíveis' + (result.fits ? '' : ' — texto excede a janela'));
}
const report = { voice, rate: '-5%', fps: 30, segments: results, totalDurationSeconds: Number(results.reduce((sum, item) => sum + item.durationSeconds, 0).toFixed(3)), allFit: results.every((item) => item.fits) };
await writeFile(path.join(outputDir, 'voiceover-manifest.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
if (!report.allFit) process.exitCode = 2;
