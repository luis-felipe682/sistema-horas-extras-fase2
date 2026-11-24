import React from 'react';
import {interpolate,spring,useCurrentFrame,useVideoConfig} from 'remotion';
type Props={x?:number;y?:number;start?:number};
export const AnimatedCursor:React.FC<Props> = ({x=0.72,y=0.68,start=0}) => {
 const frame=useCurrentFrame(); const {fps}=useVideoConfig();
 const scale=spring({frame:frame-start,fps,config:{damping:18,stiffness:90}});
 const movement=interpolate(frame,[0,10,25,34,44,58,72,88],[-.13,-.07,0,.035,.02,-.05,0,.025],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 const tap=interpolate(frame%48,[0,20,23,28,48],[1,1,.78,1,1]);
 const style:React.CSSProperties={position:'absolute',left:(x*100+movement*100)+'%',top:(y*100+movement*45)+'%',zIndex:30,transform:'translate(-4px,-2px) scale('+(scale*tap)+')',filter:'drop-shadow(0 4px 5px #07172c66)'};
 return <div style={style}><svg width="38" height="48" viewBox="0 0 38 48"><path d="M5 3v31l8-8 6 15 6-3-6-14h12L5 3Z" fill="white" stroke="#122b4e" strokeWidth="2.4" strokeLinejoin="round"/></svg></div>;
};
