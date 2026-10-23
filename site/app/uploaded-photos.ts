import {env} from "cloudflare:workers";
type PhotoSource={type:string;size:number;stream:()=>ReadableStream<Uint8Array>|Promise<ReadableStream<Uint8Array>>};
export async function uploadedPhotos(data:FormData,role:string):Promise<PhotoSource[]>{
 const direct=data.getAll("photos").filter((item):item is File=>item instanceof File&&item.size>0);
 const tokens=data.getAll("photoTokens");if(tokens.some(token=>typeof token!=="string"||!/^[-a-f0-9]{36}$/.test(token))||new Set(tokens).size!==tokens.length)throw Error("Lista de fotos inválida.");
 const files:PhotoSource[]=[...direct];for(const token of tokens){const object=await env.BUCKET.head(`photo-uploads/${role}/${token}.jpg`);if(!object||object.httpMetadata?.contentType!=="image/jpeg"||object.size>15_000)throw Error("Uma foto enviada não está disponível. Envie novamente.");files.push({type:"image/jpeg",size:object.size,stream:async()=>{const photo=await env.BUCKET.get(`photo-uploads/${role}/${token}.jpg`);if(!photo)throw Error("Foto não disponível. Envie novamente.");return photo.body;}});}return files;
}
export async function clearUploadedPhotos(data:FormData,role:string){await Promise.allSettled(data.getAll("photoTokens").map(token=>env.BUCKET.delete(`photo-uploads/${role}/${token}.jpg`)));}
