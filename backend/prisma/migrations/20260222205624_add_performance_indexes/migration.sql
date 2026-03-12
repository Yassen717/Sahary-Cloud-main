-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "backups_vmId_idx" ON "backups"("vmId");

-- CreateIndex
CREATE INDEX "backups_userId_idx" ON "backups"("userId");

-- CreateIndex
CREATE INDEX "backups_status_idx" ON "backups"("status");

-- CreateIndex
CREATE INDEX "emergency_logs_timestamp_idx" ON "emergency_logs"("timestamp");

-- CreateIndex
CREATE INDEX "invoices_userId_idx" ON "invoices"("userId");

-- CreateIndex
CREATE INDEX "invoices_userId_status_idx" ON "invoices"("userId", "status");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "invoices_createdAt_idx" ON "invoices"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "solar_alerts_resolved_idx" ON "solar_alerts"("resolved");

-- CreateIndex
CREATE INDEX "solar_alerts_severity_idx" ON "solar_alerts"("severity");

-- CreateIndex
CREATE INDEX "solar_alerts_createdAt_idx" ON "solar_alerts"("createdAt");

-- CreateIndex
CREATE INDEX "solar_data_timestamp_idx" ON "solar_data"("timestamp");

-- CreateIndex
CREATE INDEX "solar_data_systemStatus_idx" ON "solar_data"("systemStatus");

-- CreateIndex
CREATE INDEX "system_status_timestamp_idx" ON "system_status"("timestamp");

-- CreateIndex
CREATE INDEX "usage_records_userId_idx" ON "usage_records"("userId");

-- CreateIndex
CREATE INDEX "usage_records_vmId_idx" ON "usage_records"("vmId");

-- CreateIndex
CREATE INDEX "usage_records_userId_timestamp_idx" ON "usage_records"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "usage_records_timestamp_idx" ON "usage_records"("timestamp");

-- CreateIndex
CREATE INDEX "virtual_machines_userId_idx" ON "virtual_machines"("userId");

-- CreateIndex
CREATE INDEX "virtual_machines_userId_status_idx" ON "virtual_machines"("userId", "status");

-- CreateIndex
CREATE INDEX "virtual_machines_status_idx" ON "virtual_machines"("status");

-- CreateIndex
CREATE INDEX "virtual_machines_dockerContainerId_idx" ON "virtual_machines"("dockerContainerId");
