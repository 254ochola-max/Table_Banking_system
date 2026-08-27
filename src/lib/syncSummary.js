import { api } from "@/api/supabaseClient";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SYNC_REF = "SUMMARY_SYNC";

/**
 * Adds a contribution amount to the Group Summary Table's "Table Banking"
 * row for a specific member, so contributions recorded from the Contributions
 * page (or anywhere else) flow into the dashboard totals.
 */
export async function addContributionToSummary(memberId, amount) {
  const numAmount = parseFloat(amount);
  if (!memberId || isNaN(numAmount) || numAmount <= 0) return;
  const rows = await api.entities.GroupSummaryTable.list("row_order", 50);
  const tbRow = rows.find(r => r.row_label === "Table Banking");
  if (!tbRow) return;
  const values = tbRow.values || {};
  const current = typeof values[memberId] === "number" ? values[memberId] : (parseFloat(values[memberId]) || 0);
  await api.entities.GroupSummaryTable.update(tbRow.id, {
    values: { ...values, [memberId]: current + numAmount },
  });
}

/**
 * Subtracts a contribution amount from the Group Summary Table's "Table Banking"
 * row for a specific member (used when deleting a verified contribution).
 */
export async function subtractContributionFromSummary(memberId, amount) {
  const numAmount = parseFloat(amount);
  if (!memberId || isNaN(numAmount) || numAmount <= 0) return;
  const rows = await api.entities.GroupSummaryTable.list("row_order", 50);
  const tbRow = rows.find(r => r.row_label === "Table Banking");
  if (!tbRow) return;
  const values = tbRow.values || {};
  const current = typeof values[memberId] === "number" ? values[memberId] : (parseFloat(values[memberId]) || 0);
  await api.entities.GroupSummaryTable.update(tbRow.id, {
    values: { ...values, [memberId]: Math.max(0, current - numAmount) },
  });
}

/**
 * Adds a loan repayment amount to the Group Summary Table's "Repayment"
 * row for a specific member, so verified repayments flow into dashboard totals.
 */
export async function addRepaymentToSummary(memberId, amount) {
  const numAmount = parseFloat(amount);
  if (!memberId || isNaN(numAmount) || numAmount <= 0) return;
  const rows = await api.entities.GroupSummaryTable.list("row_order", 50);
  const repRow = rows.find(r => r.row_label === "Repayment");
  if (!repRow) return;
  const values = repRow.values || {};
  const current = typeof values[memberId] === "number" ? values[memberId] : (parseFloat(values[memberId]) || 0);
  await api.entities.GroupSummaryTable.update(repRow.id, {
    values: { ...values, [memberId]: current + numAmount },
  });
}

/**
 * Subtracts a loan repayment amount from the Group Summary Table's "Repayment"
 * row for a specific member (used if a repayment is rejected/reverted).
 */
export async function subtractRepaymentFromSummary(memberId, amount) {
  const numAmount = parseFloat(amount);
  if (!memberId || isNaN(numAmount) || numAmount <= 0) return;
  const rows = await api.entities.GroupSummaryTable.list("row_order", 50);
  const repRow = rows.find(r => r.row_label === "Repayment");
  if (!repRow) return;
  const values = repRow.values || {};
  const current = typeof values[memberId] === "number" ? values[memberId] : (parseFloat(values[memberId]) || 0);
  await api.entities.GroupSummaryTable.update(repRow.id, {
    values: { ...values, [memberId]: Math.max(0, current - numAmount) },
  });
}

/**
 * Propagates Group Summary Table values into Contribution and Loan records
 * so that updates made by leaders/admins on the dashboard flow everywhere.
 *
 * - "Table Banking" + "Shares" rows  → Contribution records (current month)
 * - "Loan Amount" + "Interest" rows  → Active Loan records
 *
 * Synced records are tagged with transaction_ref / purpose = "SUMMARY_SYNC"
 * so they can be updated or removed on subsequent syncs without touching
 * manually-entered records.
 *
 * If a manually-entered contribution already exists for a member this month,
 * the sync skips creating a duplicate SUMMARY_SYNC contribution.
 */
