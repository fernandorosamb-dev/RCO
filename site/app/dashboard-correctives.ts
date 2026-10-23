export type Corrective={lastAttemptAt?:number|null;lastError?:string;lastStep?:string;imasCompletionPending?:boolean;publicId:string;osNumber:string;imasOsNumber:string;status:string;origin:string;activityType:string;area:string;collaborator:string;environment:string;floor:string;observations:string;equipment:string;executionStartedAt:string;completedAt:string;downloadedAt:string|null;createdAt:string;photos:{publicId:string;fileName:string;url:string}[]};
export type CorrectiveStatus="waiting"|"created"|"done"|"returned";
export function correctiveState(report:{status:string;imasOsNumber?:string;downloadedAt:string|null}):CorrectiveStatus{
 // A resposta "Concluída" no app não comprova baixa no IMAS. Use a confirmação persistida.
 if(report.downloadedAt)return "done";
 if(report.status==="Devolvida")return "returned";
 return report.imasOsNumber?"created":"waiting";
}
