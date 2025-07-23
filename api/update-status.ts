import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://uhokqclbxoevlxrzeinf.supabase.co',
  process.env.SUPABASE_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  try {
    const { id, status, raw_subject, processed_at_iso8601 } = req.body;

    if (!raw_subject || !status || !id || !processed_at_iso8601) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract location name from subject (e.g., "Connect Alert - Smitty's: something")
    const locationMatch = raw_subject.split(' - ')[1]?.split(':')[0]?.trim();
    const location = locationMatch || 'Unknown Location';

    const { error } = await supabase
      .from('kiosks')
      .upsert(
        [{ id, location, status, timestamp: processed_at_iso8601 }],
        { onConflict: 'id' } // conflict on ID to update if exists
      );

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to update status' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
