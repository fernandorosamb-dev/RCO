"use client";
import {useEffect,useState} from "react";
import {DEFAULT_ROSTER,rosterNames,rosterOptions} from "./role-roster";
export function useRoleRoster(){
 const [profiles,setProfiles]=useState(DEFAULT_ROSTER);
 useEffect(()=>{let active=true;const load=()=>void fetch("/api/role-responsibles",{cache:"no-store"}).then(async r=>{if(r.ok&&active)setProfiles((await r.json()).responsibles);}).catch(()=>{});load();window.addEventListener("rco-roster-updated",load);return()=>{active=false;window.removeEventListener("rco-roster-updated",load);};},[]);
 const names=rosterNames(profiles);
 return {profiles,executorByArea:Object.fromEntries(profiles.map(p=>[p.area,p.imasName||names[p.area]])),names,executors:rosterOptions(profiles)};
}
