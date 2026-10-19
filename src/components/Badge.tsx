export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

/** An unpaid invoice past its due date is shown as "overdue". */
export const invoiceDisplayStatus = (status: string, dueDate: string, today: string) =>
  status === "sent" && dueDate < today ? "overdue" : status;
