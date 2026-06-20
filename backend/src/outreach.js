function money(n) {
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
}

function propertyLabel(deal) {
  return [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ') || 'Off-market property';
}

export function buildDealEmail(deal) {
  const property = propertyLabel(deal);
  const subject = `New wholesale deal: ${deal.name || property}`;
  const html =
    `<h2>${deal.name || 'New Deal'}</h2>` +
    `<p><strong>Property:</strong> ${property}</p>` +
    `<ul>` +
    `<li>Purchase price: ${money(deal.purchase_price)}</li>` +
    `<li>ARV: ${money(deal.arv)}</li>` +
    `<li>Estimated repairs: ${money(deal.repair_budget)}</li>` +
    `<li>Projected profit: ${money(deal.profit)}</li>` +
    `<li>Deal type: ${(deal.deal_type || 'wholesale').replace('_', ' ')}</li>` +
    `</ul>` +
    `<p>Reply if you're interested and we'll send the full details.</p>`;
  return { subject, html };
}

export async function emailMatchedBuyers(deal, matches, send) {
  const { subject, html } = buildDealEmail(deal);
  const activities = [];
  const results = [];
  let sent = 0, failed = 0, skipped = 0;

  for (const { buyer } of matches) {
    const base = { contact_type: 'buyer', contact_id: buyer.id, contact_name: buyer.name, channel: 'email', subject };
    if (!buyer.email) {
      skipped += 1;
      activities.push({ ...base, status: 'skipped', detail: 'No email on file' });
      results.push({ buyer_id: buyer.id, name: buyer.name, status: 'skipped' });
      continue;
    }
    const r = await send({ to: buyer.email, subject, html });
    if (r.success) {
      sent += 1;
      activities.push({ ...base, status: 'sent', detail: r.id || '' });
      results.push({ buyer_id: buyer.id, name: buyer.name, status: 'sent' });
    } else {
      failed += 1;
      activities.push({ ...base, status: 'failed', detail: r.error || 'send failed' });
      results.push({ buyer_id: buyer.id, name: buyer.name, status: 'failed', error: r.error });
    }
  }

  return { sent, failed, skipped, activities, results };
}

export function dueSellers(sellers, today) {
  return sellers
    .filter((s) => s.next_follow_up && s.next_follow_up <= today)
    .sort((a, b) => a.next_follow_up.localeCompare(b.next_follow_up));
}
