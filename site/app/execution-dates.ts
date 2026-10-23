import {planDate} from "./order-deadlines";
/** Muda explicitamente o dia da execução e preserva os horários e o intervalo em dias. */
export function shiftExecutionDate(previousStart:string,previousEnd:string,nextStart:string){
 const before=planDate(previousStart),after=planDate(nextStart),end=planDate(previousEnd);
 if(!before||!after||!end||before===after)return {executionStartedAt:nextStart,completedAt:previousEnd};
 const delta=Date.parse(`${after}T00:00:00Z`)-Date.parse(`${before}T00:00:00Z`);
 const moved=new Date(Date.parse(`${end}T00:00:00Z`)+delta).toISOString().slice(0,10);
 return {executionStartedAt:nextStart,completedAt:moved+previousEnd.slice(10)};
}
