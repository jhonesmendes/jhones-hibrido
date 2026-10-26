CREATE INDEX "conversation_queue_conv_status_idx" ON "conversation_queue" USING btree ("conversation_id","status");--> statement-breakpoint
CREATE INDEX "conversation_queue_dept_status_idx" ON "conversation_queue" USING btree ("department_id","status");--> statement-breakpoint
CREATE INDEX "message_conv_created_idx" ON "message" USING btree ("conversation_id","created_at");