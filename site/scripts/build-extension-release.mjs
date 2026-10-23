import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const source=join(process.cwd(),'tools/imas-extension'),out=join(process.cwd(),'public/extension-source');
const names=['INSTALAR.txt','background.js','imas.js','manifest.json','popup.html','popup.js','rco.js','schedule.js','update.js'];
// The Chrome worker is shipped as one classic script; operational source stays unchanged.
const workerSource=readFileSync(join(source,'background.js'),'utf8');
const imports="import {nextSlot,safeJob} from './schedule.js';\nimport {installedUpdate} from './update.js';\n";
if(!workerSource.startsWith(imports))throw Error('Importações do worker mudaram: revisar o empacotamento.');
const bundledWorker=Buffer.from('// RCO worker: standalone bundle\n'+['schedule.js','update.js'].map(name=>readFileSync(join(source,name),'utf8').replace(/^export /gm,'')).join('\n')+'\n'+workerSource.slice(imports.length));
const bytesFor=name=>name==='background.js'?bundledWorker:name==='schedule.js'?readFileSync(join(source,'worker-bootstrap.js')):readFileSync(join(source,name));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
// HTML served as a page can be transformed by the hosting layer. Download assets
// as binary payloads, then restore their original names only after verification.
const metadata=()=>names.map(name=>{const bytes=bytesFor(name);return {name,path:`/extension-source/${name}.bin`,size:bytes.length,sha256:digest(bytes)};});
const releaseId=files=>digest(JSON.stringify(files));
const manifestPath=join(source,'manifest.json'),feedPath=join(process.cwd(),'public/extension-release.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
let files=metadata();
if(existsSync(feedPath)){
 const previous=JSON.parse(readFileSync(feedPath,'utf8'));
 if(previous.releaseId!==releaseId(files)&&previous.version===manifest.version){const version=manifest.version.split('.').map(Number);version[2]++;manifest.version=version.join('.');writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');files=metadata();}
}
mkdirSync(out,{recursive:true});for(const name of names){writeFileSync(join(out,name),bytesFor(name));writeFileSync(join(out,name+'.bin'),bytesFor(name));}
writeFileSync(feedPath,JSON.stringify({version:manifest.version,releaseId:releaseId(files),mode:'validation',saveAllowed:false,files},null,2)+'\n');
const core=readFileSync('tools/imas-updater/updater.ps1','utf8');
const wrapper=`@echo off\r\nsetlocal\r\nset "RCO_SCRIPT=%~f0"\r\npowershell.exe -NoProfile -Command "& { $raw = [IO.File]::ReadAllText($env:RCO_SCRIPT, [Text.Encoding]::UTF8); $code = ($raw -split '(?m)^# RCO-POWERSHELL\\r?$', 2)[1]; & ([ScriptBlock]::Create($code)) }"\r\nexit /b %errorlevel%\r\n# RCO-POWERSHELL\r\n`;
writeFileSync('public/Instalar_Atualizador_RCO.cmd',wrapper+core.replaceAll('\n','\r\n'));
console.log(`Extensão ${manifest.version}: fonte publicada com ${files.length} arquivos verificados.`);
