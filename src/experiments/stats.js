export function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function variance(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}

export function compareMeans(control, treatment) {
  const c = control.map(Number).filter(Number.isFinite);
  const t = treatment.map(Number).filter(Number.isFinite);
  const cm = mean(c);
  const tm = mean(t);
  if (cm === null || tm === null) return { control_n: c.length, treatment_n: t.length, control_mean: cm, treatment_mean: tm, absolute_lift: null, relative_lift: null, z_approx: null };
  const se = Math.sqrt((variance(c) / Math.max(1, c.length)) + (variance(t) / Math.max(1, t.length)));
  return {
    control_n: c.length,
    treatment_n: t.length,
    control_mean: cm,
    treatment_mean: tm,
    absolute_lift: tm - cm,
    relative_lift: cm === 0 ? null : (tm - cm) / Math.abs(cm),
    z_approx: se === 0 ? null : (tm - cm) / se
  };
}
