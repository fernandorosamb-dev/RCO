import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rolePasswords = sqliteTable("role_passwords", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role").notNull().unique(),
  salt: text("salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const osImports = sqliteTable("os_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(),
  competence: text("competence").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull().unique(),
  osCount: integer("os_count").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_os_imports_competence").on(table.competence)]);

export const workOrders = sqliteTable("work_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(),
  importPublicId: text("import_public_id"),
  competence: text("competence").notNull(),
  osNumber: text("os_number").notNull(),
  client: text("client").notNull().default(""),
  unit: text("unit").notNull().default(""),
  environment: text("environment").notNull().default(""),
  floor: text("floor").notNull().default(""),
  openedAt: text("opened_at").notNull().default(""),
  dueAt: text("due_at").notNull().default(""),
  originalStatus: text("original_status").notNull().default("Aberta"),
  description: text("description").notNull().default(""),
  equipment: text("equipment").notNull().default(""),
  assignedArea: text("assigned_area").notNull().default(""),
  assignedResponsible: text("assigned_responsible").notNull().default(""),
  status: text("status").notNull().default("Atribuir"),
  importedText: text("imported_text").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_work_orders_competence_os").on(table.competence, table.osNumber),
  index("idx_work_orders_area_status").on(table.assignedArea, table.status),
]);

export const serviceReports = sqliteTable("service_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(),
  osNumber: text("os_number").notNull(),
  collaborator: text("collaborator").notNull(),
  executionStartedAt: text("execution_started_at").notNull(),
  completedAt: text("completed_at").notNull(),
  environment: text("environment").notNull(),
  floor: text("floor").notNull(),
  observations: text("observations").notNull(),
  returnReason: text("return_reason").notNull().default(""),
  status: text("status").notNull().default("Concluída"),
  workOrderPublicId: text("work_order_public_id"),
  origin: text("origin").notNull().default("sistema"),
  activityType: text("activity_type").notNull().default(""),
  description: text("description").notNull().default(""),
  equipment: text("equipment").notNull().default(""),
  imasEquipmentCode: text("imas_equipment_code").notNull().default(""),
  imasEquipmentName: text("imas_equipment_name").notNull().default(""),
  area: text("area").notNull().default(""),
  createdByRole: text("created_by_role").notNull().default(""),
  imasSystem: text("imas_system").notNull().default(""),
  imasSubject: text("imas_subject").notNull().default(""),
  imasOpenedAt: text("imas_opened_at").notNull().default(""),
  imasActivation: text("imas_activation").notNull().default(""),
  imasClientReference: text("imas_client_reference").notNull().default(""),
  imasOsNumber: text("imas_os_number").notNull().default(""),
  photoApprovalStatus: text("photo_approval_status").notNull().default("not_required"),
  photoApprovedAt: integer("photo_approved_at", { mode: "timestamp_ms" }),
  downloadedAt: integer("downloaded_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_service_reports_os").on(table.osNumber), index("idx_service_reports_created_at").on(table.createdAt)]);

export const reportPhotos = sqliteTable("report_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(),
  reportPublicId: text("report_public_id").notNull(),
  objectKey: text("object_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_report_photos_report").on(table.reportPublicId)]);

