import React from 'react';
import {registerRoot,Composition} from 'remotion';
import {MainPresentation} from './MainPresentation';
const Root:React.FC=()=> <Composition id="ControleDeHoras" component={MainPresentation} durationInFrames={7200} fps={30} width={1920} height={1080}/>;
registerRoot(Root);
