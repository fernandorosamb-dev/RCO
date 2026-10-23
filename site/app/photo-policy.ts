export const STANDARD_PHOTOS = 5;
export function photoSubmission(count:number){
 const pending=count>STANDARD_PHOTOS;
 return {status:pending?"Aguardando aprovação":"Concluída",photoApprovalStatus:pending?"pending":"not_required"};
}
export function needsPhotoApproval(report:{photos:unknown[];photoApprovalStatus?:string}){
 return report.photoApprovalStatus==="pending"||(report.photos.length>STANDARD_PHOTOS&&report.photoApprovalStatus!=="approved");
}
