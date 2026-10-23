export async function toJpeg(file: File): Promise<File> {
  const image = document.createElement("img"); const url = URL.createObjectURL(file);
  try { await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Não foi possível ler esta imagem. Use uma foto JPEG, PNG ou WebP compatível com seu aparelho."));image.src=url});
    let max=480,quality=.35,blob:Blob|null=null;
    for(let attempt=0;attempt<10;attempt++){const side=Math.max(1,Math.min(max,Math.max(image.naturalWidth,image.naturalHeight))),area=Math.max(1,Math.round(side*.90));const scale=Math.min(area/image.naturalWidth,area/image.naturalHeight);const width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));const canvas=document.createElement("canvas");canvas.width=side;canvas.height=side;const context=canvas.getContext("2d");if(!context)throw new Error("Falha ao preparar a foto.");context.fillStyle="#fff";context.fillRect(0,0,side,side);context.drawImage(image,Math.round((side-width)/2),Math.round((side-height)/2),width,height);blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("Falha ao converter a foto.")),"image/jpeg",quality));if(blob.size<=15_000)break;max=Math.round(max*.82);quality=Math.max(.22,quality-.04);}
    if(!blob||blob.size>15_000)throw new Error("Falha ao converter a foto.");return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"});
  } finally { URL.revokeObjectURL(url); }
}

// Compress and upload one image at a time: phone memory and request size do not grow with the batch.
export async function appendUploadedPhotos(body:FormData,files:File[],progress:(message:string)=>void){
 for(const [index,file] of files.entries()){
  progress(`Compactando foto ${index+1} de ${files.length}...`);
  let jpeg:File;try{jpeg=await toJpeg(file);}catch(error){throw Error(`Foto ${index+1} (${file.name}): ${error instanceof Error?error.message:"imagem inválida"}`);}
  const photo=new FormData();photo.append("photo",jpeg);
  progress(`Enviando foto ${index+1} de ${files.length}...`);
  const response=await fetch("/api/photo-uploads",{method:"POST",body:photo});const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.token)throw Error(result.error||`Não foi possível enviar a foto ${index+1}. As fotos continuam na tela para tentar novamente.`);
  body.append("photoTokens",result.token);
 }
}
