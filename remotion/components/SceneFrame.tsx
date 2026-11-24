import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
export const SceneFrame: React.FC<{title:string; eyebrow:string; subtitle?:string; dark?:boolean; children?:React.ReactNode}> = ({title,eyebrow,subtitle,dark=false,children}) => {
 const f=useCurrentFrame(), {fps}=useVideoConfig(), s=spring({frame:f,fps,config:{damping:20,stiffness:80}}), o=interpolate(f,[0,18],[0,1],{extrapolateRight:'clamp'}), fg=dark?'#fff':'#10233f';
 return <AbsoluteFill style={{background:dark?'linear-gradient(135deg,#0f294a,#13315c)':'#f4f7fb',fontFamily:'Inter,Arial,sans-serif',color:fg,padding:'68px 104px',opacity:o}}>
 <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(#8198b522 1px, transparent 1px)',backgroundSize:28,opacity:.4}}/>
 <header style={{position:'relative',zIndex:1,display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:17}}><span>◈ &nbsp; Controle de Horas</span><span style={{fontSize:11,color:dark?'#9fb3cb':'#8794a7'}}>PLATAFORMA DE GESTÃO DE JORNADA</span></header>
 <section style={{position:'relative',zIndex:1,marginTop:72,opacity:s,transform:'translateY('+(1-s)*28+'px)'}}><div style={{fontSize:12,letterSpacing:2.4,fontWeight:700,color:dark?'#82a6ff':'#315fe8',marginBottom:16}}>{eyebrow}</div><h1 style={{fontSize:54,lineHeight:1.13,letterSpacing:-2.2,maxWidth:1300,margin:'0 0 16px',fontWeight:750}}>{title}</h1>{subtitle?<p style={{fontSize:20,lineHeight:1.5,color:dark?'#b7c7da':'#718096',maxWidth:1000,margin:0}}>{subtitle}</p>:null}</section>
 {children?<div style={{position:'relative',zIndex:1,marginTop:42}}>{children}</div>:null}<div style={{position:'absolute',bottom:34,left:104,right:104,height:1,background:dark?'#ffffff24':'#dce4ee'}}/><div style={{position:'absolute',bottom:15,right:104,fontSize:10,color:dark?'#8fa3bc':'#98a4b4'}}>CONTROLE DE HORAS · 2025</div></AbsoluteFill>;
};
