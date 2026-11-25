import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {SceneArchitecture, SceneDemo, SceneDeploy, SceneIntro, SceneOutro, SceneProblem} from './scenes/Scenes';
import type {MockMode} from './components/MockupBrowser';
import {PresenterAvatar} from './components/PresenterAvatar';

const Voice: React.FC<{file: string}> = ({file}) => <Audio src={staticFile('audio/' + file)} volume={1}/>;
const narration = [
  {from: 0, duration: 600, file: '01-apresentacao.mp3', scene: 'intro'},
  {from: 600, duration: 600, file: '02-problema.mp3', scene: 'problem'},
  {from: 1200, duration: 600, file: '03-backend.mp3', scene: 'backend'},
  {from: 1800, duration: 900, file: '04-dados-seguranca.mp3', scene: 'security'},
  {from: 2700, duration: 450, file: '05-cadastro-login.mp3', scene: 'login'},
  {from: 3150, duration: 600, file: '06-visao-colaborador.mp3', scene: 'dashboard'},
  {from: 3750, duration: 600, file: '07-lancamento.mp3', scene: 'form'},
  {from: 4350, duration: 450, file: '08-historico.mp3', scene: 'history'},
  {from: 4800, duration: 900, file: '09-supervisor-banco.mp3', scene: 'approval'},
  {from: 5700, duration: 750, file: '10-deploy.mp3', scene: 'deploy'},
  {from: 6450, duration: 750, file: '11-encerramento.mp3', scene: 'outro'},
] as const;

const DemoScene: React.FC<{mode: MockMode; label: string; caption: string}> = ({mode, label, caption}) =>
  <SceneDemo mode={mode} label={label} caption={caption}/>;

export const MainPresentation: React.FC<{avatarVideo?: boolean; avatarImage?: boolean}> = ({avatarVideo = false, avatarImage = false}) => <AbsoluteFill style={{background: '#f3f3ed'}}>
  <Sequence from={0} durationInFrames={600}><SceneIntro/></Sequence>
  <Sequence from={600} durationInFrames={600}><SceneProblem/></Sequence>
  <Sequence from={1200} durationInFrames={600}><SceneArchitecture/></Sequence>
  <Sequence from={1800} durationInFrames={900}><SceneArchitecture/></Sequence>
  <Sequence from={2700} durationInFrames={450}><DemoScene mode="register" label="3.1 · CADASTRO E LOGIN" caption="Criação de conta e autenticação segura para iniciar a sessão."/></Sequence>
  <Sequence from={3150} durationInFrames={600}><DemoScene mode="dashboard" label="3.2 · RESUMO DO COLABORADOR" caption="Resumo financeiro estimado e informações da jornada no mês."/></Sequence>
  <Sequence from={3750} durationInFrames={600}><DemoScene mode="form" label="3.3 · LANÇAMENTO DE HORAS" caption="Adicional de 50% ou 100%, período, horário e justificativa."/></Sequence>
  <Sequence from={4350} durationInFrames={450}><DemoScene mode="history" label="3.4 · HISTÓRICO" caption="Filtros por tipo e status, com parecer ligado ao lançamento."/></Sequence>
  <Sequence from={4800} durationInFrames={900}><DemoScene mode="approval" label="3.5 · SUPERVISOR E PERSISTÊNCIA" caption="Fila de pendências, decisão registrada e salário individual protegido."/></Sequence>
  <Sequence from={5700} durationInFrames={750}><SceneDeploy/></Sequence>
  <Sequence from={6450} durationInFrames={750}><SceneOutro/></Sequence>
  {narration.map((item) => <Sequence key={item.file} from={item.from} durationInFrames={item.duration}><Voice file={item.file}/></Sequence>)}
   <PresenterAvatar videoAvailable={avatarVideo} imageAvailable={avatarImage} narration={narration}/>
</AbsoluteFill>;
