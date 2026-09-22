import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { inr, fmtDate } from '../format.js';
import { Spinner, EmptyState } from '../components/ui.jsx';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(m) - 1]} ${y}`;
}

function methodText(method) {
  const s = String(method || 'other');
  if (s === 'upi') return 'UPI';
  if (s === 'bank transfer') return 'Bank Transfer';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const METHOD_COLOR = {
  cash: '#7a5ba8',
  upi: '#2f8f6b',
  card: '#b0893f',
  razorpay: '#34559c',
  other: '#8b8590',
};

const FEE_TYPE_LABEL = {
  tuition: 'Course',
  admission: 'Admission',
  kit: 'Kit',
  other: 'Other',
};
const FEE_TYPE_CLASS = { tuition: 'tuition', admission: 'admission', kit: 'kit', other: 'other' };

export default function Billing() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    Promise.all([api.get(`/payments?month=${month}`), api.get(`/payments/summary?month=${month}`)])
      .then(([pay, sum]) => {
        if (!cancelled) setData({ pay, sum });
      })
      .catch(() => {
        if (!cancelled) setData({ pay: { payments: [], summary: { total: 0, count: 0 } }, sum: { expected: 0, paid: 0, outstanding: 0, count: 0 } });
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const rows = data?.pay?.payments || [];
  const summary = data?.pay?.summary || { total: 0, count: 0 };
  const sum = data?.sum || { expected: 0, paid: 0, outstanding: 0, count: 0 };
  const label = monthLabel(month);

  const payments = useMemo(() => {
    const byGroup = new Map();
    for (const p of rows) {
      if (!p.admission_group) continue;
      const g = byGroup.get(p.admission_group) || { group: p.admission_group, anchor: null, amount: 0 };
      byGroup.set(p.admission_group, g);
      g.amount += Number(p.amount || 0);
      if (!g.anchor || p.fee_type === 'tuition') g.anchor = p;
    }
    const out = [];
    const seen = new Set();
    for (const p of rows) {
      if (p.admission_group) {
        if (seen.has(p.admission_group)) continue;
        seen.add(p.admission_group);
        const g = byGroup.get(p.admission_group);
        out.push({
          ...g.anchor,
          id: g.anchor.id,
          amount: g.amount,
          admission_group: g.group,
          grouped: true,
        });
      } else {
        out.push(p);
      }
    }
    const pad = (n) => String(n).padStart(6, '0');
    return out.sort((a, b) => `${b.payment_date}${pad(b.id)}`.localeCompare(`${a.payment_date}${pad(a.id)}`));
  }, [rows]);

  const mix = useMemo(() => {
    const map = new Map();
    const order = ['cash', 'upi', 'card', 'razorpay'];
    for (const p of payments) {
      if (!map.has(p.method)) map.set(p.method, { amt: 0, n: 0 });
      const g = map.get(p.method);
      g.amt += Number(p.amount || 0);
      g.n += 1;
    }
    return [...map.entries()]
      .sort((a, b) => (order.indexOf(a[0]) - order.indexOf(b[0])) || b[1].amt - a[1].amt)
      .map(([method, g]) => ({ method, ...g }));
  }, [rows]);

  const maxMix = Math.max(...mix.map((m) => m.amt), 1);

  const feeSplit = useMemo(() => {
    let tuition = 0;
    let one = 0;
    for (const p of rows) {
      if ((p.fee_type || 'tuition') === 'tuition') tuition += Number(p.amount || 0);
      else one += Number(p.amount || 0);
    }
    return { tuition, one };
  }, [rows]);
  const maxSplit = Math.max(feeSplit.tuition, feeSplit.one, 1);

  return (
    <>
      <div className="page-head">
        <h1>Billing</h1>
        <label className="field" style={{ margin: 0 }}>
          <span className="field-label">Month</span>
          <input className="input" type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value || currentMonth())} />
        </label>
      </div>

      <div className="stats bisects">
        <div className="tile tile-ok">
          <div className="deco" />
          <span className="label">Collected · {label}</span>
          <div className="amount">
            <span className="cur">₹</span>
            {data ? inr(summary.total).slice(1) : '…'}
          </div>
          <div className="sub">
            {data ? `${payments.length} transaction${payments.length === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <div className="tile tile-bad">
          <div className="deco" />
          <span className="label">Outstanding · {label}</span>
          <div className="amount">
            <span className="cur">₹</span>
            {data ? inr(sum.outstanding).slice(1) : '…'}
          </div>
          <div className="sub">
            {data ? `${sum.count} student${sum.count === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Methods</h2>
          </div>
          <div className="mix-list">
            {!data ? (
              <span className="muted">…</span>
            ) : mix.length === 0 ? (
              <span className="muted">No payments</span>
            ) : (
              mix.map((m) => (
                <div className="mix-row" key={m.method}>
                  <span className={`mchip mchip-${m.method}`}>{methodText(m.method)}</span>
                  <div className="bar">
                    <i style={{ width: `${Math.round((m.amt / maxMix) * 100)}%`, background: METHOD_COLOR[m.method] || METHOD_COLOR.other }} />
                  </div>
                  <span className="amt">
                    {inr(m.amt)}
                    <small>
                      {m.n} payment{m.n === 1 ? '' : 's'}
                    </small>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Fee split</h2>
          </div>
          <div className="mix-list">
            {!data ? (
              <span className="muted">…</span>
            ) : (
              <>
                <div className="mix-row">
                  <span className="mchip mchip-ft-tuition">Course</span>
                  <div className="bar">
                    <i style={{ width: `${Math.round((feeSplit.tuition / maxSplit) * 100)}%`, background: '#7a5ba8' }} />
                  </div>
                  <span className="amt">{inr(feeSplit.tuition)}</span>
                </div>
                <div className="mix-row">
                  <span className="mchip mchip-ft-admission">One-time</span>
                  <div className="bar">
                    <i style={{ width: `${Math.round((feeSplit.one / maxSplit) * 100)}%`, background: '#b0893f' }} />
                  </div>
                  <span className="amt">{inr(feeSplit.one)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <h2>Payments</h2>
      {!data ? (
        <Spinner />
      ) : payments.length === 0 ? (
        <EmptyState>
          No payments recorded for {label}.
        </EmptyState>
      ) : (
        <div className="card">
          <div className="tablewrap">
            <table className="stack-cards">
              <thead>
                <tr>
                  <th>Receipt no</th>
                  <th>Date</th>
                  <th>Student ID</th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Type</th>
                  <th>Method</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Receipt no">
                      <a className="link rno" target="_blank" rel="noopener" href={`/api/payments/${p.id}/receipt`}>
                        {p.receipt_no}
                      </a>
                    </td>
                    <td data-label="Date">{fmtDate(p.payment_date)}</td>
                    <td data-label="Student ID">
                      <a className="sidlink" target="_blank" rel="noopener" href={`/students/${p.student_id}`}>
                        {p.student_ref}
                      </a>
                    </td>
                    <td data-label="Student">
                      <strong>{p.student_name}</strong>
                    </td>
                    <td data-label="Course">{p.course_name || '—'}</td>
                    <td data-label="Type">
                      {p.grouped ? (
                        <span className="mchip mchip-ft-new">New admission</span>
                      ) : (
                        <span className={`mchip mchip-ft-${FEE_TYPE_CLASS[p.fee_type] || 'other'}`}>
                          {FEE_TYPE_LABEL[p.fee_type] || 'Course'}
                        </span>
                      )}
                    </td>
                    <td data-label="Method">
                      <span className={`mchip mchip-${p.method || 'other'}`}>{methodText(p.method)}</span>
                    </td>
                    <td data-label="Amount">
                      <strong>{inr(p.amount)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}