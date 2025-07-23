import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { mail_subject, status } = req.body;

  if (!mail_subject || !status) {
    return res.status(400).json({ error: 'Missing machine name or status' });
  }

  const is_online = status.toLowerCase() !== 'error';

  const { error } = await supabase
    .from('kiosk_status')
    .update({
      status,
      is_online,
      last_updated: new Date().toISOString()
    })
    .eq('location', mail_subject);

  if (error) {
    return res.status(500).json({ error: 'Failed to update Supabase' });
  }

  return res.status(200).json({ success: true });
}
