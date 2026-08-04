import { QueueClient } from "@/components/queue/queue-client";

export const dynamic = "force-dynamic";

export default function QueuePage() {
  return <QueueClient />;
}
