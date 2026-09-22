export function inr(n) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}