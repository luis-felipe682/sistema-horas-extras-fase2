import React from 'react';
import {AbsoluteFill,Sequence,Audio,staticFile} from 'remotion';
import {SceneIntro,SceneProblem,SceneSolution,SceneDemo,SceneOutro} from './scenes/Scenes';
const Voice:React.FC<{file:string}> = ({file}) => <Audio src={staticFile('audio/'+file)} volume={1}/>;
export const MainPresentation:React.FC=()=> <AbsoluteFill style={{background:'#0f294a'}}>
 <Sequence from={0} durationInFrames={360}><SceneIntro/></Sequence>
 <Sequence from={360} durationInFrames={540}><SceneProblem/></Sequence>
 <Sequence from={900} durationInFrames={540}><SceneSolution/></Sequence>
 <Sequence from={1440} durationInFrames={1620}><SceneDemo/></Sequence>
 <Sequence from={3060} durationInFrames={540}><SceneOutro/></Sequence>
 <Sequence from={0} durationInFrames={360}><Voice file="01-intro.mp3"/></Sequence>
 <Sequence from={360} durationInFrames={540}><Voice file="02-problema.mp3"/></Sequence>
 <Sequence from={900} durationInFrames={540}><Voice file="03-solucao.mp3"/></Sequence>
 <Sequence from={1440} durationInFrames={360}><Voice file="04-demo-login.mp3"/></Sequence>
 <Sequence from={1800} durationInFrames={480}><Voice file="05-demo-registro.mp3"/></Sequence>
 <Sequence from={2280} durationInFrames={390}><Voice file="06-demo-historico.mp3"/></Sequence>
 <Sequence from={2670} durationInFrames={390}><Voice file="07-demo-aprovacao.mp3"/></Sequence>
 <Sequence from={3060} durationInFrames={540}><Voice file="08-outro.mp3"/></Sequence>
 </AbsoluteFill>;
