import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hasPresenterVideo = existsSync(path.join(projectRoot, 'public', 'avatar.mp4'));
const hasPresenterImage = existsSync(path.join(projectRoot, 'public', 'avatar.png'));
const remotionCli = path.join(projectRoot, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const props = JSON.stringify({avatarVideo: hasPresenterVideo, avatarImage: hasPresenterImage});

console.log(hasPresenterImage
  ? 'Avatar apresentador: usando public/avatar.png.'
  : hasPresenterVideo
  ? 'Avatar apresentador: usando public/avatar.mp4.'
  : 'Avatar apresentador: usando ilustração animada com a narração.');

const result = spawnSync(process.execPath, [
  remotionCli,
  'render',
  'remotion/index.tsx',
  'ControleDeHoras',
  'out/video.mp4',
  '--codec',
  'h264',
  '--props',
  props,
  ...process.argv.slice(2),
], {cwd: projectRoot, stdio: 'inherit'});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
