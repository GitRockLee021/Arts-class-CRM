import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { inr, today } from '../format.js';
import { Modal, Spinner, EmptyState, Field, useForm } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const AV_COLORS = [
  ['#ede6f5', '#60438c'],
  ['#e4f2ec', '#2f8f6b'],
  ['#f6efdd', '#b0893f'],
  ['#fbeaef', '#b04a6f'],
];
const METHODS = ['cash', 'upi', 'card', 'bank transfer', 'razorpay', 'other'];
const STATUS_META = {
  read: ['dstat-read', 'Read', 'checks'],
  delivered: ['dstat-delivered', 'Delivered', 'checks'],
  sent: ['dstat-sent', 'Sent', 'check'],
  failed: ['dstat-failed', 'Failed', 'alert'],
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function initials(name) {
  return String(name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function avatarColors(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 997;
  return AV_COLORS[h % AV_COLORS.length];
}

function parseTs(s) {
  if (!s) return null;
  const d = new Date(`${String(s).replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function timeLabel(s) {
  const d = parseTs(s);
  return d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
}

function dateLabel(s) {
  const d = parseTs(s);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function phoneLabel(p) {
  return p ? `+91 ${p}` : '—';
}

function statusKind(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'error' || s === 'failed') return 'failed';
  if (s === 'read') return 'read';
  if (s === 'delivered') return 'delivered';
  return 'sent';
}

function StatusChip({ status }) {
  const [cls, label, icon] = STATUS_META[statusKind(status)];
  return (
    <span className={`dstat ${cls}`}>
      <Icon name={icon} size={12} />
      {label}
    </span>
  );
}

function StudentCell({ name }) {
  const [bg, fg] = avatarColors(name);
  return (
    <div className="stu-cell">
      <span className="avatar" style={{ background: bg, color: fg }}>
        {initials(name)}
      </span>
      <span className="stu-name">{name}</span>
    </div>
  );
}

function CollectModal({ row, reload, onClose }) {
  const toast = useToast();
  const resend = row.link_sent;
  const { form, set } = useForm({
    amount: row.amount_due,
    payment_date: today(),
    method: resend ? 'razorpay' : 'cash',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const rzp = form.method === 'razorpay';

  async function submit(e) {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setBusy(true);
    try {
      if (rzp) {
        const res = await api.post('/reminders/send', { enrollmentIds: [row.id] });
        const r = res.results?.[0];
        if (r && r.status === 'error') throw new Error(r.message || 'Could not send the payment link.');
        setSent(
          `Razorpay link for ${inr(amount)} sent to ${phoneLabel(row.notify_phone)} (${row.student_name}'s parent) on WhatsApp. The row updates automatically once they pay.`,
        );
        reload();
      } else {
        await api.post(`/enrollments/${row.id}/payments`, { ...form, amount });
        toast('Payment recorded.');
        reload();
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${resend ? 'Resend payment link' : 'Collect payment'} — ${row.student_name}`}
      onClose={onClose}
    >
      {sent ? (
        <div className="sent-panel">
          <div className="sent-ico">
            <Icon name="check" size={27} />
          </div>
          <h3>Payment link sent</h3>
          <p className="muted">{sent}</p>
          <div className="row end" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="form-grid" onSubmit={submit}>
          {error && <p className="form-error">{error}</p>}
          <p className="muted span-2" style={{ margin: 0 }}>
            Due {inr(row.amount_due)}
            {resend ? ` · previously sent to ${phoneLabel(row.notify_phone)}` : ' · receipt goes to the parent on confirm'}
          </p>
          <Field label="Amount (₹) *">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="1"
              value={form.amount}
              onChange={set('amount')}
              autoFocus
            />
          </Field>
          {!rzp && (
            <Field label="Payment date *">
              <input className="input" type="date" value={form.payment_date} onChange={set('payment_date')} />
            </Field>
          )}
          <Field label="Method" className={rzp ? 'span-2' : ''}>
            <select className="input" value={form.method} onChange={set('method')}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m === 'upi' ? 'UPI' : m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          {rzp && (
            <p className="link-note span-2">
              <Icon name="link" size={15} />
              <span>
                Razorpay payment link goes to {phoneLabel(row.notify_phone)} on WhatsApp. The payment is recorded and
                the receipt sent automatically once they pay — no manual entry.
              </span>
            </p>
          )}
          <Field label="Notes (optional)" className="span-2">
            <input className="input" value={form.notes} onChange={set('notes')} placeholder="optional" />
          </Field>
          <div className="row end span-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending…' : rzp ? 'Send payment link' : 'Record payment'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function RemindModal({ rows, mode, initialSelected, reload, onClose }) {
  const toast = useToast();
  const locked = mode === 'one';
  const [selected, setSelected] = useState(new Set(initialSelected));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const shown = locked ? rows.filter((r) => selected.has(r.id)) : rows;
  const first = rows.find((r) => selected.has(r.id));

  function toggle(id) {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!selected.size) return;
    setBusy(true);
    try {
      const res = await api.post('/reminders/send', { enrollmentIds: [...selected] });
      setDone(res.results || []);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Modal title="Reminders sent" onClose={onClose}>
        <div className="sent-panel">
          <div className="sent-ico">
            <Icon name="check" size={27} />
          </div>
          <p className="muted">
            {done.length === 1
              ? `Reminder sent to ${done[0].student_name}'s parent on WhatsApp.`
              : `Reminders sent to ${done.length} parents on WhatsApp.`}
          </p>
          <div className="deliv-list">
            {done.map((r) => (
              <div className="deliv-row" key={r.enrollment_id}>
                <span>
                  <span className="deliv-name">{r.student_name}</span>
                  <span className="deliv-time">{phoneLabel(r.notify_phone || r.student_phone)}</span>
                </span>
                <StatusChip status={r.status} />
              </div>
            ))}
          </div>
          <p className="tpl-note">Delivery status updates arrive from WhatsApp webhooks (needs hosting).</p>
          <div className="row end" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={locked ? `Remind — ${first?.student_name || ''}` : 'Send fee reminders'} onClose={onClose}>
      <p className="muted" style={{ margin: '0 0 10px' }}>
        {locked
          ? `Sending to ${first?.student_name}'s parent (${phoneLabel(first?.notify_phone)})`
          : `Pick who gets a reminder · ${selected.size} of ${rows.length} selected`}
      </p>
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
        <div className="pick-grid">
          {shown.map((r) => {
            const on = selected.has(r.id);
            const [bg, fg] = avatarColors(r.student_name);
            return (
              <div
                key={r.id}
                className={`pick-card${on ? ' selected' : ''}${locked ? ' ro' : ''}`}
                onClick={() => toggle(r.id)}
              >
                <span className="avatar" style={{ background: bg, color: fg }}>
                  {initials(r.student_name)}
                </span>
                <span className="who">
                  <strong>{r.student_name}</strong>
                  <small>
                    {inr(r.amount_due)} due · {phoneLabel(r.notify_phone)}
                  </small>
                </span>
                <span className="tick">{on ? '✓' : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="row end">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || !selected.size} onClick={send}>
          {busy ? 'Sending…' : `Send to ${selected.size} student${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  );
}

function LogModal({ row, onClose }) {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    api
      .get(`/reminders/logs?enrollment_id=${row.id}`)
      .then(setLogs)
      .catch(() => setLogs([]));
  }, [row.id]);

  return (
    <Modal title={`Reminder log — ${row.student_name}`} onClose={onClose}>
      <p className="muted" style={{ margin: '0 0 4px' }}>
        {phoneLabel(row.notify_phone)} · {logs ? logs.length : 0} reminder{logs && logs.length === 1 ? '' : 's'} sent
      </p>
      {!logs ? (
        <Spinner />
      ) : (
        <div className="deliv-list">
          {logs.length === 0 ? (
            <div className="deliv-row">
              <span className="muted">No reminders sent yet.</span>
            </div>
          ) : (
            logs.map((l) => (
              <div className="deliv-row" key={l.id}>
                <span>
                  <span className="deliv-name">{dateLabel(l.sent_at)} · {timeLabel(l.sent_at)}</span>
                  <span className="deliv-time">Fee reminder · {inr(l.amount_due)}</span>
                </span>
                <StatusChip status={l.status} />
              </div>
            ))
          )}
        </div>
      )}
      <p className="tpl-note" style={{ textAlign: 'center' }}>
        Status arrives from WhatsApp webhooks (needs hosting).
      </p>
      <div className="row end" style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function HistoryModal({ month, onClose }) {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    api
      .get(`/reminders/logs?month=${month}`)
      .then(setLogs)
      .catch(() => setLogs([]));
  }, [month]);

  const groups = (() => {
    if (!logs) return [];
    const map = new Map();
    for (const l of logs) {
      const key = dateLabel(l.sent_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(l);
    }
    return [...map.entries()];
  })();

  return (
    <Modal title="Reminder history" onClose={onClose}>
      <p className="muted" style={{ margin: '0 0 4px' }}>
        Reminders sent in {monthLabel(month)} · newest first
      </p>
      {!logs ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <div className="deliv-list">
          <div className="deliv-row">
            <span className="muted">No reminders sent this month yet.</span>
          </div>
        </div>
      ) : (
        <div className="hist-scroll">
          {groups.map(([date, entries]) => (
            <div className="hist-group" key={date}>
              <div className="hist-date">{date}</div>
              <div className="deliv-list">
                {entries.map((l) => (
                  <div className="deliv-row" key={l.id}>
                    <span>
                      <span className="deliv-name">{l.student_name}</span>
                      <span className="deliv-time">
                        {timeLabel(l.sent_at)} · Fee reminder · {inr(l.amount_due)}
                      </span>
                    </span>
                    <StatusChip status={l.status} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="tpl-note" style={{ textAlign: 'center' }}>
        Status arrives from WhatsApp webhooks (needs hosting).
      </p>
      <div className="row end" style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export default function Dues() {
  const [data, setData] = useState(null);
  const [collect, setCollect] = useState(null);
  const [remind, setRemind] = useState(null);
  const [log, setLog] = useState(null);
  const [history, setHistory] = useState(false);

  function load() {
    Promise.all([api.get('/reminders/dues'), api.get(`/payments/summary?month=${currentMonth()}`)])
      .then(([rows, collection]) => setData({ rows, collection }))
      .catch(() =>
        setData({
          rows: [],
          collection: { expected: 0, paid: 0, outstanding: 0, count: 0, total: 0, paidCount: 0, pct: 0 },
        }),
      );
  }
  useEffect(load, []);

  const rows = data?.rows || [];
  const collection = data?.collection || { expected: 0, paid: 0, pct: 0, total: 0, paidCount: 0 };
  const totalDue = rows.reduce((s, r) => s + r.amount_due, 0);
  const oldest = rows.reduce((m, r) => Math.max(m, r.days_late), 0);
  const month = currentMonth();
  const asOf = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const pct = Math.max(0, Math.min(100, collection.pct || 0));
  const overduePct = 100 - pct;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dues</h1>
          <span className="asof">As of {asOf} · month in progress</span>
        </div>
        <div className="head-actions">
          <a className="btn btn-ghost" href="/billing">
            <Icon name="card" size={15} /> Billing
          </a>
          <button className="btn btn-ghost" onClick={() => setHistory(true)}>
            <Icon name="history" size={15} /> Reminder history
          </button>
          <button
            className="btn btn-primary"
            disabled={!rows.length}
            onClick={() => setRemind({ mode: 'all', selected: rows.map((r) => r.id) })}
          >
            <Icon name="send" size={15} /> Remind all
          </button>
        </div>
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="stats tiles">
            <div className="tile tile-ok">
              <div className="deco" />
              <div className="top">
                <span className="label">Collection · {monthLabel(month)}</span>
                <span className="pill">{pct}%</span>
              </div>
              <div className="measure">
                <div className="amount">
                  <span className="cur">₹</span>
                  {inr(collection.paid).slice(1)}
                </div>
                <div className="mini-bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="cap">
                <span>{inr(collection.expected)} expected</span>
                <span>
                  {collection.paidCount} / {collection.total} paid
                </span>
              </div>
            </div>
<div className="tile tile-bad">
                <div className="deco" />
                <div className="top">
                  <span className="label">Overdue</span>
                  <span className="pill">{overduePct}%</span>
                </div>
                <div className="measure">
                  <div className="amount">
                    <span className="cur">₹</span>
                    {inr(totalDue).slice(1)}
                  </div>
                </div>
                <div className="cap">
                  <span>
                    {rows.length} of {collection.total} students
                  </span>
                  <span>
                    {rows.length ? `oldest ${oldest}d late` : 'all clear'}
                  </span>
                </div>
              </div>
          </div>

          <div className="section-head">
            <h2>Overdue students</h2>
            <span className="count-badge">
              {rows.length} student{rows.length === 1 ? '' : 's'}
            </span>
          </div>

          {rows.length === 0 ? (
            <EmptyState>
              No overdue fees. All payments are up to date.
              <button className="btn btn-ghost" onClick={load}>
                Refresh
              </button>
            </EmptyState>
          ) : (
            <div className="card">
              <div className="tablewrap">
                <table className="stack-cards">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Course / batch</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Due amount</th>
                      <th className="actions-cell">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Student">
                          <StudentCell name={r.student_name} />
                        </td>
                        <td data-label="Course / batch">
                          <div>
                            <span className="course-name">{r.course_name || '—'}</span>
                            {r.batch_name && <small className="course-batch block">{r.batch_name}</small>}
                          </div>
                        </td>
                        <td data-label="Status">
                          <div>
                            <span className="due-chip due-chip-overdue">
                              <Icon name="alert" size={11} />
                              Overdue
                            </span>
                            <small className="late-note">
                              {r.days_late} day{r.days_late === 1 ? '' : 's'} late
                              {r.months_overdue > 1 ? ` · ${r.months_overdue} months` : ''}
                            </small>
                          </div>
                        </td>
                        <td data-label="Due amount" className="amt bad">
                          {inr(r.amount_due)}
                        </td>
                        <td data-label="Actions" className="actions-cell">
                          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            {r.link_sent ? (
                              <button className="btn btn-sm btn-ghost" onClick={() => setCollect(r)}>
                                Resend link
                              </button>
                            ) : (
                              <>
                                <button className="btn btn-sm btn-dark" onClick={() => setCollect(r)}>
                                  Collect
                                </button>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => setRemind({ mode: 'one', selected: [r.id] })}
                                >
                                  Remind
                                </button>
                              </>
                            )}
                            <button
                              className="btn btn-sm btn-ghost btn-icon"
                              title="Reminder log"
                              onClick={() => setLog(r)}
                            >
                              <Icon name="history" size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="tfoot">
                      <td colSpan={3}>Total outstanding</td>
                      <td className="amt bad" style={{ textAlign: 'right' }}>
                        {inr(totalDue)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <p className="hint">
            <Icon name="alert" size={15} />
            <span>
              Overdue = unpaid after the 7th (due on the 5th + 3-day grace) · Collect with Cash/UPI/Card records the
              payment immediately · Collect with <strong>Razorpay</strong> sends the parent a payment link and the row
              updates by itself once they pay.
            </span>
          </p>
        </>
      )}

      {collect && <CollectModal row={collect} reload={load} onClose={() => setCollect(null)} />}
      {remind && (
        <RemindModal
          rows={rows}
          mode={remind.mode}
          initialSelected={remind.selected}
          reload={load}
          onClose={() => setRemind(null)}
        />
      )}
      {log && <LogModal row={log} onClose={() => setLog(null)} />}
      {history && <HistoryModal month={month} onClose={() => setHistory(false)} />}
    </>
  );
}
