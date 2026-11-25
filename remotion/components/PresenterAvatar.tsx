import React from 'react';
import {Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {useAudioData, visualizeAudio} from '@remotion/media-utils';

type AudioSegment = {from: number; duration: number; file: string};
type Props = {videoAvailable: boolean; imageAvailable?: boolean; narration: readonly AudioSegment[]};

const frameStyle: React.CSSProperties = {
  position: 'absolute',
  right: 60,
  bottom: 54,
  width: 148,
  height: 148,
  borderRadius: '50%',
  overflow: 'hidden',
  border: '5px solid #b8f34a',
  boxShadow: '0 8px 24px #17191455, 0 0 0 3px #f3f3ed',
  zIndex: 100,
  pointerEvents: 'none',
};

const VideoPresenter: React.FC = () => <div style={frameStyle}>
  <OffthreadVideo
    src={staticFile('avatar.mp4')}
    muted
    volume={0}
    loop
    style={{width: '100%', height: '100%', objectFit: 'cover'}}
  />
</div>;

const ImagePresenter: React.FC = () => <div style={frameStyle}>
  <Img src={staticFile('avatar.png')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
</div>;

const IllustratedPresenter: React.FC<Props> = ({narration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const active = narration.find((segment) => frame >= segment.from && frame < segment.from + segment.duration) ?? narration[narration.length - 1];
  const audioData = useAudioData(staticFile('audio/' + active.file), {sampleRate: 8000});
  const spectrum = audioData
    ? visualizeAudio({audioData, frame: frame - active.from, fps, numberOfSamples: 16, optimizeFor: 'speed'})
    : [];
  const amplitude = spectrum.slice(0, 8).reduce((sum, value) => sum + value, 0) / 8;
  const mouthHeight = Math.min(13, Math.max(1.4, amplitude * 185));
  const blinkPhase = frame % 105;
  const eyeHeight = blinkPhase === 1 ? 0.8 : blinkPhase === 2 ? 2.1 : 5.5;

  return <div style={frameStyle}>
    <svg viewBox="0 0 220 220" width="100%" height="100%" role="img" aria-label="Avatar ilustrado do apresentador">
      <defs>
        <clipPath id="presenter-circle"><circle cx="110" cy="110" r="106"/></clipPath>
        <linearGradient id="presenter-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f7f8f2"/><stop offset="1" stopColor="#e9f2d9"/></linearGradient>
        <linearGradient id="presenter-shirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34372f"/><stop offset="1" stopColor="#171914"/></linearGradient>
      </defs>
      <g clipPath="url(#presenter-circle)">
        <rect width="220" height="220" fill="url(#presenter-bg)"/>
        <circle cx="176" cy="37" r="31" fill="#b8f34a" opacity=".24"/>
        <path d="M32 224c4-49 35-73 78-73s74 24 78 73" fill="url(#presenter-shirt)"/>
        <path d="m87 154 23 28 23-28-9-15h-28z" fill="#f4c5a4"/>
        <path d="m94 167 16 17 16-17 16 53H78z" fill="#f7f8f2"/>
        <path d="m78 172-17 12 18 18 13-16m50-14 17 12-18 18-13-16" fill="#2a2d25"/>
        <ellipse cx="67" cy="98" rx="9" ry="14" fill="#d99f7f"/>
        <ellipse cx="153" cy="98" rx="9" ry="14" fill="#d99f7f"/>
        <path d="M69 76c0-28 16-46 41-46 27 0 42 20 42 48v26c0 29-18 49-42 49-24 0-41-20-41-49z" fill="#edb995"/>
        <path d="M66 91c-5-41 14-65 47-65 28 0 47 19 44 61l-12-9-8-22c-16 12-37 17-65 15l-3 22z" fill="#252820"/>
        <path d="M72 77c6-19 20-31 39-34 20-3 34 5 43 21-17-8-37-8-58-3-10 2-18 8-24 16z" fill="#30342a"/>
        <path d="M81 76q9-6 18 0" fill="none" stroke="#604536" strokeWidth="3" strokeLinecap="round"/>
        <path d="M121 76q9-6 18 0" fill="none" stroke="#604536" strokeWidth="3" strokeLinecap="round"/>
        <ellipse cx="90" cy="88" rx="4.3" ry={eyeHeight} fill="#282820"/>
        <ellipse cx="130" cy="88" rx="4.3" ry={eyeHeight} fill="#282820"/>
        <path d="M109 91q-3 11 2 14" fill="none" stroke="#bd876b" strokeWidth="2.5" strokeLinecap="round"/>
        {mouthHeight > 3.3
          ? <ellipse cx="110" cy="116" rx="9" ry={mouthHeight} fill="#733d3b"/>
          : <path d="M101 116q9 6 18 0" fill="none" stroke="#8c4f49" strokeWidth="2.8" strokeLinecap="round"/>}
        <path d="M82 128q28 17 56 0" fill="none" stroke="#d38e79" strokeWidth="2" opacity=".65"/>
        <path d="M95 157h30" stroke="#b8f34a" strokeWidth="5" strokeLinecap="round"/>
      </g>
    </svg>
  </div>;
};

export const PresenterAvatar: React.FC<Props> = (props) => props.imageAvailable
  ? <ImagePresenter/>
  : props.videoAvailable
    ? <VideoPresenter/>
    : <IllustratedPresenter {...props}/>;
