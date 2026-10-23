import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {File} from 'node:buffer';
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test('40 fotos grandes são compactadas e enviadas uma por vez; formulário final contém só referências',async()=>{
 let active=0,maxActive=0,uploads=0;const progress=[];const exports={};
 const ctx={exports,File,Blob,FormData,URL:{createObjectURL:()=>'',revokeObjectURL(){}},document:{createElement:tag=>tag==='img'?{naturalWidth:8000,naturalHeight:6000,set src(v){queueMicrotask(()=>this.onload())}}:{getContext:()=>({fillRect(){},drawImage(){}}),toBlob(cb,type,quality){cb(new Blob([new Uint8Array(15_000)],{type}))}}},fetch:async(url,opts)=>{active++;maxActive=Math.max(active,maxActive);assert.equal(url,'/api/photo-uploads');assert.ok(opts.body.get('photo').size<=15_000);await new Promise(r=>setTimeout(r,1));active--;return {ok:true,json:async()=>({token:`token-${++uploads}`})}},queueMicrotask};vm.runInNewContext(compile('../app/photo-upload.ts'),ctx);
 const files=Array.from({length:40},(_,i)=>new File([new Uint8Array(2_000_000)],`foto-${i}.png`,{type:'image/png'}));const data=new FormData();await exports.appendUploadedPhotos(data,files,m=>progress.push(m));assert.equal(maxActive,1);assert.equal(uploads,40);assert.equal(data.getAll('photos').length,0);assert.equal(data.getAll('photoTokens').length,40);assert.match(progress.at(-1),/40 de 40/);
});
test('falha de uma foto interrompe antes de enviar a OS e identifica o número da foto',async()=>{
 const exports={};vm.runInNewContext(compile('../app/photo-upload.ts'),{exports,File,Blob,FormData,URL:{createObjectURL:()=>'',revokeObjectURL(){}},document:{createElement:()=>({set src(v){queueMicrotask(()=>this.onerror())}})},queueMicrotask});await assert.rejects(()=>exports.appendUploadedPhotos(new FormData(),[new File(['bad'],'foto.heic')],()=>{}),/Foto 1.*foto.heic/);
});
test('referência de foto precisa pertencer ao perfil e não pode se repetir',async()=>{
 const token='12345678-1234-1234-1234-123456789abc',exports={},lookups=[];vm.runInNewContext(compile('../app/uploaded-photos.ts'),{exports,File,FormData,env:{},require:()=>({env:{BUCKET:{head:async key=>{lookups.push(key);return key.includes('/civil/')?{httpMetadata:{contentType:'image/jpeg'},size:100,arrayBuffer:async()=>new ArrayBuffer(100)}:null}}}})});const data=new FormData();data.append('photoTokens',token);assert.equal((await exports.uploadedPhotos(data,'civil')).length,1);await assert.rejects(()=>exports.uploadedPhotos(data,'eletrica'),/não está disponível/);data.append('photoTokens',token);await assert.rejects(()=>exports.uploadedPhotos(data,'civil'),/inválida/);assert.equal(lookups.length,2);
});

// The cap is enforced even when an encoder ignores the requested quality.
test('foto acima de 15 KB reduz resolução e qualidade antes de enviar',async()=>{
 const exports={},sizes=[],qualities=[];let attempt=0;
 const ctx={exports,File,Blob,FormData,URL:{createObjectURL:()=>'',revokeObjectURL(){}},queueMicrotask,document:{createElement:tag=>tag==='img'?{naturalWidth:4000,naturalHeight:3000,set src(v){queueMicrotask(()=>this.onload())}}:{getContext:()=>({fillRect(){},drawImage(){}}),toBlob(cb,type,quality){sizes.push(this.width);qualities.push(quality);cb(new Blob([new Uint8Array(++attempt===1?25000:15000)],{type}));}}}};vm.runInNewContext(compile('../app/photo-upload.ts'),ctx);const file=await exports.toJpeg(new File(['original'],'photo.png'));assert.ok(file.size<=15000);assert.equal(sizes[0],480);assert.ok(sizes[1]<480);assert.ok(qualities[1]<qualities[0]);
});
