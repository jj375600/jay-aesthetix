import { requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { todayInStudio } from "@/lib/slots";
import { fmtDate, money } from "@/lib/format";
import { Badge, invoiceDisplayStatus } from "@/components/Badge";
import { InvoiceForm } from "@/components/InvoiceForm";
import { InvoiceActions } from "@/components/InvoiceActions";
import { PayInvoiceButton } from "@/components/PayInvoiceButton";
import { retrieveCheckoutSession, settleCheckoutSession, stripeConfig } from "@/lib/stripe";
import { SITE } from "@/lib/site";

export const metadata = { title: `Invoices · ${SITE.name}` };

type Row = { id: number; number: string; description: string; amount_cents: number; issued_date: string; due_date: string; status: string; paid_date: string | null; client: string };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const { checkout, session_id } = await searchParams;
  const user = await requireUser();
  const isTrainer = user.role === "trainer";
  const today = todayInStudio();
  const payEnabled = !isTrainer && stripeConfig() !== null;

  // Coming back from Stripe: confirm the payment with Stripe directly (works even if the webhook is slow or
  // not set up), but only for an invoice that belongs to this client.
  let paidNotice: string | null = null;
  const cfg = stripeConfig();
  if (!isTrainer && checkout === "success" && session_id && cfg && /^cs_test_[A-Za-z0-9_]{1,200}$/.test(session_id)) {
    try {
      const session = await retrieveCheckoutSession(cfg, session_id);
      const owner = await queryOne<{ client_id: number }>("SELECT client_id FROM invoices WHERE id = $1", [Number(session.metadata?.invoice_id) || 0]);
      if (owner?.client_id === user.id && (await settleCheckoutSession(session)) === "paid") paidNotice = "Payment received. Thank you!";
    } catch {
      /* the webhook will still settle it; the table below shows the true status */
    }
  }

  const rows = await query<Row>(
    `SELECT i.id, i.number, i.description, i.amount_cents, i.issued_date, i.due_date, i.status, i.paid_date, c.name AS client
       FROM invoices i JOIN users c ON c.id = i.client_id
      WHERE ${isTrainer ? "i.trainer_id" : "i.client_id"} = $1 ORDER BY i.issued_date DESC, i.id DESC`,
    [user.id]
  );
  const clients = isTrainer ? await query<{ id: number; name: string }>("SELECT id, name FROM users WHERE role = 'client' ORDER BY name") : [];

  const sum = (f: (r: Row) => boolean) => rows.filter(f).reduce((a, r) => a + r.amount_cents, 0);
  const paid = sum((r) => r.status === "paid");
  const open = sum((r) => r.status === "sent");
  const overdue = sum((r) => invoiceDisplayStatus(r.status, r.due_date, today) === "overdue");

  const due = new Date(`${today}T12:00:00`);
  due.setDate(due.getDate() + 14);
  const defaultDue = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;

  return (
    <>
      <div className="page-head"><div><p className="eyebrow">{isTrainer ? "Billing" : "Your account"}</p><h1>Invoices</h1></div></div>

      {paidNotice && <div className="alert ok" role="status" style={{ marginBottom: 20 }}>{paidNotice}</div>}
      {checkout === "cancelled" && !isTrainer && <div className="alert" role="status" style={{ marginBottom: 20, borderColor: "var(--line)" }}>Payment cancelled. You have not been charged.</div>}

      <div className="kpis">
        <div className="kpi"><div className="label">Paid</div><div className="value">{money(paid)}</div></div>
        <div className="kpi"><div className="label">{isTrainer ? "Outstanding" : "Balance due"}</div><div className="value">{money(open)}</div></div>
        <div className="kpi"><div className="label">Overdue</div><div className="value" style={{ color: overdue ? "var(--bad)" : undefined }}>{money(overdue)}</div></div>
      </div>

      <div className={isTrainer ? "two-col wide-left" : ""}>
        <section className="card">
          <div className="panel-title"><h2>All invoices</h2></div>
          {rows.length === 0 ? <div className="empty">No invoices yet.</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th>{isTrainer && <th>Client</th>}<th>Description</th><th>Due</th><th>Status</th><th className="num">Amount</th>{(isTrainer || payEnabled) && <th />}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.number}</td>
                      {isTrainer && <td>{r.client}</td>}
                      <td>{r.description}</td>
                      <td>{r.status === "paid" && r.paid_date ? `paid ${fmtDate(r.paid_date)}` : fmtDate(r.due_date)}</td>
                      <td><Badge status={invoiceDisplayStatus(r.status, r.due_date, today)} /></td>
                      <td className="num">{money(r.amount_cents)}</td>
                      {isTrainer && <td><InvoiceActions id={r.id} status={r.status} /></td>}
                      {payEnabled && <td>{r.status === "sent" && <PayInvoiceButton id={r.id} />}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {payEnabled && <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>Payments run in Stripe <strong>test mode</strong>: use card <code>4242 4242 4242 4242</code>, any future expiry and any CVC. No real money moves.</p>}
          {!isTrainer && <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>Questions about an invoice? Message {SITE.trainerName} at {SITE.email}.</p>}
        </section>

        {isTrainer && (
          <section className="card" style={{ alignSelf: "start" }}>
            <div className="panel-title"><h2>New invoice</h2></div>
            <InvoiceForm clients={clients} defaultDue={defaultDue} />
          </section>
        )}
      </div>
    </>
  );
}
