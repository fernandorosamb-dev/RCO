import {IMAS_RESPONSIBLE,imasExecutor} from "./imas-config";
export const ROSTER_AREAS=["supervisor","eletrica","hidraulica","refrigeracao","civil"] as const;
export type RosterArea=typeof ROSTER_AREAS[number];
export type RoleResponsible={area:RosterArea;title:string;name:string;imasName:string;revision:number};
export const DEFAULT_ROSTER:RoleResponsible[]=[
 {area:"supervisor",title:"Supervisor de Manutenção",name:"Fernando da Rosa",imasName:IMAS_RESPONSIBLE.supervisor,revision:0},
 {area:"eletrica",title:"Eletrotécnico",name:"Allan dos Santos Benides",imasName:"ALLAN DOS SANTOS BENIDES - ELETROTÉCNICO",revision:0},
 {area:"hidraulica",title:"Bombeiro Hidráulico",name:"Everson Vicente Ferreira",imasName:IMAS_RESPONSIBLE.hidraulica,revision:0},
 {area:"refrigeracao",title:"Mecânico de Refrigeração",name:"Fabrício Rodrigo da Silva",imasName:IMAS_RESPONSIBLE.refrigeracao,revision:0},
 {area:"civil",title:"Auxiliar de Manutenção",name:"Ivan Rivaldir de Souza Santos",imasName:IMAS_RESPONSIBLE.civil,revision:0},
];
export const roleLabel=(p:RoleResponsible)=>`${p.name} - ${p.title}`;
export function mergeRoster(rows:{area:string;name:string;imas_name:string;revision:number}[]){return DEFAULT_ROSTER.map(p=>{const row=rows.find(r=>r.area===p.area);return row?{...p,name:row.name,imasName:row.imas_name,revision:row.revision}:{...p};});}
const matchesPerson=(p:RoleResponsible,value:string)=>value===roleLabel(p)||value===p.imasName||value===p.name||(p.area==="eletrica"&&p.name==="Allan dos Santos Benides"&&["Allan","Allan - Eletrotécnico"].includes(value));
export function rosterExecutor(value:string,roster:RoleResponsible[]){if(!value)return "";const p=roster.find(p=>matchesPerson(p,value));return p?(p.imasName||roleLabel(p)):imasExecutor(value);}
export function verifiedExecutor(value:string,roster:RoleResponsible[]){if(!value)return "";const p=roster.find(p=>matchesPerson(p,value));return p?p.imasName:imasExecutor(value);}
export const rosterNames=(roster:RoleResponsible[])=>Object.fromEntries(roster.map(p=>[p.area,roleLabel(p)]));
export const rosterOptions=(roster:RoleResponsible[])=>roster.map(p=>p.imasName||roleLabel(p));