export async function syncSummaryToEntities(rows, members, interestRate = 10) {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const currentMonth = MONTHS[now.getMonth()];
  const currentYear = now.getFullYear();

  const getValues = (label) => {
    const row = rows.find(r => r.row_label === label);
    return row?.values || {};
  };
  const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);

  const tbValues = getValues("Table Banking");
  const sharesValues = getValues("Shares");
  const loanValues = getValues("Loan Amount");
  const interestValues = getValues("Interest");

  // --- Contributions sync ---
  const [existingContribs, allMonthContribs] = await Promise.all([
    api.entities.Contribution.filter({ transaction_ref: SYNC_REF, month: currentMonth, year: currentYear }),
    api.entities.Contribution.filter({ month: currentMonth, year: currentYear }),
  ]);

  const contribOps = [];
  for (const m of members) {
    const total = num(tbValues[m.id]) + num(sharesValues[m.id]);
    const existing = existingContribs.find(c => c.member_id === m.id);
    // Sum of manually-entered verified contributions for this member this month
    const manualTotal = allMonthContribs
      .filter(c => c.member_id === m.id && c.status === "Verified" && c.transaction_ref !== SYNC_REF)
      .reduce((s, c) => s + (c.amount || 0), 0);
    // The SUMMARY_SYNC record should hold only the portion not already covered
    // by manual contributions, preventing double-counting.
    const syncAmount = Math.max(0, total - manualTotal);

    if (syncAmount > 0) {
      if (existing) {
        if (existing.amount !== syncAmount) {
          contribOps.push(api.entities.Contribution.update(existing.id, { amount: syncAmount }));
        }
      } else {
        contribOps.push(api.entities.Contribution.create({
          member_id: m.id,
          member_name: m.full_name,
          amount: syncAmount,
          payment_method: "M-Pesa",
          month: currentMonth,
          year: currentYear,
          date_paid: today,
          status: "Verified",
          transaction_ref: SYNC_REF,
          notes: "Synced from Group Summary Table",
        }));
      }
    } else if (existing) {
      contribOps.push(api.entities.Contribution.delete(existing.id));
    }
  }

  // --- Loans sync ---
  const existingLoans = await api.entities.Loan.filter({
    purpose: SYNC_REF,
    status: "Active",
  });

  const loanOps = [];
  for (const m of members) {
    const loanAmount = num(loanValues[m.id]);
    const interest = num(interestValues[m.id]) || Math.round(loanAmount * (interestRate / 100));
    const totalAmount = loanAmount + interest;
    const existing = existingLoans.find(l => l.member_id === m.id);

    if (loanAmount > 0) {
      if (existing) {
        const balance = totalAmount - (existing.amount_repaid || 0);
        if (existing.amount !== loanAmount || existing.total_amount !== totalAmount) {
          loanOps.push(api.entities.Loan.update(existing.id, {
            amount: loanAmount,
            interest_rate: interestRate,
            interest_amount: interest,
            total_amount: totalAmount,
            balance,
          }));
        }
      } else {
        loanOps.push(api.entities.Loan.create({
          member_id: m.id,
          member_name: m.full_name,
          amount: loanAmount,
          interest_rate: interestRate,
          interest_amount: interest,
          total_amount: totalAmount,
          duration_months: 1,
          monthly_repayment: totalAmount,
          amount_repaid: 0,
          balance: totalAmount,
          status: "Active",
          application_date: today,
          approval_date: today,
          purpose: SYNC_REF,
          description: "Synced from Group Summary Table",
        }));
      }
    } else if (existing) {
      loanOps.push(api.entities.Loan.delete(existing.id));
    }
  }

  await Promise.all([...contribOps, ...loanOps]);
  return { contributions: contribOps.length, loans: loanOps.length };
}