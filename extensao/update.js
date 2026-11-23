// Reads installed files only. The Windows updater owns authenticated HTTPS downloads
// and verified directory replacement; this module never evaluates remote JavaScript.
export async function installedUpdate({read,hash,currentVersion,pending,running}) {
  if(pending||running)return {reload:false,reason:'aguardando revisão da OS'};
  let state;try{state=await read('update-state.json');}catch{return {reload:false,reason:'pasta sem atualizador local'};}
  if(!state||state.mode!=='validation'||state.saveAllowed!==false)return {reload:false,reason:'modo não aprovado'};
  if(state.version===currentVersion)return {reload:false,reason:'versão atual'};
  if(!/^\d+\.\d+\.\d+$/.test(state.version||'')||!/^[a-f0-9]{64}$/.test(state.manifestHash||''))return {reload:false,reason:'identificação inválida'};
  const current=currentVersion.split('.').map(Number),next=state.version.split('.').map(Number);
  const greater=next.some((n,i)=>n!==current[i]&&next.slice(0,i).every((v,j)=>v===current[j])&&n>current[i]);
  if(!greater)return {reload:false,reason:'versão anterior'};
  const manifestText=await read('manifest.json',true),manifest=JSON.parse(manifestText);
  if(manifest.version!==state.version||await hash(manifestText)!==state.manifestHash)return {reload:false,reason:'arquivos em atualização'};
  return {reload:true,version:state.version,reason:'arquivos locais verificados'};
}