export const meterReadings = sqliteTable("meter_readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(),
  readingDate: text("reading_date").notNull().unique(),
  collaborator: text("collaborator").notNull(),
  submittedByRole: text("submitted_by_role").notNull().default(""),
  waterStreet: integer("water_street").notNull(),
  waterWell: integer("water_well").notNull(),
  electric1: integer("electric_1").notNull(),
  electric2: integer("electric_2").notNull(),
  occurrence: text("occurrence").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_meter_readings_date").on(table.readingDate)]);

export const imasAutomationRuns = sqliteTable("imas_automation_runs", {
  runId: text("run_id").primaryKey(),
  reportPublicId: text("report_public_id").notNull(),
  version: text("version").notNull(),
  state: text("state").notNull(),
  step: text("step").notNull(),
  traceJson: text("trace_json").notNull(),
  diagnosticsJson: text("diagnostics_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [index("idx_imas_runs_report_updated").on(table.reportPublicId, table.updatedAt)]);

// One durable supervisor request per report; claiming prevents duplicate execution.
export const imasAutomationRequests = sqliteTable("imas_automation_requests", {
  reportPublicId: text("report_public_id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  fingerprint: text("fingerprint").notNull(),
  state: text("state").notNull(),
  requestedAt: integer("requested_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const serviceDocuments = sqliteTable("service_documents", {
  publicId: text("public_id").primaryKey(),
  reference: text("reference").notNull().unique(),
  createdByRole: text("created_by_role").notNull(),
  kind: text("kind").notNull(),
  dataJson: text("data_json").notNull(),
  status: text("status").notNull().default("pending"),
  approvedBy: text("approved_by").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, table => [index("idx_service_documents_role_created").on(table.createdByRole,table.createdAt)]);

// Propostas do engenheiro: nada é aplicado sem decisão do supervisor.
export const changeRequests = sqliteTable("change_requests", {
  publicId: text("public_id").primaryKey(),
  reportPublicId: text("report_public_id").notNull(),
  requestedBy: text("requested_by").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull().default(""),
  beforeJson: text("before_json").notNull().default("{}"),
  afterJson: text("after_json").notNull().default("{}"),
  state: text("state").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  decidedAt: integer("decided_at"),
}, table => [index("idx_change_requests_state").on(table.state, table.createdAt), index("idx_change_requests_report").on(table.reportPublicId)]);

// Pedido do engenheiro para executar o lote do mês; roda na máquina do supervisor.
export const batchRequests = sqliteTable("batch_requests", {
  publicId: text("public_id").primaryKey(),
  month: text("month").notNull(),
  requestedBy: text("requested_by").notNull(),
  state: text("state").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  claimedAt: integer("claimed_at"),
});

// Documentos de RH ficam na plataforma e não participam da integração IMAS.
export const medicalDocuments = sqliteTable("medical_documents", {
 publicId:text("public_id").primaryKey(),
 reference:text("reference").notNull().unique(),
 submissionToken:text("submission_token").notNull().unique(),
 createdByRole:text("created_by_role").notNull(),
 dataJson:text("data_json").notNull(),
 objectKey:text("object_key").notNull().unique(),
 contentType:text("content_type").notNull(),
 fileName:text("file_name").notNull(),
 fileSize:integer("file_size").notNull(),
 emailStatus:text("email_status").notNull().default("pending_configuration"),
 emailError:text("email_error").notNull().default(""),
 gmailMessageId:text("gmail_message_id").notNull().default(""),
 emailSentAt:integer("email_sent_at"),
 supervisorSeenAt:integer("supervisor_seen_at"),
 engineerSeenAt:integer("engineer_seen_at"),
 createdAt:integer("created_at").notNull(),
 updatedAt:integer("updated_at").notNull(),
},table=>[index("idx_medical_documents_role_created").on(table.createdByRole,table.createdAt)]);

export const workOrderSchedule = sqliteTable("work_order_schedule", {
 workOrderPublicId:text("work_order_public_id").primaryKey(),
 originalDate:text("original_date").notNull(),
 executionDate:text("execution_date").notNull(),
 reason:text("reason").notNull().default(""),
 changedByRole:text("changed_by_role").notNull(),
 changeId:text("change_id").notNull().unique(),
 revision:integer("revision").notNull().default(1),
 updatedAt:integer("updated_at").notNull(),
});
export const workOrderScheduleHistory = sqliteTable("work_order_schedule_history", {
 publicId:text("public_id").primaryKey(),
 workOrderPublicId:text("work_order_public_id").notNull(),
 previousDate:text("previous_date").notNull(),
 executionDate:text("execution_date").notNull(),
 reason:text("reason").notNull().default(""),
 changedByRole:text("changed_by_role").notNull(),
 revision:integer("revision").notNull(),
 createdAt:integer("created_at").notNull(),
},table=>[uniqueIndex("idx_schedule_history_revision").on(table.workOrderPublicId,table.revision)]);

export const roleResponsibles=sqliteTable("role_responsibles",{
 area:text("area").primaryKey(),name:text("name").notNull(),imasName:text("imas_name").notNull().default(""),revision:integer("revision").notNull(),changeId:text("change_id").notNull(),updatedAt:integer("updated_at").notNull(),
});
export const roleResponsibleHistory=sqliteTable("role_responsible_history",{
 publicId:text("public_id").primaryKey(),area:text("area").notNull(),previousName:text("previous_name").notNull(),previousImasName:text("previous_imas_name").notNull(),name:text("name").notNull(),imasName:text("imas_name").notNull(),revision:integer("revision").notNull(),changedByRole:text("changed_by_role").notNull(),createdAt:integer("created_at").notNull(),
});
