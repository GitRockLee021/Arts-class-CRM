import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Spinner } from '../components/ui.jsx';
import { useToast } from '../components/Toast.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name) {
  return String(name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function fmtDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DAYS[d.getDay()] + ', ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function yearOf(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { year: 'numeric' });
}

function fmtDateFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DAYS[d.getDay()] + ' ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function schedule(b) {
  const parts = [];
  if (b.days) parts.push(b.days);
  if (b.time) parts.push(b.time);
  return parts.join(' · ');
}

function DateCell({ date, isToday }) {
  return (
    <span className="att-date">
      {fmtDay(date)}
      {isToday && (
        <span className="badge badge-brand" style={{ marginLeft: 6 }}>
          today
        </span>
      )}
      <small>{yearOf(date)}</small>
    </span>
  );
}

export default function Attendance() {
  const toast = useToast();
  const [date, setDate] = useState(localToday());
  const [dayData, setDayData] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [fBatch, setFBatch] = useState('all');
  const [pastOpen, setPastOpen] = useState(false);

  const [modal, setModal] = useState(null); // { batchId, date }
  const [roster, setRoster] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [absent, setAbsent] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function loadDay() {
    setDayData(null);
    api
      .get(`/attendance/day?date=${date}`)
      .then(setDayData)
      .catch(() => setDayData({ date, batches: [] }));
  }

  function loadSessions() {
    api
      .get('/attendance/sessions?days=10')
      .then(setSessions)
      .catch(() => setSessions({ sessions: [] }));
  }

  function refresh() {
    loadDay();
    loadSessions();
  }

  useEffect(refresh, [date]);

  const batches = (dayData && dayData.batches) || [];
  const isToday = date === localToday();
  const todayLabel = batches.length === 0 ? 'none' : batches.length + ' batch(es)';

  const batchOpts = useMemo(() => {
    const map = {};
    (sessions?.sessions || []).forEach((s) => {
      if (!map[s.id]) map[s.id] = s;
    });
    return Object.values(map);
  }, [sessions]);

  const unlogged = useMemo(() => {
    const rows = sessions?.sessions || [];
    return rows.filter((s) => !s.logged && (fBatch === 'all' || String(s.id) === fBatch));
  }, [sessions, fBatch]);
  const pendingLabel = unlogged.length === 0 ? 'all logged' : unlogged.length + ' pending';

  const past = useMemo(() => {
    const today = localToday();
    return (sessions?.sessions || []).filter((s) => s.logged && s.date < today).slice().reverse();
  }, [sessions]);

  async function openRoster(batchId, batchDate, logged) {
    setModal({ batchId, date: batchDate });
    setRoster(null);
    setAbsent(new Set());
    setEditMode(!logged);
    setSaved(false);
    try {
      const res = await api.get(`/attendance/batch/${batchId}?date=${batchDate}`);
      setRoster(res);
      setAbsent(new Set(res.absent || []));
    } catch (err) {
      toast(err.message, 'error');
      setModal(null);
    }
  }

  function toggleStudent(id) {
    setAbsent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(e) {
    if (!roster) return;
    setAbsent(e.target.checked ? new Set() : new Set(roster.roster.map((s) => s.student_id)));
  }

  const unchanged = (() => {
    if (!saved || !roster) return false;
    const a = [...(roster.absent || [])].sort((x, y) => x - y);
    const b = [...absent].sort((x, y) => x - y);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  })();

  async function save() {
    if (!modal) return;
    setSaving(true);
    try {
      const res = await api.post('/attendance', {
        batch_id: modal.batchId,
        batch_date: modal.date,
        absent: [...absent],
      });
      toast('Attendance saved.');
      setSaved(true);
      setRoster((prev) => ({ ...prev, absent: res.absent, logged: true }));
      setAbsent(new Set(res.absent));
      setModal(null);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Attendance</h1>
        <div className="datefield">
          <span className="muted">Date</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {!dayData || !sessions ? (
        <Spinner />
      ) : pastOpen ? (
        <>
          <div className="page-head">
            <h1>
              Past attendance <span className="badge badge-brand">{past.length} day(s)</span>
            </h1>
            <span className="link" onClick={() => setPastOpen(false)}>
              ← Back to attendance
            </span>
          </div>
          <div className="card">
            <div className="tablewrap">
              {past.length === 0 ? (
                <div className="empty-state">
                  <b>✓</b>No past attendance recorded yet.
                </div>
              ) : (
                <table className="stack-cards">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Batch</th>
                      <th>Timing</th>
                      <th>Logged</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map((s) => (
                      <tr key={s.id + '-' + s.date}>
                        <td data-label="Date">
                          <DateCell date={s.date} />
                        </td>
                        <td data-label="Batch">
                          <strong>{s.name}</strong>
                        </td>
                        <td data-label="Timing">{s.time || <span className="muted">—</span>}</td>
                        <td data-label="Logged">
                          <span className="badge badge-ok">
                            {s.present}/{s.logged_total} present
                          </span>
                        </td>
                        <td data-label="">
                          <div className="row">
                            <button className="btn btn-sm btn-ghost" onClick={() => openRoster(s.id, s.date, true)}>
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="list-head">
            <h2>
              Today's batches <span className="badge badge-brand">{todayLabel}</span>
            </h2>
            <span className="link" onClick={() => setPastOpen(true)}>
              View past attendance
            </span>
          </div>
          <div className="card">
            <div className="tablewrap">
              <table className="stack-cards">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Batch</th>
                    <th>Timing</th>
                    <th>Course</th>
                    <th>Students</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted" style={{ padding: '16px 12px' }}>
                        No batch is scheduled on this day. Pick another date.
                      </td>
                    </tr>
                  )}
                  {batches.map((b) => {
                    const done = b.logged;
                    return (
                      <tr key={b.id}>
                        <td data-label="Date">
                          <DateCell date={date} isToday={isToday} />
                        </td>
                        <td data-label="Batch">
                          <strong>{b.name}</strong>
                        </td>
                        <td data-label="Timing">{b.time || <span className="muted">—</span>}</td>
                        <td data-label="Course">{b.course_name || <span className="muted">No course</span>}</td>
                        <td data-label="Students">{b.students}</td>
                        <td data-label="Action" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {done && (
                            <span className="badge badge-ok" style={{ marginRight: 8 }}>
                              ✓ {b.present}/{b.logged_total}
                            </span>
                          )}
                          <button
                            className={`btn btn-sm ${done ? 'btn-ghost' : 'btn-primary'}`}
                            onClick={() => openRoster(b.id, date, done)}
                          >
                            {done ? 'View' : 'Log attendance'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="list-head">
            <h2>
              Unlogged days <span className="badge badge-warn">{pendingLabel}</span>
            </h2>
            <div className="list-filters">
              <label className="field">
                <span className="field-label">Batch</span>
                <select className="input" value={fBatch} onChange={(e) => setFBatch(e.target.value)}>
                  <option value="all">All batches</option>
                  {batchOpts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.days ? ' — ' + b.days : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="card">
            <div className="tablewrap">
              <table className="stack-cards">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Batch</th>
                    <th>Timing</th>
                    <th>Course</th>
                    <th>Students</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {unlogged.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">
                          <b>✓</b>Nothing pending — all recent class days are logged.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    unlogged.map((s) => (
                      <tr key={s.id + '-' + s.date}>
                        <td data-label="Date">
                          <DateCell date={s.date} />
                        </td>
                        <td data-label="Batch">
                          <strong>{s.name}</strong>
                        </td>
                        <td data-label="Timing">{s.time || <span className="muted">—</span>}</td>
                        <td data-label="Course">{s.course_name || <span className="muted">No course</span>}</td>
                        <td data-label="Students">{s.students}</td>
                        <td data-label="Action" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm btn-primary" onClick={() => openRoster(s.id, s.date, false)}>
                            Log attendance
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="att-note">
            <b>How it works:</b>
            <ul>
              <li>
                Top table lists <b>only the day's batches</b> — change the date to see another day.{' '}
                <b>Log attendance</b> opens the roster modal.
              </li>
              <li>
                Below is a <b>flat list of past class days with no attendance record yet</b>, oldest first (most
                overdue on top). Use the <b>batch filter</b> to narrow it down.
              </li>
              <li>
                In the modal all students start <b>marked present</b>; tap to mark absent. Save moves the row out of
                the list.
              </li>
              <li>
                Use <b>View past attendance</b> to see earlier recorded days — each opens <b>read-only</b>; hit{' '}
                <b>Edit record</b> to correct it.
              </li>
            </ul>
          </div>
        </>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal card att-modal" onClick={(e) => e.stopPropagation()}>
            {!roster ? (
              <Spinner />
            ) : (
              <>
                <div className="modal-head">
                  <div>
                    <h2 style={{ margin: '0 0 2px' }}>{roster.batch.name}</h2>
                    <span className="muted">
                      {roster.batch.course_name || 'No course'} · {roster.roster.length} students
                    </span>
                  </div>
                  <button className="icon-btn" type="button" onClick={() => setModal(null)} aria-label="Close">
                    ×
                  </button>
                </div>

                <div className="att-modal-sub">
                  <span className="badge badge-brand">{fmtDateFull(roster.date)}</span>
                  {editMode && (
                    <label className="check">
                      <input type="checkbox" checked={absent.size === 0} onChange={toggleAll} />
                      Mark all present
                    </label>
                  )}
                </div>

                <div className="roster-scroll">
                  <div className="roster-grid">
                    {roster.roster.map((s) => (
                      <div
                        key={s.student_id}
                        className={`student-card ${absent.has(s.student_id) ? 'absent' : 'present'}${editMode ? '' : ' ro'}`}
                        onClick={editMode ? () => toggleStudent(s.student_id) : undefined}
                      >
                        <span className="avatar">{initials(s.name)}</span>
                        <span className="who">
                          <strong>{s.name}</strong>
                          <small>{s.phone}</small>
                        </span>
                        <span className="tick">{absent.has(s.student_id) ? '✕' : '✓'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="modal-foot">
                  <div className="att-counts">
                    <span className="n-ok">{roster.roster.length - absent.size} present</span>
                    <span style={{ opacity: 0.55 }}>·</span>
                    <span className="n-bad">{absent.size} absent</span>
                  </div>
                  <div className="att-foot-actions">
                    <button className="btn btn-ghost" onClick={() => setModal(null)}>
                      Cancel
                    </button>
                    {!editMode && (
                      <button className="btn btn-ghost" onClick={() => setEditMode(true)}>
                        Edit record
                      </button>
                    )}
                    {editMode && (
                      <button
                        className="btn btn-primary"
                        style={unchanged ? { opacity: 0.55 } : undefined}
                        onClick={save}
                        disabled={saving}
                      >
                        {unchanged ? 'Saved ✓' : 'Save attendance'}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}