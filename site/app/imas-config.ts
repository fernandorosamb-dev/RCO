// Labels transcribed from the supervisor's IMAS screenshots. Values are selected by text,
// never by guessed external numeric IDs.
export const IMAS_SYSTEMS = ["Análise de qualidade do ar", "Análise e/ou tratamento químico da água", "CFTV", "Civil", "Climatização", "Combate a pragas", "Elétrico", "Elevadores / Plataforma Elevatória", "Estoque", "EXAUSTOR", "Grupo Gerador de Emergência", "Instalações gerais", "Instalações hidráulicas", "Manutenção crítica", "Mobiliário", "Moto-bombas", "Outros", "Prevenção e Combate a Incêndio", "SPDA", "Subcontratados", "Telecomunicação", "Tipo de equipamento"] as const;
export const IMAS_FIXED = {clientCode:"91", client:"BB - DEPOSITO SÃO PAULO",unit:"ED. DEPÓSITO SOROCABA (SP) - Sorocaba - SP",status:"1 - Aberta",creationJustification:"Abertura de OS",ans:"Normal",ansJustification:"OK",completionJustification:"Ajuste de data da execução",type:"CORRETIVA"};
export const IMAS_RESPONSIBLE:Record<string,string> = {supervisor:"FERNANDO DA ROSA - SUPERVISOR DE MANUTENÇÃO",hidraulica:"EVERSON VICENTE FERREIRA - BOMBEIRO HIDRÁULICO",refrigeracao:"FABRICIO RODRIGO DA SILVA - MECÂNICO DE REFRIGERAÇÃO",civil:"IVAN RIVALDIR DE SOUZA SANTOS - AUXILIAR DE MANUTENÇÃO"};
export const APP_RESPONSIBLE:Record<string,string> = {...IMAS_RESPONSIBLE};
export const isImasDate=(value:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)&&Number.isFinite(Date.parse(value));
export type ImasFields = {imasSystem?:string;imasSubject?:string;imasOpenedAt?:string;imasActivation?:string;imasClientReference?:string;imasOsNumber?:string;imasEquipmentCode?:string;imasEquipmentName?:string;};

export const IMAS_EXECUTORS=Object.values(IMAS_RESPONSIBLE);
export const imasExecutor=(value:string)=>IMAS_EXECUTORS.includes(value)?value:["FERNANDO DA ROSA - ELETROTÉCNICO","FERNANDO DA ROSA - SUPERVISOR"].includes(value)?IMAS_RESPONSIBLE.supervisor:"";
export const imasOpeningNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
