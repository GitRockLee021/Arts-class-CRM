import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { inr, fmtDate } from '../format.js';
import { Modal, Spinner, EmptyState, Confirm, Field } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import AddStudentForm from '../components/AddStudentForm.jsx';
import EnrollmentForm from '../components/EnrollmentForm.jsx';
import PaymentForm from '../components/PaymentForm.jsx';
import AdmissionCollect from '../components/AdmissionCollect.jsx';
import { useToast } from '../components/Toast.jsx';

function initials(name) {
  return (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function overdueDays(dueDate) {
  if (!dueDate) return 0;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return 0;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return days > 0 ? days : 0;
}

function monthName(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short' });
}

const LOG_TITLES = {
  payment: 'Payment recorded',
  enrolled: 'Enrolled in course',
  course_changed: 'Course changed',
  upgraded: 'Course upgraded',
  certificate: 'Certificate sent',
  profile_updated: 'Profile updated',
};

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [student, setStudent] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [admissionOpen, setAdmissionOpen] = useState(false);
  const [courseFor, setCourseFor] = useState(null);
  const [upgradeFor, setUpgradeFor] = useState(null);
  const [certBusy, setCertBusy] = useState(false);
  const [certPreview, setCertPreview] = useState(null);

  function load() {
    api.get(`/students/${id}`).then(setStudent).catch(() => {
      toast('Student not found', 'error');
      navigate('/students');
    });
  }
  useEffect(load, [id]);

  if (!student) return <Spinner />;

  const enrollments = student.enrollments || [];
  const active = enrollments.filter((e) => e.status === 'active');

  const monthly = active.reduce((s, e) => s + (e.monthly_fee || 0), 0);
  const paid = enrollments.reduce((s, e) => s + (e.fee?.paid || 0), 0);
  const due = enrollments.reduce((s, e) => s + (e.fee?.due || 0), 0);
  const expected = enrollments.reduce((s, e) => s + (e.fee?.expected || 0), 0);
  const payCount = enrollments.reduce((s, e) => s + (e.payments?.length || 0), 0);

  const team = active[0] || enrollments[0] || null;
  const duePlan = enrollments.find((e) => e.fee?.due > 0) || null;
  const overs = overdueDays(duePlan?.fee?.dueDate);
  const progress = expected > 0 ? Math.min(100, Math.round((paid / expected) * 100)) : 0;
  const lastPayment = enrollments
    .flatMap((e) => e.payments || [])
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0];
  const joinDate = student.date_of_admission || student.created_at;
  const payable = active.find((e) => e.fee?.due > 0) || active[0] || enrollments[0];
  const payEnrollment = enrollments.find((e) => e.id === payFor);

  const showInsights = false;

  async function saveStudent(form) {
    await api.put(`/students/${id}`, {
      name: form.name,
      age: form.age,
      phone: form.phone,
      guardian_name: form.guardian_name,
      date_of_admission: form.date_of_admission,
      email: student.email,
      guardian_phone: student.guardian_phone,
      address: student.address,
      notes: student.notes,
      status: student.status,
    });
    toast('Student updated.');
    setEditOpen(false);
    load();
  }

  async function addEnrollment(form) {
    await api.post('/enrollments', { ...form, student_id: Number(id) });
    toast('Enrollment added.');
    setEnrollOpen(false);
    load();
  }

  async function addPayment(form) {
    await api.post(`/enrollments/${payFor}/payments`, form);
    toast('Payment recorded.');
    setPayFor(null);
    load();
  }

  async function changeCourse(enrollmentId, data) {
    await api.put(`/enrollments/${enrollmentId}`, data);
    toast('Course changed.');
    setCourseFor(null);
    load();
  }

  async function upgradeCourse(enrollmentId, data) {
    await api.put(`/enrollments/${enrollmentId}`, { ...data, is_upgrade: true });
    toast('Course upgraded.');
    setUpgradeFor(null);
    load();
  }

  async function upgradeAndPreviewCertificate(enrollmentId, data) {
    setCertBusy(true);
    try {
      await api.put(`/enrollments/${enrollmentId}`, { ...data, is_upgrade: true });
      const preview = await api.get(`/enrollments/${enrollmentId}/certificate`);
      setCertPreview({ ...preview, enrollmentId });
      setUpgradeFor(null);
      load();
    } catch (err) {
      toast(err.message || 'Upgrade / preview failed.', 'error');
    } finally {
      setCertBusy(false);
    }
  }

  async function confirmSendCertificate() {
    if (!certPreview) return;
    setCertBusy(true);
    try {
      const result = await api.post(`/enrollments/${certPreview.enrollmentId}/certificate`);
      const status = result.delivery?.status;
      if (status === 'sent') {
        toast(`Certificate sent — ${result.certificate.certNumber}`);
      } else if (status === 'dry-run') {
        toast('Certificate generated (dry-run, not sent).', 'info');
      } else {
        toast(`Certificate send failed: ${result.delivery?.message || 'error'}`, 'error');
      }
      setCertPreview(null);
      load();
    } catch (err) {
      toast(err.message || 'Certificate send failed.', 'error');
    } finally {
      setCertBusy(false);
    }
  }

  async function deleteStudent() {
    await api.del(`/students/${id}`);
    toast('Student deleted.');
    navigate('/students');
  }

  async function remindStudent() {
    const ids = enrollments.filter((e) => e.fee?.due > 0).map((e) => e.id);
    if (!ids.length) {
      toast('No dues to remind.', 'error');
      return;
    }
    const result = await api.post('/reminders/send', { enrollmentIds: ids });
    const sent = result.results?.filter((r) => r.status !== 'error').length || 0;
    toast(`Sent ${sent} reminder(s).`);
    load();
  }

  return (
    <div className="sv">
      <div className="sv-top">
        <nav className="sv-crumb">
          <a onClick={() => navigate('/students')}>Students</a>
          <span>/</span>
          <span className="sv-here">{student.name}</span>
        </nav>
        <div className="sv-top-right">
          <span className="sv-id-pill">ID: #PAS-{new Date().getFullYear()}-{String(student.id).padStart(3, '0')}</span>
          {joinDate && <span className="sv-enrolled">Enrolled {fmtDate(joinDate)}</span>}
        </div>
      </div>

      <div className="sv-card sv-header">
        <div className="sv-header-main">
          <div className="sv-avatar-wrap">
            <div className="sv-avatar">
              <span>{initials(student.name)}</span>
            </div>
            <span className="sv-live-dot" title="Active Student"></span>
          </div>
          <div>
            <div className="sv-name-row">
              <h1 className="sv-name">{student.name}</h1>
              <span className={`sv-status sv-status-${student.status}`}>
                <span className="sv-status-dot"></span>
                {student.status}
              </span>
            </div>
            <div className="sv-meta">
              <span className="sv-meta-item">
                Age {student.age || '—'}
                {student.date_of_birth ? <span className="muted"> (Born {fmtDate(student.date_of_birth)})</span> : null}
              </span>
              {(student.guardian_name || student.guardian_phone) && (
                <>
                  <span className="sv-meta-sep">•</span>
                  <span className="sv-meta-item">
                    Parent: <strong>{student.guardian_name || '—'}</strong>
                    {student.guardian_phone ? ` (${student.guardian_phone})` : ''}
                  </span>
                </>
              )}
              <span className="sv-meta-sep">•</span>
              <span className="sv-meta-item">
                Batch: {team?.batch_name || team?.batch || <span className="muted">Not assigned</span>}
              </span>
            </div>
          </div>
        </div>
        <div className="sv-header-actions">
          <button className="sv-btn sv-btn-primary" disabled={!payable} onClick={() => payable && setPayFor(payable.id)}>
            <Icon name="card" size={15} /> Record payment
          </button>
          <button className="sv-btn" disabled={!team} onClick={() => team && setAdmissionOpen(true)}>
            <Icon name="rupee" size={15} /> Admission fees
          </button>
          <button className="sv-btn" onClick={remindStudent}>
            <Icon name="bell" size={15} /> Remind
          </button>
          <button className="sv-btn" onClick={() => setEditOpen(true)}>
            <Icon name="edit" size={15} /> Edit
          </button>
          <button className="sv-btn sv-btn-dots" title="More options" onClick={() => setEditOpen(true)}>
            <Icon name="more" size={16} />
          </button>
        </div>
      </div>

      {showInsights && (
      <section className="sv-grid3">
        <div className="sv-card sv-card-pink">
          <div className="sv-card-spark sv-spark-pink"></div>
          <div className="sv-card-head">
            <div className="sv-card-head-l">
              <span className="sv-card-ico sv-ico-pink">
                <Icon name="rupee" size={16} />
              </span>
              <span className="sv-card-title">Fee Health &amp; Billing</span>
            </div>
            {due > 0 ? (
              overs > 0 ? (
                <span className="sv-alert">
                  <span className="sv-alert-dot"></span>
                  {overs} Days Overdue
                </span>
              ) : (
                <span className="sv-alert sv-alert-ok">
                  <span className="sv-alert-dot"></span>
                  Due soon
                </span>
              )
            ) : (
              <span className="sv-alert sv-alert-ok">
                <span className="sv-alert-dot"></span>
                Up to date
              </span>
            )}
          </div>
          <div className="sv-big-row">
            <div>
              <p className="sv-label">Outstanding Balance</p>
              <div className="sv-big">
                <span className={due > 0 ? 'sv-big-due' : ''}>{inr(due)}</span>
                {duePlan?.fee?.dueDate && <span className="sv-for">for {fmtDate(duePlan.fee.dueDate)}</span>}
              </div>
            </div>
            <div className="sv-big-side">
              <p className="sv-label">Monthly Plan</p>
              <p className="sv-plan">{inr(monthly)}<span className="sv-per">/mo</span></p>
            </div>
          </div>
          <div className="sv-breakbox">
            <div className="sv-bb-row">
              <span className="sv-muted-sm">Due Date:</span>
              <span className="sv-bold">{duePlan?.fee?.dueDate ? fmtDate(duePlan.fee.dueDate) : '—'}</span>
            </div>
            <div className="sv-bb-row">
              <span className="sv-muted-sm">Total Paid to Date:</span>
              <span className="sv-bold sv-ok">{inr(paid)}</span>
            </div>
          </div>
          <div className="sv-card-foot">
            <button className="sv-mini sv-mini-berry" onClick={remindStudent}>
              <Icon name="send" size={14} /> Send WhatsApp
            </button>
          </div>
        </div>

        <div className="sv-card sv-card-purple">
          <div className="sv-card-spark sv-spark-purple"></div>
          <div className="sv-card-head">
            <div className="sv-card-head-l">
              <span className="sv-card-ico sv-ico-purple">
                <Icon name="calendar" size={16} />
              </span>
              <span className="sv-card-title">Attendance &amp; Schedule</span>
            </div>
            <span className="sv-chip sv-chip-ok">{active.length > 0 ? 'Active' : '—'}</span>
          </div>
          {active.length === 0 ? (
            <p className="sv-muted-sm">No active enrollment to schedule classes for.</p>
          ) : (
            active.map((e) => (
              <div key={e.id} className="sv-session">
                <p className="sv-label">Classes Attended</p>
                <p className="sv-session-strong">{e.batch_name || e.batch || 'No batch'}</p>
                <p className="sv-muted-sm">
                  {e.course_name || 'No course'}{' '}
                  {e.batch_days || e.batch_time ? `· ${[e.batch_days, e.batch_time].filter(Boolean).join(' ')}` : ''}
                </p>
              </div>
            ))
          )}
          {active[0] && (
            <div className="sv-nextbox">
              <p className="sv-next-title">
                <span className="sv-next-dot"></span>
                Next Class Session
              </p>
              <p className="sv-next-line">
                {[active[0].batch_days, active[0].batch_time].filter(Boolean).join(' · ') || 'Schedule not set'}
              </p>
              <p className="sv-muted-sm">{active[0].course_name || 'No course'} • {active[0].batch_name || 'No batch'}</p>
            </div>
          )}
          <div className="sv-card-foot sv-foot-between">
            <span className="sv-muted-sm">Started {active[0] ? fmtDate(active[0].start_date) : '—'}</span>
            <button className="sv-link" onClick={() => setEnrollOpen(true)}>
              Enroll in course <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <div className="sv-card sv-card-amber">
          <div className="sv-card-spark sv-spark-amber"></div>
          <div className="sv-card-head">
            <div className="sv-card-head-l">
              <span className="sv-card-ico sv-ico-amber">
                <Icon name="book" size={16} />
              </span>
              <span className="sv-card-title">Course &amp; Payments</span>
            </div>
            <span className="sv-chip sv-chip-amber">
              {team ? (team.fee_mode === 'one_time' ? 'One time' : 'Monthly') : '—'}
            </span>
          </div>
          <div className="sv-session">
            <p className="sv-label">Current Focus Topic</p>
            <p className="sv-course">{team?.course_name || 'No course enrolled'}</p>
            <p className="sv-muted-sm">
              {team?.duration_months ? `${team.duration_months} month${team.duration_months === 1 ? '' : 's'} plan` : 'Open duration'}
            </p>
          </div>
          <div className="sv-progress-wrap">
            <div className="sv-prow">
              <span className="sv-muted-sm">Billing Completion</span>
              <span className="sv-progress-pct">{progress}%</span>
            </div>
            <div className="sv-progress">
              <div className="sv-progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
          <div className="sv-breakbox">
            <div className="sv-bb-row">
              <span className="sv-muted-sm">Payments logged:</span>
              <span className="sv-bold">
                {payCount} paid <span className="sv-ok">({inr(paid)})</span>
              </span>
            </div>
          </div>
          <div className="sv-card-foot sv-foot-between">
            <span className="sv-muted-sm">{lastPayment ? `Last payment: ${fmtDate(lastPayment.payment_date)}` : 'No payments yet'}</span>
            {enrollments.length > 0 && (
              <button className="sv-link" onClick={() => payable && setPayFor(payable.id)}>
                Collect payment <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </div>
      </section>
      )}

      <section className="sv-card sv-info">
        <div className="sv-info-head">
          <div className="sv-info-title">
            <span className="sv-card-ico sv-ico-purple">
              <Icon name="users" size={16} />
            </span>
            <div>
              <h3 className="sv-h3">Student &amp; Parent Info</h3>
              <p className="sv-muted-sm">Contact details for art studio communications</p>
            </div>
          </div>
          <span className="sv-chip sv-chip-ok">Profile</span>
        </div>
        <div className="sv-info-grid">
          <div className="sv-kv">
            <p className="sv-kv-label">Phone &amp; WhatsApp</p>
            <div className="sv-kv-row">
              <span className="sv-kv-val">+91 {student.phone}</span>
            </div>
          </div>
          <div className="sv-kv">
            <p className="sv-kv-label">Parent</p>
            <span className="sv-kv-val sv-kv-empty">{student.guardian_name || '—'}</span>
          </div>
          <div className="sv-kv">
            <p className="sv-kv-label">Age</p>
            <span className="sv-kv-val">{student.age ? `${student.age} yrs` : '—'}</span>
          </div>
          <div className="sv-kv">
            <p className="sv-kv-label">Date of Admission</p>
            <span className="sv-kv-val">{joinDate ? fmtDate(joinDate) : '—'}</span>
          </div>
        </div>
      </section>

      {student.notes && <div className="sv-card sv-notes">{student.notes}</div>}

      <div className="sv-twocol">
        <section className="sv-card sv-enrolls">
          <div className="sv-info-head">
            <div className="sv-info-title">
              <span className="sv-card-ico sv-ico-purple">
                <Icon name="book" size={16} />
              </span>
              <div>
                <h3 className="sv-h3">Enrollments &amp; Course Batches</h3>
                <p className="sv-muted-sm">{active.length} active enrollment{active.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            <div className="sv-enroll-actions">
              <button className="sv-btn sm" disabled={!team || certBusy} onClick={() => team && setCourseFor(team.id)}>
                <Icon name="edit" size={14} /> Edit
              </button>
              <button className="sv-btn sv-btn-primary" disabled={!team || certBusy} onClick={() => team && setUpgradeFor(team.id)}>
                <Icon name="layers" size={14} /> Upgrade course
              </button>
            </div>
          </div>
        {enrollments.length === 0 ? (
          <EmptyState>
            No enrollments yet.
            <button className="sv-btn-primary" onClick={() => setEnrollOpen(true)}>
              Enroll in a course
            </button>
          </EmptyState>
        ) : (
          enrollments.map((e) => (
            <div key={e.id} className="sv-enroll">
              <div className="sv-enroll-head">
                <div className="sv-enroll-course">
                  <span className="sv-course-mono">{initials(e.course_name || e.batch_name)}</span>
                  <div>
                    <div className="sv-enroll-title-row">
                      <h4 className="sv-enroll-title">{e.course_name || 'No course'}</h4>
                      <span className={`sv-status sv-status-${e.status}`}>
                        <span className="sv-status-dot"></span>
                        {e.status}
                      </span>
                    </div>
                    <p className="sv-muted-sm">
                      {e.batch_name || e.batch || 'No batch'}
                      {e.batch_days || e.batch_time ? ` · ${[e.batch_days, e.batch_time].filter(Boolean).join(' ')}` : ''}
                    </p>
                  </div>
                </div>
                <span className="sv-muted-sm">{e.start_date ? `Enrolled: ${fmtDate(e.start_date)}` : ''}</span>
              </div>
              <div className="sv-enroll-body">
                <div className="sv-enroll-main">
                  <p className="sv-kv-label">Recent payments</p>
                  {e.payments?.length > 0 ? (
                    <ul className="sv-paylist">
                      {e.payments.slice(0, 8).map((p) => (
                        <li key={p.id}>
                          <span>{fmtDate(p.payment_date)}</span>
                          {p.fee_type && p.fee_type !== 'tuition' && (
                            <span className={`mchip mchip-fee mchip-ft-${p.fee_type}`}>{p.fee_type}</span>
                          )}
                          <strong>{inr(p.amount)}</strong>
                          <span className="sv-muted-sm">{p.method}</span>
                        </li>
                      ))}
                      {e.payments.length > 8 && (
                        <li className="sv-muted-sm">… {e.payments.length - 8} more</li>
                      )}
                    </ul>
                  ) : (
                    <p className="sv-muted-sm">No payments recorded yet.</p>
                  )}
                </div>
                <div className="sv-fee-summary">
                  <div className="sv-fs-box">
                    <p className="sv-kv-label">Billing</p>
                    <div className={`sv-fs-hero ${e.fee?.due > 0 ? 'bad' : 'ok'}`}>
                      {e.fee?.due > 0 ? `${inr(e.fee.due)} due` : 'Cleared'}
                      <span className="sv-fs-hero-sub">
                        {e.fee?.due > 0
                          ? e.fee.dueDate && overdueDays(e.fee.dueDate) > 0
                            ? `${monthName(e.fee.dueDate)} cycle · ${overdueDays(e.fee.dueDate)}d overdue`
                            : e.fee.dueDate
                              ? `due ${fmtDate(e.fee.dueDate)}`
                              : 'Overdue'
                          : e.payments?.[0]
                            ? `${monthName(e.payments[0].payment_date)} paid on ${fmtDate(e.payments[0].payment_date)}`
                            : 'All cleared'}
                      </span>
                    </div>
                    <div className="sv-fs-row">
                      <span className="sv-muted-sm">Next due</span>
                      <strong>{e.fee?.dueDate ? fmtDate(e.fee.dueDate) : '—'}</strong>
                    </div>
                    <div className="sv-fs-row">
                      <span className="sv-muted-sm">Base fee</span>
                      <strong>{inr(e.monthly_fee)}<span className="sv-per">/mo</span></strong>
                    </div>
                    <div className="sv-fs-row">
                      <span className="sv-muted-sm">Last payment</span>
                      <strong>{e.payments?.[0] ? fmtDate(e.payments[0].payment_date) : '—'}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="sv-card sv-logcard">
          <div className="sv-info-head">
            <div className="sv-info-title">
              <span className="sv-card-ico sv-ico-indigo">
                <Icon name="bell" size={16} />
              </span>
              <div>
                <h3 className="sv-h3">Recent Activity &amp; Student Timeline</h3>
                <p className="sv-muted-sm">Automated audit trail of enrollments, course changes and recorded payments</p>
              </div>
            </div>
          </div>
          {(student.logs || []).length === 0 ? (
            <p className="sv-muted-sm">No activity yet — payments, reminders and course changes will appear here.</p>
          ) : (
            <div className="sv-log">
              {student.logs.map((log, i) => (
                <div key={i} className="sv-log-item">
                  <span className={`sv-log-dot ${log.type === 'payment' ? 'sv-log-dot-ok' : log.status === 'error' ? 'sv-log-dot-bad' : 'sv-log-dot-purple'}`}></span>
                  <div>
                    <p className="sv-log-title">
                      {LOG_TITLES[log.type] || (log.status === 'sent' ? 'Fee reminder sent' : 'Fee reminder queued')}
                    </p>
                    <p className="sv-muted-sm">{log.message}</p>
                  </div>
                  <span className="sv-log-date">{log.at ? fmtDate(log.at) : ''}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="sv-danger">
        <Confirm
          message="Permanently delete this student and all related records? This cannot be undone."
          onConfirm={deleteStudent}
        >
          Delete student
        </Confirm>
        <span className="sv-muted-sm">This permanently deletes the student and all related records.</span>
      </div>

      {editOpen && (
        <Modal title="Edit student" onClose={() => setEditOpen(false)}>
          <AddStudentForm
            initial={student}
            enrollment={team}
            onSave={saveStudent}
            onCancel={() => setEditOpen(false)}
            submitLabel="Save changes"
          />
        </Modal>
      )}
      {enrollOpen && (
        <Modal title="Enroll in a course" onClose={() => setEnrollOpen(false)}>
          <EnrollmentForm fixedStudentId={id} onSave={addEnrollment} />
        </Modal>
      )}
      {courseFor && (
        <Modal title="Change course" onClose={() => setCourseFor(null)}>
          <ChangeCourseForm
            current={enrollments.find((en) => en.id === courseFor)}
            onSave={(data) => changeCourse(courseFor, data)}
          />
        </Modal>
      )}
      {upgradeFor && (
        <Modal title="Upgrade course" onClose={() => setUpgradeFor(null)}>
          <ChangeCourseForm
            current={enrollments.find((en) => en.id === upgradeFor)}
            onSave={(data) => upgradeCourse(upgradeFor, data)}
            submitLabel="Upgrade to this course"
            onSendCert={(data) => upgradeAndPreviewCertificate(upgradeFor, data)}
          />
        </Modal>
      )}
      {certPreview && (
        <Modal title="Certificate preview" onClose={() => setCertPreview(null)}>
          {certPreview.image && (
            <img
              src={certPreview.image}
              alt="Certificate preview"
              style={{ width: '100%', borderRadius: 12, maxHeight: '60vh', objectFit: 'contain' }}
            />
          )}
          <p className="muted" style={{ marginTop: 12 }}>
            Sending to <strong>{certPreview.studentName}</strong>
            {certPreview.phone ? ` at +91 ${certPreview.phone}` : ''} on WhatsApp
            {certPreview.certNumber ? ` — ${certPreview.certNumber}` : ''}.
          </p>
          <div className="row end">
            <button className="btn" disabled={certBusy} onClick={() => setCertPreview(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={certBusy} onClick={confirmSendCertificate}>
              {certBusy ? 'Sending…' : 'Confirm & send via WhatsApp'}
            </button>
          </div>
        </Modal>
      )}
      {payFor && payEnrollment && (
        <Modal title={`Record payment — ${payEnrollment.course_name || 'No course'}`} onClose={() => setPayFor(null)}>
          <p className="muted">
            Due amount: <strong>{inr(payEnrollment.fee.due)}</strong>
          </p>
          <PaymentForm defaultAmount={payEnrollment.fee.due} onSave={addPayment} />
        </Modal>
      )}
      {admissionOpen && (
        <AdmissionCollect
          enrollment={team}
          onClose={() => setAdmissionOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ChangeCourseForm({ current, onSave, submitLabel = 'Change course', onSendCert }) {
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({
    course_id: '',
    batch_id: '',
    remark: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sendBusy, setSendBusy] = useState(false);

  useEffect(() => {
    api.get('/courses').then(setCourses).catch(() => {});
    api
      .get('/batches')
      .then((data) => setBatches((data.batches || []).filter((b) => b.status === 'active')))
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.course_id) {
      setError('Select a course.');
      return;
    }
    if (Number(form.course_id) === Number(current?.course_id)) {
      setError('That is already the current course. Choose a different course to continue.');
      return;
    }
    setBusy(true);
    try {
      await onSave({
        course_id: form.course_id ? Number(form.course_id) : null,
        batch_id: form.batch_id ? Number(form.batch_id) : null,
        remark: form.remark.trim() || null,
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function validate() {
    if (!form.course_id) return 'Select a course.';
    if (Number(form.course_id) === Number(current?.course_id)) {
      return 'That is already the current course. Choose a different course to continue.';
    }
    return '';
  }

  async function submitAndSend(e) {
    e.preventDefault();
    setError('');
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSendBusy(true);
    try {
      await onSendCert({
        course_id: form.course_id ? Number(form.course_id) : null,
        batch_id: form.batch_id ? Number(form.batch_id) : null,
        remark: form.remark.trim() || null,
      });
    } catch (err) {
      setError(err.message);
      setSendBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <p className="muted">
        Current course: <strong>{current?.course_name || '—'}</strong>
      </p>
      {error && <p className="form-error">{error}</p>}
      <Field label="Change to course *" className="span-2">
        {courses.length === 0 ? (
          <span className="muted">No courses yet — add one under Courses first.</span>
        ) : (
          <select
            className="input"
            value={form.course_id}
            onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))}
          >
            <option value="">Select course…</option>
            {courses.filter((c) => c.status !== 'inactive').map((c) => (
              <option key={c.id} value={c.id} disabled={Number(c.id) === Number(current?.course_id)}>
                {c.name} · ₹{c.monthly_fee}/mo{Number(c.id) === Number(current?.course_id) ? ' (current)' : ''}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Batch / schedule" className="span-2">
        {batches.length === 0 ? (
          <span className="muted">No batches yet — add one under Batches.</span>
        ) : form.course_id && !batches.some((b) => Number(b.course_id) === Number(form.course_id)) ? (
          <span className="muted">No batch created for this course yet — add one under Batches.</span>
        ) : (
          <select
            className="input"
            value={
              batches.find((b) => String(b.id) === form.batch_id)?.course_id &&
              Number(batches.find((b) => String(b.id) === form.batch_id).course_id) === Number(form.course_id)
                ? form.batch_id
                : ''
            }
            onChange={(e) => setForm((f) => ({ ...f, batch_id: e.target.value }))}
          >
            <option value="">No batch</option>
            {batches
              .filter((b) => Number(b.course_id) === Number(form.course_id))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.days || b.time ? ` — ${[b.days, b.time].filter(Boolean).join(' · ')}` : ''}
                </option>
              ))}
          </select>
        )}
      </Field>
      <Field label="Remarks for this change" className="span-2">
        <textarea
          className="input"
          rows="2"
          value={form.remark}
          onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
          placeholder="e.g. Completed Level 1, promoted to Fine Arts – Level 2"
        />
      </Field>
      <div className="row end span-2">
        {onSendCert && (
          <button
            type="button"
            className="btn"
            disabled={sendBusy || busy || courses.length === 0}
            onClick={submitAndSend}
            title="Upgrade the course and open the certificate for review before sending"
          >
            {sendBusy ? 'Upgrading…' : 'Send certificate'}
          </button>
        )}
        <button className="btn btn-primary" disabled={busy || sendBusy || courses.length === 0}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}