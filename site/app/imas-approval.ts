import type {ExportReport} from "./report-export";
// Approval applies to these exact values and ordered evidence, not a future edit.
export async function approvalFingerprint(r:ExportReport){
 const values=[r.publicId,r.origin,r.osNumber,r.imasOsNumber||"",r.collaborator,r.executionStartedAt,r.completedAt,r.environment,r.floor,r.observations,r.activityType,r.imasSubject||"",r.imasSystem||"",r.imasOpenedAt||"",r.imasActivation||"",r.imasClientReference||"",r.photos.map(p=>p.publicId)];
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(values)));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
