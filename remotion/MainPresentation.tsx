import React from 'react';
import {AbsoluteFill,Sequence,Audio,staticFile} from 'remotion';
import {SceneIntro,SceneProblem,SceneSolution,SceneDemo,SceneOutro} from './scenes/Scenes';
const Voice:React.FC<{file:string}> = ({file}) => <Audio src={staticFile('audio/'+file)} volume={1}/>;
export const MainPresentation:React.FC=()=> <AbsoluteFill style={{background:'#0f294a'}}>
 <Sequence from={0} durationInFrames={450}><SceneIntro/></Sequence>
 <Sequence from={450} durationInFrames={450}><SceneProblem/></Sequence>
 <Sequence from={900} durationInFrames={601}><SceneSolution/></Sequence>
 <Sequence from={1501} durationInFrames={1799}><SceneDemo/></Sequence>
 <Sequence from={3300} durationInFrames={300}><SceneOutro/></Sequence>
 <Sequence from={0} durationInFrames={450}><Voice file="01-intro.mp3"/></Sequence>
 <Sequence from={450} durationInFrames={450}><Voice file="02-problema.mp3"/></Sequence>
 <Sequence from={900} durationInFrames={601}><Voice file="03-solucao.mp3"/></Sequence>
 <Sequence from={1501} durationInFrames={450}><Voice file="04-demo-login.mp3"/></Sequence>
 <Sequence from={1951} durationInFrames={450}><Voice file="05-demo-registro.mp3"/></Sequence>
 <Sequence from={2401} durationInFrames={450}><Voice file="06-demo-historico.mp3"/></Sequence>
 <Sequence from={2851} durationInFrames={449}><Voice file="07-demo-aprovacao.mp3"/></Sequence>
 <Sequence from={3300} durationInFrames={300}><Voice file="08-outro.mp3"/></Sequence>
 </AbsoluteFill>;
