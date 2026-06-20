const DAY_MS = 86400000;

export function campaignRunAts(startISO, offsetsDays) {
  const start = new Date(startISO).getTime();
  return offsetsDays.map((d) => new Date(start + d * DAY_MS).toISOString());
}

export function dueSteps(steps, nowISO) {
  return steps.filter((s) => s.status === 'pending' && s.run_at <= nowISO);
}

export function buildFollowUpDigest(dueList) {
  if (!dueList || dueList.length === 0) return null;
  const rows = dueList.map((s) => `<li>${s.name} — due ${s.next_follow_up}</li>`).join('');
  return {
    subject: `Follow-up digest: ${dueList.length} seller${dueList.length === 1 ? '' : 's'} due`,
    html: `<h2>Sellers due for follow-up</h2><ul>${rows}</ul>`,
  };
}

export function shouldSendDigest(lastDigestDate, today) {
  return lastDigestDate !== today;
}
