/**
 * Printable invoice preview — the "paper" view used on the dashboard and the
 * invoice detail page: status, number and dates, seller and buyer blocks,
 * amount summary, line items and totals.
 */

import type { ReactNode } from "react";
import type { Client, Invoice, User } from "@/api/types";
import { displayDate, money, percent, titleCase } from "@/lib/format";
import { BuildingIcon } from "./icons";

interface Props {
  invoice: Invoice;
  client?: Client | null;
  seller?: User | null;
  /** Buttons rendered top-right (Export, Print, Open…). */
  actions?: ReactNode;
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p && p.trim()).join(", ");
}

export function InvoicePreview({ invoice: inv, client, seller, actions }: Props) {
  const intra = inv.cgst_amount > 0 || inv.sgst_amount > 0;
  const paid = inv.status === "paid";
  const amountPaid = paid ? inv.total : 0;
  const balance = paid ? 0 : inv.status === "cancelled" ? 0 : inv.total;
  const sellerName = seller?.legal_name ?? seller?.trade_name ?? seller?.full_name ?? "Seller";

  return (
    <article className={`paper status-frame-${inv.status}`} aria-label={`Invoice ${inv.invoice_number}`}>
      <div className="paper-top">
        <span className={`paper-status status-text-${inv.status}`}>Status : {titleCase(inv.status)}</span>
        {actions && <div className="actions no-print">{actions}</div>}
      </div>

      <div className="paper-head">
        <div>
          <h2 className="paper-title">Invoice : <span>{inv.invoice_number}</span></h2>
          <dl className="paper-meta">
            <div><dt>Document</dt><dd>{inv.document_type} · {inv.supply_type}{inv.reverse_charge ? " · reverse charge" : ""}</dd></div>
            <div><dt>Issue date</dt><dd>{displayDate(inv.issue_date)}</dd></div>
            {inv.preceding_invoice_number && <div><dt>Against</dt><dd>{inv.preceding_invoice_number} ({displayDate(inv.preceding_invoice_date)})</dd></div>}
            {inv.source_reference && <div><dt>Source ref.</dt><dd>{inv.source_reference}</dd></div>}
          </dl>
        </div>
        <div className="paper-seller">
          <div className="paper-seller-name"><span className="logo-mark"><BuildingIcon size={18} /></span><strong>{sellerName}</strong></div>
          <div className="muted small">
            {seller?.address1 && <div>{seller.address1}</div>}
            {seller?.address2 && <div>{seller.address2}</div>}
            {(seller?.location || seller?.pincode) && <div>{joinParts([seller?.location, seller?.pincode])}</div>}
            {seller?.gstin ? <div>GSTIN <code>{seller.gstin}</code></div> : <div className="pill warn">Seller GSTIN not set</div>}
          </div>
        </div>
      </div>

      <hr className="paper-rule" />

      <div className="paper-summary">
        <div>
          <span className="label">Client</span>
          <strong>{client?.legal_name ?? client?.name ?? `Client #${inv.client_id}`}</strong>
          {client?.legal_name && client.name !== client.legal_name && <div>{client.name}</div>}
          <div className="muted small">{joinParts([client?.address, client?.city, client?.zip_code, client?.country]) || "—"}</div>
          <div className="muted small">{client?.gstin ? <>GSTIN <code>{client.gstin}</code></> : "Unregistered (URP)"}{inv.place_of_supply ? ` · POS ${inv.place_of_supply}` : ""}</div>
        </div>
        <div>
          <span className="label">Total amount</span>
          <strong>{money(inv.total)}</strong>
          <span className="label" style={{ marginTop: "0.6rem" }}>Amount paid</span>
          <div>{money(amountPaid)}</div>
        </div>
        <div>
          <span className="label">Balance due</span>
          <strong className="paper-balance">{money(balance)}</strong>
          <div className="muted small">Due date : {displayDate(inv.due_date)}</div>
          {inv.irn && <div className="muted small">IRN <code className="qr">{inv.irn.slice(0, 16)}…</code></div>}
        </div>
      </div>

      <div className="table-wrap paper-items">
        <table className="bordered">
          <thead>
            <tr>
              <th>#</th>
              <th>Item & description</th>
              <th className="num">Qty.</th>
              <th className="num">Rate</th>
              <th className="num">GST %</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.line_items.map((li, i) => (
              <tr key={li.id}>
                <td className="muted">{i + 1}</td>
                <td>
                  {li.description}
                  <div className="muted small">{li.hsn_code ? `${li.is_service ? "SAC" : "HSN"} ${li.hsn_code}` : "HSN missing"}{li.unit ? ` · ${li.unit}` : ""}{li.discount ? ` · discount ${money(li.discount)}` : ""}</div>
                </td>
                <td className="num">{li.quantity}</td>
                <td className="num">{money(li.unit_price)}</td>
                <td className="num">{percent(li.gst_rate ?? inv.tax_rate)}</td>
                <td className="num">{money(li.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="totals paper-totals">
        <span className="muted">Sub total</span><span>{money(inv.subtotal)}</span>
        {intra ? (
          <><span className="muted">CGST</span><span>{money(inv.cgst_amount)}</span><span className="muted">SGST</span><span>{money(inv.sgst_amount)}</span></>
        ) : (
          <><span className="muted">IGST</span><span>{money(inv.igst_amount)}</span></>
        )}
        {inv.discount > 0 && <><span className="muted">Discount</span><span>− {money(inv.discount)}</span></>}
        <span className="grand">Total</span><span className="grand">{money(inv.total)}</span>
        <span className="muted">Balance due</span><span><strong>{money(balance)}</strong></span>
      </div>

      {(inv.notes || inv.terms) && (
        <div className="paper-notes">
          {inv.notes && <div><span className="label">Notes</span><p>{inv.notes}</p></div>}
          {inv.terms && <div><span className="label">Terms</span><p>{inv.terms}</p></div>}
        </div>
      )}
    </article>
  );
}
