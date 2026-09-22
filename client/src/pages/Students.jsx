import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { inr } from '../format.js';
import { Badge, Modal, Spinner, EmptyState, useForm } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import AddStudentForm from '../components/AddStudentForm.jsx';
import AdmissionCollect from '../components/AdmissionCollect.jsx';
import { useToast } from '../components/Toast.jsx';

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function exportCsv(rows) {
  const head = ['Name', 'Phone', 'Current course', 'Outstanding due', 'Status'];
  const lines = rows.map((s) =>
    [s.name, s.phone, s.current_course, s.total_due, s.status]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(','),
  );
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'students.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arr = new Uint8Array(reader.result);
      let bin = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < arr.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, arr.subarray(i, i + CHUNK));
      }
      resolve(btoa(bin));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function pageWindow(current, pages) {
  const MAX = 7;
  if (pages <= MAX) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, current - 1, current, current + 1]);
  const sorted = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

export default function Students() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState(null);
  const [courses, setCourses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [admissionEnroll, setAdmissionEnroll] = useState(null);
  const [editCtx, setEditCtx] = useState(null);
  const [lastStudent, setLastStudent] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState(null);
  const PAGE_SIZE = 10;

  const parsedPage = Number.parseInt(searchParams.get('page'), 10);
  const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
  const search = searchParams.get('search') || '';
  const course = searchParams.get('course') || '';

  function updateParams(next) {
    const p = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    setSearchParams(p);
  }

  function load(p, q, c) {
    const params = new URLSearchParams({ page: p, pageSize: PAGE_SIZE });
    if (q) params.set('search', q);
    if (c) params.set('course', c);
    api
      .get(`/students?${params}`)
      .then((res) => {
        setStudents(res.students);
        setPages(res.pages);
        setTotal(res.total);
        setCounts(res.counts);
        if (res.page && res.page !== p) updateParams({ page: res.page });
      })
      .catch(() => {});
  }

  function goPage(n) {
    if (n < 1 || n > pages) return;
    updateParams({ page: n });
  }

  useEffect(() => {
    api.get('/courses').then(setCourses).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(page, search, course), 300);
    return () => clearTimeout(t);
  }, [page, search, course]);

  async function exportAll() {
    try {
      const res = await api.get('/students?pageSize=100000');
      exportCsv(res.students);
    } catch {
      /* ignore */
    }
  }

  async function createStudent(form, mode) {
    if (editCtx) {
      const student = await api.put(`/students/${editCtx.student.id}`, {
        ...editCtx.student,
        name: form.name,
        age: form.age,
        phone: form.phone,
        guardian_name: form.guardian_name,
        date_of_admission: form.date_of_admission,
      });
      const enrollment = await api.put(`/enrollments/${editCtx.enrollment.id}`, {
        start_date: form.date_of_admission,
      });
      toast('Student updated.');
      setLastStudent(student);
      setShowForm(false);
      setEditCtx(null);
      setAdmissionEnroll(enrollment);
      return;
    }
    const student = await api.post('/students', {
      name: form.name,
      age: form.age,
      phone: form.phone,
      email: form.email,
      guardian_name: form.guardian_name,
      guardian_phone: form.guardian_phone,
      address: form.address,
      notes: form.notes,
      date_of_admission: form.date_of_admission,
      status: mode === 'draft' ? 'draft' : 'active',
    });
    if (mode === 'save' && form.course_id) {
      const enrollment = await api.post('/enrollments', {
        student_id: student.id,
        course_id: form.course_id,
        batch_id: form.batch_id || null,
        start_date: form.date_of_admission,
        status: 'active',
      });
toast('Student added and enrolled.');
        setLastStudent(student);
        setAdmissionEnroll(enrollment);
    } else {
      toast('Draft saved.');
    }
    setShowForm(false);
    updateParams({ page: 1 });
  }

  async function runImport(e) {
    e.preventDefault();
    if (!importFile) return;
    setImportBusy(true);
    try {
      const fileBase64 = await fileToBase64(importFile);
      const result = await api.post('/imports/students', { fileBase64, filename: importFile.name });
      setImportResult(result);
      setShowImport(false);
      setImportFile(null);
      updateParams({ page: 1 });
    } catch (err) {
      toast(err.message);
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Students</h1>
        <div className="row">
          {students && (
            <button className="btn" onClick={exportAll} title="Export all students to CSV">
              <Icon name="download" size={15} /> CSV
            </button>
          )}
          <button className="btn" onClick={() => setShowImport(true)} title="Bulk import students from the Excel template">
            <Icon name="upload" size={15} /> Import
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={16} /> Add student
          </button>
        </div>
      </div>

      {!counts || !students ? (
        <Spinner />
      ) : (
        <>
          <div className="stats tiles">
            <div className="tile tile-dark">
              <div className="deco" />
              <span className="label">Total students</span>
              <div className="amount">{counts.total}</div>
              <div className="cap">
                <span>all time</span>
              </div>
            </div>
            <div className="tile tile-green">
              <div className="deco" />
              <span className="label">Active</span>
              <div className="amount">{counts.active}</div>
              <div className="cap">
                <span>{Math.round((counts.active / (counts.total || 1)) * 100)}% of total</span>
              </div>
            </div>
            <div className="tile tile-gray">
              <div className="deco" />
              <span className="label">Inactive</span>
              <div className="amount">{counts.inactive}</div>
              <div className="cap">
                <span>{Math.round((counts.inactive / (counts.total || 1)) * 100)}% of total</span>
              </div>
            </div>
            <div className="tile tile-bad">
              <div className="deco" />
              <span className="label">Outstanding due</span>
              <div className="amount">
                <span className="cur">₹</span>
                {inr(counts.dueTotal).slice(1)}
              </div>
              <div className="cap">
                <span>
                  {counts.dueCount} student{counts.dueCount === 1 ? '' : 's'} with dues
                </span>
              </div>
            </div>
          </div>

          <div className="searchbar">
            <input
              className="input"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => updateParams({ page: 1, search: e.target.value })}
            />
          </div>

          <div className="filter-chips">
            <button className={`chip${course === '' ? ' chip-active' : ''}`} onClick={() => updateParams({ page: 1, course: '' })}>
              All
            </button>
            {courses.map((c) => (
              <button
                key={c.id}
                className={`chip${course === String(c.id) ? ' chip-active' : ''}`}
                onClick={() => updateParams({ page: 1, course: String(c.id) })}
              >
                {c.name}
              </button>
            ))}
          </div>

          {students.length === 0 ? (
            <EmptyState>
              No students found.
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                Add your first student
              </button>
            </EmptyState>
          ) : (
            <>
              <div className="card">
                <div className="tablewrap">
                  <table className="stack-cards">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Student</th>
                        <th>Phone</th>
                        <th>Current course</th>
                        <th>Outstanding due</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id} className="clickable" onClick={() => navigate(`/students/${s.id}`)}>
                          <td data-label="ID">#{s.id}</td>
                          <td data-label="Student">
                            <div className="stu-cell">
                              <span className="avatar">{initials(s.name)}</span>
                              <strong>{s.name}</strong>
                            </div>
                          </td>
                          <td data-label="Phone">{s.phone}</td>
                          <td data-label="Current course">{s.current_course || <span className="muted">—</span>}</td>
                          <td data-label="Outstanding due">
                            {s.total_due > 0 ? (
                              <span className="due-strong">{inr(s.total_due)}</span>
                            ) : (
                              <span className="muted">{inr(0)}</span>
                            )}
                          </td>
                          <td data-label="Status">
                            <Badge status={s.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pagination">
                  <span className="muted">
                    {total === 0
                      ? 'No students yet'
                      : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(total, page * PAGE_SIZE)} of ${total}`}
                  </span>
                  <div className="pagination-pages">
                    <button
                      className="btn page-btn"
                      disabled={page <= 1}
                      onClick={() => goPage(page - 1)}
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    {pageWindow(page, pages).map((item, i) =>
                      item === '…' ? (
                        <span key={`e${i}`} className="page-ellipsis">
                          …
                        </span>
                      ) : (
                        <button
                          key={i}
                          className={`btn page-btn${item === page ? ' page-btn-active' : ''}`}
                          onClick={() => goPage(item)}
                        >
                          {item}
                        </button>
                      ),
                    )}
                    <button
                      className="btn page-btn"
                      disabled={page >= pages}
                      onClick={() => goPage(page + 1)}
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </div>
                </div>
            </>
          )}
        </>
      )}

      {showForm && (
        <Modal
          title={editCtx ? 'Edit student details' : 'Add student'}
          onClose={() => {
            setShowForm(false);
            setEditCtx(null);
          }}
        >
          <AddStudentForm
            onSave={createStudent}
            onCancel={() => {
              setShowForm(false);
              setEditCtx(null);
            }}
            initial={editCtx ? editCtx.student : null}
            enrollment={editCtx ? editCtx.enrollment : null}
            submitLabel={editCtx ? 'Save' : 'Save & continue'}
          />
        </Modal>
      )}

      {admissionEnroll && (
        <AdmissionCollect
          enrollment={admissionEnroll}
          onClose={() => setAdmissionEnroll(null)}
          onBack={() => {
            setEditCtx({ student: lastStudent, enrollment: admissionEnroll });
            setAdmissionEnroll(null);
            setShowForm(true);
          }}
          onSaved={() => load(page, search, course)}
        />
      )}

      {showImport && (
        <Modal title="Import students" onClose={() => setShowImport(false)}>
          <p className="muted">
            Download the template, pick one of its courses for each student, then upload the filled file. Students
            without a course are saved as drafts.
          </p>
          <div className="import-actions">
            <a className="btn btn-primary" href="/api/imports/template.xlsx" title="Fresh template with the current course dropdown">
              <Icon name="download" size={15} /> Download template
            </a>
          </div>
          <form onSubmit={runImport}>
            <label className="import-box">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setImportFile(e.target.files[0])}
              />
              <span>{importFile ? importFile.name : 'Click to choose the filled template (.xlsx, .xls or .csv)'}</span>
            </label>
            <div className="row end">
              <button type="button" className="btn btn-ghost" onClick={() => setShowImport(false)} disabled={importBusy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!importFile || importBusy}>
                {importBusy ? 'Importing…' : 'Import'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {importResult && (
        <Modal title="Import results" onClose={() => setImportResult(null)}>
          <p>
            Imported <strong>{importResult.added}</strong> student(s) and saved{' '}
            <strong>{importResult.drafts}</strong> as draft.
          </p>
          {importResult.errors.length > 0 && (
            <>
              <p className="muted">
                {importResult.errors.length} row(s) skipped:
              </p>
              <ul className="err-list">
                {importResult.errors.map((er) => (
                  <li key={er.row}>
                    <strong>Row {er.row}</strong> ({er.name}) — {er.message}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="row end">
            <button className="btn btn-primary" onClick={() => setImportResult(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}