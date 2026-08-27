import React, { useState, useEffect } from "react";
import { api, supabase } from "@/api/supabaseClient";
import { Bell, Send, CheckCircle, Clock, AlertCircle, Mail } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import moment from "moment";

export default function LoanReminders() {
  const [loans, setLoans] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState({});
  const [sent, setSent] = useState({});
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [l, s] = await Promise.all([
      api.entities.Loan.filter({ status: "Active" }),
      api.entities.GroupSettings.list(),
    ]);
    setLoans(l);
    setSettings(s[0] || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reminderDays = settings?.reminder_days_before || 3;

  // Categorise loans by urgency
  const today = moment();
  const categorised = loans.map(loan => {
    const dueDate = loan.next_payment_date || loan.due_date;
    if (!dueDate) return { ...loan, urgency: "no_date", daysUntilDue: null };
    const diff = moment(dueDate).diff(today, "days");
    let urgency = "ok";
    if (diff < 0) urgency = "overdue";
    else if (diff <= reminderDays) urgency = "due_soon";
    return { ...loan, urgency, daysUntilDue: diff };
  });

  const overdue = categorised.filter(l => l.urgency === "overdue");
  const dueSoon = categorised.filter(l => l.urgency === "due_soon");
  const noDate = categorised.filter(l => l.urgency === "no_date");

  const sendReminder = async (loan) => {
    if (!loan.email && !loan.member_email) {
      // Fetch member to get email
      const members = await api.entities.Member.filter({ id: loan.member_id });
      const member = members[0];
      if (!member?.email) {
        toast({ title: `No email on file for ${loan.member_name}`, variant: "destructive" });
        return;
      }
      loan = { ...loan, _email: member.email };
    }

    setSending(prev => ({ ...prev, [loan.id]: true }));

    const dueDate = loan.next_payment_date || loan.due_date;
    const dueDateStr = dueDate ? moment(dueDate).format("MMMM D, YYYY") : "soon";
    const isOverdue = loan.urgency === "overdue";

    const subject = isOverdue
      ? `⚠️ Overdue Loan Repayment — ${settings?.group_name || "Table Banking Group"}`
      : `🔔 Loan Repayment Reminder — Due ${dueDateStr}`;

    const amountDue = (loan.monthly_repayment || 0).toLocaleString();
    const balance = (loan.balance || 0).toLocaleString();

    const body = `
Dear ${loan.member_name},

${isOverdue
  ? `⚠️ OVERDUE: Your loan repayment of KES ${amountDue} was due on ${dueDateStr} and is now overdue by ${Math.abs(loan.daysUntilDue)} day(s).`
  : `🔔 REMINDER: Your loan repayment of KES ${amountDue} is due on ${dueDateStr} (${loan.daysUntilDue} day(s) remaining).`
}

━━━━━━━━━━━━━━━━━━━━━━━━
PAYMENT DUE DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━
• Amount Due This Month: KES ${amountDue}
• Payment Deadline: ${dueDateStr}
• Outstanding Balance: KES ${balance}

━━━━━━━━━━━━━━━━━━━━━━━━
LOAN SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━
• Original Loan: KES ${(loan.amount || 0).toLocaleString()}
• Total Repayable: KES ${(loan.total_amount || 0).toLocaleString()}
• Amount Repaid So Far: KES ${(loan.amount_repaid || 0).toLocaleString()}
• Remaining Balance: KES ${balance}

━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO PAY
━━━━━━━━━━━━━━━━━━━━━━━━
You can make your repayment via:

1. M-Pesa — Send KES ${amountDue} and keep your transaction code as proof.
2. Bank Transfer — Use the group's bank details provided by your administrator.
3. Cash — Pay directly to the Treasurer and obtain a receipt.

After payment, log in to the Member Portal to record your repayment and submit your transaction reference or bank details as evidence.

${isOverdue
  ? `⛔ IMPORTANT: This loan is overdue. If it remains unpaid for more than 3 months you will be ineligible to borrow for the rest of the year. Please settle it immediately to avoid further penalties.`
  : `Please make your payment on or before ${dueDateStr} to maintain your good standing in the group.`
}

Best regards,
${settings?.group_name || "Table Banking Group"} Administration
    `.trim();

    try {
      // Get member email
      const allMembers = await api.entities.Member.list();
      const member = allMembers.find(m => m.id === loan.member_id);
      const emailTo = member?.email || loan._email;

      if (!emailTo) {
        toast({ title: `No email on file for ${loan.member_name}`, variant: "destructive" });
        setSending(prev => ({ ...prev, [loan.id]: false }));
        return;
      }

      await api.integrations.Core.SendEmail({
        to: emailTo,
        subject,
        body,
        from_name: settings?.group_name || "Table Banking Group",
      });

      // Mark reminder sent on loan
      await api.entities.Loan.update(loan.id, { reminder_sent: true });

      setSent(prev => ({ ...prev, [loan.id]: true }));
      toast({ title: `Reminder sent to ${loan.member_name}` });
    } catch (e) {
      toast({ title: "Failed to send email", description: e.message, variant: "destructive" });
    }

    setSending(prev => ({ ...prev, [loan.id]: false }));
  };

  const sendAllDueSoon = async () => {
    for (const loan of [...overdue, ...dueSoon]) {
      if (!sent[loan.id]) await sendReminder(loan);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
      </div>
    );
  }

  const LoanReminderCard = ({ loan, badgeClass, badgeLabel, icon: CardIcon, iconClass }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-fuchsia-100/60 rounded-xl bg-white hover:bg-fuchsia-50/30 transition-colors shadow-2xs">
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${iconClass}`}>
          <CardIcon size={16} />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-gray-900">{loan.member_name}</p>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeClass}`}>{badgeLabel}</span>
            {loan.reminder_sent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                <CheckCircle size={10} /> Reminded
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Balance: <span className="font-semibold text-gray-900">KES {(loan.balance || 0).toLocaleString()}</span>
            {" · "}Monthly: <span className="font-semibold text-gray-900">KES {(loan.monthly_repayment || 0).toLocaleString()}</span>
          </p>
          {(loan.next_payment_date || loan.due_date) && (
            <p className="text-xs text-gray-500 mt-0.5">
              {loan.urgency === "overdue"
                ? `Overdue by ${Math.abs(loan.daysUntilDue)} day${Math.abs(loan.daysUntilDue) !== 1 ? "s" : ""}`
                : `Due in ${loan.daysUntilDue} day${loan.daysUntilDue !== 1 ? "s" : ""}`
              } · {moment(loan.next_payment_date || loan.due_date).format("MMM D, YYYY")}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-11 sm:ml-0">
        {sent[loan.id] ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-fuchsia-700 font-bold bg-fuchsia-50 px-3 py-1 rounded-full border border-fuchsia-200">
            <CheckCircle size={14} className="text-fuchsia-600" /> Sent
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8.5 text-xs border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 font-semibold shadow-2xs"
            onClick={() => sendReminder(loan)}
            disabled={sending[loan.id]}
          >
            {sending[loan.id] ? (
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 border-2 border-fuchsia-300 border-t-fuchsia-600 rounded-full animate-spin" />
                Sending...
              </span>
            ) : (
              <span className="flex items-center gap-1.5"><Mail size={13} /> Send Reminder</span>
            )}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto min-h-full">
      <PageHeader
        title="Loan Repayment Reminders"
        subtitle={`Email members whose payments are due within ${reminderDays} days`}
        action={
          (overdue.length + dueSoon.length) > 0 && (
            <Button onClick={sendAllDueSoon} className="bg-fuchsia-600 hover:bg-fuchsia-700 font-semibold shadow-xs">
              <Send size={14} className="mr-1.5" />
              Send All Reminders ({overdue.length + dueSoon.length})
            </Button>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-fuchsia-100/80 to-fuchsia-50 border border-fuchsia-200 rounded-2xl p-4 flex items-center gap-3.5 shadow-2xs">
          <div className="p-2.5 bg-fuchsia-600 text-white rounded-xl flex-shrink-0 shadow-2xs"><AlertCircle size={20} /></div>
          <div>
            <p className="text-xs text-fuchsia-950 font-bold uppercase tracking-wider">Overdue</p>
            <p className="text-2xl font-black text-fuchsia-900">{overdue.length}</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-fuchsia-50 to-purple-50/60 border border-fuchsia-200/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-2xs">
          <div className="p-2.5 bg-fuchsia-500 text-white rounded-xl flex-shrink-0 shadow-2xs"><Clock size={20} /></div>
          <div>
            <p className="text-xs text-fuchsia-900 font-bold uppercase tracking-wider">Due Soon (≤{reminderDays} days)</p>
            <p className="text-2xl font-black text-fuchsia-900">{dueSoon.length}</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 via-fuchsia-50/30 to-purple-50 border border-purple-200/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-2xs">
          <div className="p-2.5 bg-purple-600 text-white rounded-xl flex-shrink-0 shadow-2xs"><Bell size={20} /></div>
          <div>
            <p className="text-xs text-purple-900 font-bold uppercase tracking-wider">No Date Set</p>
            <p className="text-2xl font-black text-purple-900">{noDate.length}</p>
          </div>
        </div>
      </div>

      {loans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-fuchsia-100 p-12 text-center shadow-2xs">
          <div className="w-14 h-14 bg-fuchsia-50 border border-fuchsia-100 rounded-full flex items-center justify-center mx-auto text-fuchsia-500 mb-3">
            <Bell size={28} />
          </div>
          <p className="text-gray-900 font-bold text-base">No active loans</p>
          <p className="text-xs text-gray-500 mt-1">Reminders will appear here once active loans exist in the system.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {overdue.length > 0 && (
            <div className="bg-white rounded-2xl border border-fuchsia-100 p-5 shadow-2xs">
              <h3 className="text-sm font-bold text-fuchsia-950 mb-3.5 flex items-center gap-2">
                <AlertCircle size={16} className="text-fuchsia-600" /> Overdue Payments ({overdue.length})
              </h3>
              <div className="space-y-2.5">
                {overdue.map(l => (
                  <LoanReminderCard
                    key={l.id} loan={l}
                    badgeClass="bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300"
                    badgeLabel="Overdue"
                    icon={AlertCircle}
                    iconClass="bg-fuchsia-100 text-fuchsia-700"
                  />
                ))}
              </div>
            </div>
          )}

          {dueSoon.length > 0 && (
            <div className="bg-white rounded-2xl border border-fuchsia-100 p-5 shadow-2xs">
              <h3 className="text-sm font-bold text-fuchsia-900 mb-3.5 flex items-center gap-2">
                <Clock size={16} className="text-fuchsia-600" /> Due Within {reminderDays} Days ({dueSoon.length})
              </h3>
              <div className="space-y-2.5">
                {dueSoon.map(l => (
                  <LoanReminderCard
                    key={l.id} loan={l}
                    badgeClass="bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200"
                    badgeLabel={`Due in ${l.daysUntilDue}d`}
                    icon={Clock}
                    iconClass="bg-fuchsia-50 text-fuchsia-600"
                  />
                ))}
              </div>
            </div>
          )}

          {noDate.length > 0 && (
            <div className="bg-white rounded-2xl border border-fuchsia-100 p-5 shadow-2xs">
              <h3 className="text-sm font-bold text-gray-800 mb-3.5 flex items-center gap-2">
                <Bell size={16} className="text-fuchsia-500" /> No Due Date Set ({noDate.length})
              </h3>
              <div className="space-y-2.5">
                {noDate.map(l => (
                  <LoanReminderCard
                    key={l.id} loan={l}
                    badgeClass="bg-gray-100 text-gray-700 border-gray-200"
                    badgeLabel="No date"
                    icon={Bell}
                    iconClass="bg-gray-100 text-gray-500"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 bg-fuchsia-50/80 border border-fuchsia-200/80 rounded-2xl p-4 text-xs text-fuchsia-900 flex items-start gap-3 shadow-2xs">
        <Mail size={16} className="flex-shrink-0 text-fuchsia-600 mt-0.5" />
        <p className="leading-relaxed">
          Emails are sent via the platform to each member's registered email address.
          Make sure each member's email is set in their profile. 
          The reminder window is currently set to <strong>{reminderDays} days</strong> before the due date — adjust this anytime in <strong>Settings</strong>.
        </p>
      </div>
    </div>
  );
}